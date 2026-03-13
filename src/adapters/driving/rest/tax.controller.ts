import { Body, Controller, Inject, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { CalculateTaxPort } from '../../../application/ports/driving/calculate-tax.port';
import { CALCULATE_TAX_PORT } from '../../../application/ports/driving/calculate-tax.port';
import { CalculateTaxDto } from './dto/calculate-tax.dto';

/**
 * Driving adapter: translates HTTP requests into driving port calls.
 *
 * This adapter sits OUTSIDE the hexagon. It knows about HTTP/REST
 * but has no business logic — it just converts DTOs to commands
 * and calls the driving port.
 */
@ApiTags('Tax')
@Controller('tax')
export class TaxController {
  constructor(
    @Inject(CALCULATE_TAX_PORT)
    private readonly calculateTax: CalculateTaxPort,
  ) {}

  @Post('calculate')
  @ApiOperation({ summary: 'Calculate tax for a bill with FOC support' })
  async calculate(@Body() dto: CalculateTaxDto) {
    const result = await this.calculateTax.execute({
      billId: dto.billId,
      lineItems: dto.items,
      billLevelFoc: dto.billLevelFoc,
      jurisdictionCode: dto.jurisdictionCode,
      taxMode: dto.taxMode,
      currency: dto.currency,
    });

    return {
      billId: result.billId,
      totalTaxBase: result.totalTaxBase.toDecimal(),
      totalTaxAmount: result.totalTaxAmount.toDecimal(),
      totalCustomerPays: result.totalCustomerPays.toDecimal(),
      totalMerchantAbsorbs: result.totalMerchantAbsorbs.toDecimal(),
      roundingDifference: result.roundingDifference.toDecimal(),
      lineItems: result.lineItemResults.map((lr) => ({
        lineItemId: lr.lineItemId,
        originalPrice: lr.originalPrice.toDecimal(),
        effectiveTaxBase: lr.effectiveTaxBase.toDecimal(),
        taxAmount: lr.taxAmount.toDecimal(),
        customerPays: lr.customerPays.toDecimal(),
        merchantAbsorbs: lr.merchantAbsorbs.toDecimal(),
      })),
      auditTrail: result.auditTrail,
    };
  }
}
