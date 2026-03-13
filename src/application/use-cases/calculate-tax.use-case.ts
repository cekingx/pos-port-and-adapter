import { Inject, Injectable } from '@nestjs/common';
import { Money } from '../domain/money';
import {
  AuditStep,
  Bill,
  CalculateTaxCommand,
  LineItem,
  LineItemTaxResult,
  TaxResult,
} from '../domain/types';
import type { CalculateTaxPort } from '../ports/driving/calculate-tax.port';
import type { RoundingStrategyPort } from '../ports/driven/rounding-strategy.port';
import { ROUNDING_STRATEGY_PORT } from '../ports/driven/rounding-strategy.port';
import type { TaxJurisdictionRepositoryPort } from '../ports/driven/tax-jurisdiction-repository.port';
import { TAX_JURISDICTION_REPOSITORY_PORT } from '../ports/driven/tax-jurisdiction-repository.port';
import type { TaxAuditLogPort } from '../ports/driven/tax-audit-log.port';
import { TAX_AUDIT_LOG_PORT } from '../ports/driven/tax-audit-log.port';

/**
 * Use case: Calculate tax for a bill with FOC support.
 *
 * This is the INSIDE of the hexagon — it implements the driving port
 * and uses driven ports to reach external systems.
 *
 * Follows BR-03 calculation order:
 *   1. Resolve line item prices
 *   2. Apply item-level discounts (already in discountedPrice)
 *   3. Apply FOC flags (item or bill level)
 *   4. Determine tax base per item based on FOC treatment
 *   5. Sum tax bases
 *   6. Apply tax rate to total tax base
 *   7. Apply rounding strategy (via driven port)
 *   8. Produce final tax amount
 */
@Injectable()
export class CalculateTaxUseCase implements CalculateTaxPort {
  constructor(
    @Inject(ROUNDING_STRATEGY_PORT)
    private readonly roundingStrategy: RoundingStrategyPort,
    @Inject(TAX_JURISDICTION_REPOSITORY_PORT)
    private readonly jurisdictionRepo: TaxJurisdictionRepositoryPort,
    @Inject(TAX_AUDIT_LOG_PORT)
    private readonly auditLog: TaxAuditLogPort,
  ) {}

  async execute(command: CalculateTaxCommand): Promise<TaxResult> {
    // 1. Look up jurisdiction via driven port
    const jurisdiction = await this.jurisdictionRepo.findByCode(
      command.jurisdictionCode,
    );
    if (!jurisdiction) {
      throw new Error(
        `Unknown tax jurisdiction: ${command.jurisdictionCode}`,
      );
    }

    // 2. Build domain Bill from command
    const bill: Bill = {
      id: command.billId,
      lineItems: command.lineItems.map((item) => ({
        id: item.id,
        name: item.name,
        originalPrice: Money.of(item.price, command.currency),
        discountedPrice: Money.of(
          item.discountedPrice ?? item.price,
          command.currency,
        ),
        quantity: item.quantity,
        isFoc: !!item.foc,
        focPolicy: item.foc
          ? { scope: 'item' as const, ...item.foc }
          : null,
      })),
      billLevelFoc: command.billLevelFoc
        ? { scope: 'bill' as const, ...command.billLevelFoc }
        : null,
      jurisdiction,
      taxMode: command.taxMode,
    };

    // 3. Calculate tax
    const result = this.calculateTax(bill);

    // 4. Persist audit trail via driven port
    await this.auditLog.persist(result);

    return result;
  }

  // ─── Business Logic (BR-01 through BR-04) ───────────────────────

  private calculateTax(bill: Bill): TaxResult {
    const auditTrail: AuditStep[] = [];
    const currency = bill.lineItems[0]?.originalPrice.currency ?? 'USD';

    // BR-01: Resolve effective items (bill-level FOC overrides item-level)
    const effectiveItems = this.resolveEffectiveItems(bill, auditTrail);

    // BR-03 Step 4: Calculate tax base per item
    const lineItemResults = effectiveItems.map((item) =>
      this.calculateLineItemTax(item, bill, auditTrail),
    );

    // BR-03 Step 5: Sum tax bases
    const totalTaxBase = lineItemResults.reduce(
      (acc, r) => acc.add(r.effectiveTaxBase),
      Money.zero(currency),
    );

    // BR-03 Step 6: Apply tax rate to total tax base (NOT sum of per-item taxes)
    const rawTax = totalTaxBase.multiplyByRate(bill.jurisdiction.rate);

    // BR-04: Apply rounding ONCE on total (via driven port)
    const roundedTax = this.roundingStrategy.apply(rawTax);
    const roundingDifference = roundedTax.subtract(rawTax);

    auditTrail.push({
      step: auditTrail.length + 1,
      description: 'Apply rounding to final tax total',
      inputValue: `raw tax ${rawTax.toDecimal()}`,
      outputValue: `rounded tax ${roundedTax.toDecimal()}`,
      rule: 'BR-04: Rounding applied once at final total',
    });

    // BR-03 Step 8: Compute customer and merchant totals
    const customerItemTotal = lineItemResults.reduce(
      (acc, r) => acc.add(r.customerPays),
      Money.zero(currency),
    );

    const customerTaxPortion = this.calculateCustomerTaxPortion(
      lineItemResults,
      roundedTax,
      bill,
    );

    const totalCustomerPays = customerItemTotal.add(customerTaxPortion);

    const totalMerchantAbsorbs = lineItemResults.reduce(
      (acc, r) => acc.add(r.merchantAbsorbs),
      Money.zero(currency),
    );

    return {
      billId: bill.id,
      lineItemResults,
      totalTaxBase,
      totalTaxAmount: roundedTax,
      totalCustomerPays,
      totalMerchantAbsorbs,
      roundingDifference,
      auditTrail,
    };
  }

  /**
   * BR-01: Bill-level FOC takes precedence over item-level FOC.
   */
  private resolveEffectiveItems(
    bill: Bill,
    audit: AuditStep[],
  ): LineItem[] {
    if (bill.billLevelFoc !== null) {
      audit.push({
        step: audit.length + 1,
        description:
          'Bill-level FOC detected — overrides all item FOC flags',
        inputValue: `${bill.lineItems.length} items`,
        outputValue: `Bill FOC applied: reason=${bill.billLevelFoc.reason}, treatment=${bill.billLevelFoc.treatment}`,
        rule: 'BR-01: Bill-level FOC takes precedence',
      });

      return bill.lineItems.map((item) => ({
        ...item,
        isFoc: true,
        focPolicy: bill.billLevelFoc,
      }));
    }

    return bill.lineItems;
  }

  private calculateLineItemTax(
    item: LineItem,
    bill: Bill,
    audit: AuditStep[],
  ): LineItemTaxResult {
    const basePrice = item.discountedPrice;

    if (!item.isFoc || !item.focPolicy) {
      const taxBase = basePrice;

      audit.push({
        step: audit.length + 1,
        description: `[${item.name}] Normal item — full tax base`,
        inputValue: `price ${basePrice.toDecimal()}`,
        outputValue: `tax base ${taxBase.toDecimal()}`,
        rule: 'Standard taxable item',
      });

      return {
        lineItemId: item.id,
        originalPrice: item.originalPrice,
        effectiveTaxBase: taxBase,
        taxAmount: taxBase.multiplyByRate(bill.jurisdiction.rate),
        customerPays: basePrice,
        merchantAbsorbs: Money.zero(basePrice.currency),
        auditSteps: [],
      };
    }

    return this.applyFocTreatment(item, bill, audit);
  }

  /**
   * Apply FOC tax treatment policy:
   *   - zero_rated:       tax base = $0, no liability
   *   - notional_value:   tax base = original price, merchant absorbs item + tax
   *   - merchant_absorbs: tax base = full price, merchant covers everything
   */
  private applyFocTreatment(
    item: LineItem,
    bill: Bill,
    audit: AuditStep[],
  ): LineItemTaxResult {
    const policy = item.focPolicy!;
    const basePrice = item.discountedPrice;
    const currency = basePrice.currency;

    switch (policy.treatment) {
      case 'zero_rated': {
        audit.push({
          step: audit.length + 1,
          description: `[${item.name}] FOC zero_rated — tax base zeroed`,
          inputValue: `original price ${basePrice.toDecimal()}, reason: ${policy.reason}`,
          outputValue: 'tax base $0.00',
          rule: 'Policy A: zero_rated removes item from tax base',
        });

        return {
          lineItemId: item.id,
          originalPrice: item.originalPrice,
          effectiveTaxBase: Money.zero(currency),
          taxAmount: Money.zero(currency),
          customerPays: Money.zero(currency),
          merchantAbsorbs: Money.zero(currency),
          auditSteps: [],
        };
      }

      case 'notional_value': {
        const notionalTax = basePrice.multiplyByRate(bill.jurisdiction.rate);

        audit.push({
          step: audit.length + 1,
          description: `[${item.name}] FOC notional_value — tax base is original price, merchant absorbs`,
          inputValue: `notional price ${basePrice.toDecimal()}, rate ${bill.jurisdiction.rate}`,
          outputValue: `tax base ${basePrice.toDecimal()}, merchant absorbs tax ${notionalTax.toDecimal()}`,
          rule: 'Policy B: notional_value keeps full price as tax base, merchant liability',
        });

        return {
          lineItemId: item.id,
          originalPrice: item.originalPrice,
          effectiveTaxBase: basePrice,
          taxAmount: notionalTax,
          customerPays: Money.zero(currency),
          merchantAbsorbs: basePrice.add(notionalTax),
          auditSteps: [],
        };
      }

      case 'merchant_absorbs': {
        const tax = basePrice.multiplyByRate(bill.jurisdiction.rate);

        audit.push({
          step: audit.length + 1,
          description: `[${item.name}] FOC merchant_absorbs — full price+tax absorbed by merchant`,
          inputValue: `price ${basePrice.toDecimal()}, tax ${tax.toDecimal()}`,
          outputValue: `merchant absorbs ${basePrice.add(tax).toDecimal()}`,
          rule: 'Policy C: merchant_absorbs — merchant covers price and tax',
        });

        return {
          lineItemId: item.id,
          originalPrice: item.originalPrice,
          effectiveTaxBase: basePrice,
          taxAmount: tax,
          customerPays: Money.zero(currency),
          merchantAbsorbs: basePrice.add(tax),
          auditSteps: [],
        };
      }
    }
  }

  /**
   * Determine what portion of the total tax the customer pays.
   * If ALL items are merchant-absorbed or zero-rated → customer pays $0 tax.
   */
  private calculateCustomerTaxPortion(
    results: LineItemTaxResult[],
    roundedTotalTax: Money,
    bill: Bill,
  ): Money {
    const currency = roundedTotalTax.currency;

    const allMerchantOrZero = results.every(
      (r) => r.merchantAbsorbs.isPositive() || r.effectiveTaxBase.isZero(),
    );

    if (allMerchantOrZero) {
      return Money.zero(currency);
    }

    const customerTaxBase = results
      .filter((r) => r.customerPays.isPositive())
      .reduce(
        (acc, r) => acc.add(r.effectiveTaxBase),
        Money.zero(currency),
      );

    return this.roundingStrategy.apply(
      customerTaxBase.multiplyByRate(bill.jurisdiction.rate),
    );
  }
}
