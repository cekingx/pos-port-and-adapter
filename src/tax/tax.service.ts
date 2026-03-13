import { Inject, Injectable } from '@nestjs/common';
import { Money } from '../domain/money';
import { Bill, TaxResult } from '../domain/types';
import type { TaxCalculationPort } from '../domain/ports/tax-calculation.port';
import { TAX_CALCULATION_PORT } from '../domain/ports/tax-calculation.port';
import type { TaxJurisdictionRepositoryPort } from '../domain/ports/tax-jurisdiction-repository.port';
import { TAX_JURISDICTION_REPOSITORY_PORT } from '../domain/ports/tax-jurisdiction-repository.port';
import type { TaxAuditLogPort } from '../domain/ports/tax-audit-log.port';
import { TAX_AUDIT_LOG_PORT } from '../domain/ports/tax-audit-log.port';
import { CalculateTaxDto } from './dto/calculate-tax.dto';

/**
 * Application service — orchestrates the use case by calling ports.
 * Contains no business logic itself; it translates DTOs into domain objects
 * and delegates to the TaxCalculationPort.
 */
@Injectable()
export class TaxService {
  constructor(
    @Inject(TAX_CALCULATION_PORT)
    private readonly taxCalculation: TaxCalculationPort,
    @Inject(TAX_JURISDICTION_REPOSITORY_PORT)
    private readonly jurisdictionRepo: TaxJurisdictionRepositoryPort,
    @Inject(TAX_AUDIT_LOG_PORT)
    private readonly auditLog: TaxAuditLogPort,
  ) {}

  async calculateTax(dto: CalculateTaxDto): Promise<TaxResult> {
    const jurisdiction = await this.jurisdictionRepo.findByCode(
      dto.jurisdictionCode,
    );
    if (!jurisdiction) {
      throw new Error(
        `Unknown tax jurisdiction: ${dto.jurisdictionCode}`,
      );
    }

    const bill: Bill = {
      id: dto.billId,
      lineItems: dto.items.map((item) => ({
        id: item.id,
        name: item.name,
        originalPrice: Money.of(item.price, dto.currency),
        discountedPrice: Money.of(
          item.discountedPrice ?? item.price,
          dto.currency,
        ),
        quantity: item.quantity,
        isFoc: !!item.foc,
        focPolicy: item.foc
          ? { scope: 'item' as const, ...item.foc }
          : null,
      })),
      billLevelFoc: dto.billLevelFoc
        ? { scope: 'bill' as const, ...dto.billLevelFoc }
        : null,
      jurisdiction,
      taxMode: dto.taxMode,
    };

    const result = this.taxCalculation.calculate(bill);

    await this.auditLog.persist(result);

    return result;
  }
}
