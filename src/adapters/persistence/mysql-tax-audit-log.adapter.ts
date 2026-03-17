import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { TaxAuditLogPort } from '../../application/ports/driven/tax-audit-log.port';
import type { TaxResult } from '../../application/domain/types';
import { TaxAuditLogEntity } from './entities/tax-audit-log.entity';

@Injectable()
export class MysqlTaxAuditLogAdapter implements TaxAuditLogPort {
  constructor(
    @InjectRepository(TaxAuditLogEntity)
    private readonly repo: Repository<TaxAuditLogEntity>,
  ) {}

  async persist(result: TaxResult): Promise<void> {
    const entity = this.repo.create({
      billId: result.billId,
      totalTaxBase: result.totalTaxBase.toDecimal(),
      totalTaxAmount: result.totalTaxAmount.toDecimal(),
      totalCustomerPays: result.totalCustomerPays.toDecimal(),
      totalMerchantAbsorbs: result.totalMerchantAbsorbs.toDecimal(),
      auditTrail: result.auditTrail,
    });

    await this.repo.save(entity);
  }
}
