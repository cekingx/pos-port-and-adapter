import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('tax_jurisdictions')
export class TaxJurisdictionEntity {
  @PrimaryColumn({ length: 20 })
  code: string;

  @Column({ length: 100 })
  name: string;

  @Column('decimal', { precision: 6, scale: 4 })
  rate: number;
}
