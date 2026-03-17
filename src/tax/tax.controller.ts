import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { TaxServiceError, TaxService } from './tax.service';
import { CalculateTaxDto } from './dto/calculate-tax.dto';

const ERROR_STATUS_MAP: Record<TaxServiceError['type'], HttpStatus> = {
  JURISDICTION_NOT_FOUND: HttpStatus.NOT_FOUND,
  CURRENCY_MISMATCH: HttpStatus.UNPROCESSABLE_ENTITY,
};

/**
 * Driving adapter: translates HTTP requests into driving port calls.
 *
 * This adapter sits OUTSIDE the hexagon. It knows about HTTP/REST
 * but has no business logic — it just converts DTOs to commands
 * and calls the service, then maps errors to HTTP status codes.
 */
@ApiTags('Tax')
@Controller('tax')
export class TaxController {
  constructor(private readonly taxService: TaxService) {}

  @Post('calculate')
  @ApiOperation({ summary: 'Calculate tax for a bill with FOC support' })
  async calculate(@Body() dto: CalculateTaxDto) {
    const result = await this.taxService.calculate({
      billId: dto.billId,
      lineItems: dto.items,
      billLevelFoc: dto.billLevelFoc,
      jurisdictionCode: dto.jurisdictionCode,
      taxMode: dto.taxMode,
      currency: dto.currency,
    });

    if (!result.ok) {
      throw new HttpException(
        result.error,
        ERROR_STATUS_MAP[result.error.type],
      );
    }

    const data = result.value;
    return {
      billId: data.billId,
      totalTaxBase: data.totalTaxBase.toDecimal(),
      totalTaxAmount: data.totalTaxAmount.toDecimal(),
      totalCustomerPays: data.totalCustomerPays.toDecimal(),
      totalMerchantAbsorbs: data.totalMerchantAbsorbs.toDecimal(),
      roundingDifference: data.roundingDifference.toDecimal(),
      lineItems: data.lineItemResults.map((lr) => ({
        lineItemId: lr.lineItemId,
        originalPrice: lr.originalPrice.toDecimal(),
        effectiveTaxBase: lr.effectiveTaxBase.toDecimal(),
        taxAmount: lr.taxAmount.toDecimal(),
        customerPays: lr.customerPays.toDecimal(),
        merchantAbsorbs: lr.merchantAbsorbs.toDecimal(),
      })),
      auditTrail: data.auditTrail,
    };
  }
}
