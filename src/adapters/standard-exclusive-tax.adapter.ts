import { Inject, Injectable } from '@nestjs/common';
import { Money } from '../domain/money';
import {
  AuditStep,
  Bill,
  LineItem,
  LineItemTaxResult,
  TaxResult,
} from '../domain/types';
import type { TaxCalculationPort } from '../domain/ports/tax-calculation.port';
import type { RoundingStrategyPort } from '../domain/ports/rounding-strategy.port';
import { ROUNDING_STRATEGY_PORT } from '../domain/ports/rounding-strategy.port';

/**
 * Primary adapter: calculates tax for exclusive-pricing bills with full FOC support.
 *
 * Follows BR-03 calculation order:
 *   1. Resolve line item prices
 *   2. Apply item-level discounts (already in discountedPrice)
 *   3. Apply FOC flags (item or bill level)
 *   4. Determine tax base per item based on FOC treatment
 *   5. Sum tax bases
 *   6. Apply tax rate to total tax base
 *   7. Apply rounding strategy
 *   8. Produce final tax amount
 */
@Injectable()
export class StandardExclusiveTaxAdapter implements TaxCalculationPort {
  constructor(
    @Inject(ROUNDING_STRATEGY_PORT)
    private readonly roundingStrategy: RoundingStrategyPort,
  ) {}

  calculate(bill: Bill): TaxResult {
    const auditTrail: AuditStep[] = [];
    const currency = bill.lineItems[0]?.originalPrice.currency ?? 'USD';

    // Step 1-3: Resolve effective items (bill-level FOC overrides item-level)
    const effectiveItems = this.resolveEffectiveItems(bill, auditTrail);

    // Step 4: Calculate tax base per item
    const lineItemResults = effectiveItems.map((item) =>
      this.calculateLineItemTax(item, bill, auditTrail),
    );

    // Step 5: Sum tax bases
    const totalTaxBase = lineItemResults.reduce(
      (acc, r) => acc.add(r.effectiveTaxBase),
      Money.zero(currency),
    );

    // Step 6: Apply tax rate to total tax base (NOT sum of per-item taxes)
    const rawTax = totalTaxBase.multiplyByRate(bill.jurisdiction.rate);

    // Step 7: Apply rounding ONCE on total
    const roundedTax = this.roundingStrategy.apply(rawTax);
    const roundingDifference = roundedTax.subtract(rawTax);

    auditTrail.push({
      step: auditTrail.length + 1,
      description: 'Apply rounding to final tax total',
      inputValue: `raw tax ${rawTax.toDecimal()}`,
      outputValue: `rounded tax ${roundedTax.toDecimal()}`,
      rule: 'BR-04: Rounding applied once at final total',
    });

    // Step 8: Compute customer and merchant totals
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
   * If bill has a bill-level FOC, all items inherit that policy.
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
   * Apply the correct FOC tax treatment policy:
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
   * Determine what portion of the total (rounded) tax the customer pays.
   *
   * - If ALL items are merchant-absorbed or zero-rated → customer pays $0 tax
   * - Otherwise → customer pays tax proportional to items they're charged for
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

    // Customer pays tax only on items they're actually paying for
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
