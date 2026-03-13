import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  FocReason,
  FocTaxTreatment,
  TaxMode,
} from '../../domain';

export class FocDto {
  @ApiProperty({
    enum: ['promotional', 'service_recovery', 'staff_consumption', 'damaged_goods', 'complimentary_bill'],
    example: 'promotional',
  })
  reason: FocReason;

  @ApiProperty({
    enum: ['zero_rated', 'notional_value', 'merchant_absorbs'],
    example: 'zero_rated',
  })
  treatment: FocTaxTreatment;
}

export class LineItemDto {
  @ApiProperty({ example: 'item-1' })
  id: string;

  @ApiProperty({ example: 'Burger' })
  name: string;

  @ApiProperty({ example: 10.0, description: 'Original price' })
  price: number;

  @ApiPropertyOptional({ example: 9.0, description: 'Price after discount (defaults to price)' })
  discountedPrice?: number;

  @ApiProperty({ example: 1 })
  quantity: number;

  @ApiPropertyOptional({ type: FocDto, description: 'FOC policy for this item' })
  foc?: FocDto;
}

export class CalculateTaxDto {
  @ApiProperty({ example: 'bill-001' })
  billId: string;

  @ApiProperty({ type: [LineItemDto] })
  items: LineItemDto[];

  @ApiPropertyOptional({ type: FocDto, description: 'Bill-level FOC overrides all item FOC' })
  billLevelFoc?: FocDto;

  @ApiProperty({ example: 'DEFAULT', description: 'Tax jurisdiction code' })
  jurisdictionCode: string;

  @ApiProperty({ enum: ['exclusive', 'inclusive'], example: 'exclusive' })
  taxMode: TaxMode;

  @ApiProperty({ example: 'USD' })
  currency: string;
}
