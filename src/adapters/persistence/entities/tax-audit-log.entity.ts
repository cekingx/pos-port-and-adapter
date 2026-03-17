import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('tax_audit_logs')
export class TaxAuditLogEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'bill_id', length: 100 })
  billId: string;

  @Column('decimal', { name: 'total_tax_base', precision: 12, scale: 4 })
  totalTaxBase: number;

  @Column('decimal', { name: 'total_tax_amount', precision: 12, scale: 4 })
  totalTaxAmount: number;

  @Column('decimal', { name: 'total_customer_pays', precision: 12, scale: 4 })
  totalCustomerPays: number;

  @Column('decimal', {
    name: 'total_merchant_absorbs',
    precision: 12,
    scale: 4,
  })
  totalMerchantAbsorbs: number;

  @Column('json', { name: 'audit_trail' })
  auditTrail: object[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
