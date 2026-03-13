import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { TaxService } from './tax.service';
import { CalculateTaxDto } from './dto/calculate-tax.dto';

@ApiTags('Tax')
@Controller('tax')
export class TaxController {
  constructor(private readonly taxService: TaxService) {}

  @Post('calculate')
  @ApiOperation({ summary: 'Calculate tax for a bill with FOC support' })
  async calculate(@Body() dto: CalculateTaxDto) {
    const result = await this.taxService.calculateTax(dto);

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
