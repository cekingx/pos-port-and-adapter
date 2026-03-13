import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { TaxJurisdictionRepositoryPort } from '../../../application/ports/driven/tax-jurisdiction-repository.port';
import type { TaxJurisdiction } from '../../../application/domain/types';
import { TaxJurisdictionEntity } from './entities/tax-jurisdiction.entity';

@Injectable()
export class MysqlTaxJurisdictionRepositoryAdapter
  implements TaxJurisdictionRepositoryPort
{
  constructor(
    @InjectRepository(TaxJurisdictionEntity)
    private readonly repo: Repository<TaxJurisdictionEntity>,
  ) {}

  async findByCode(code: string): Promise<TaxJurisdiction | null> {
    const entity = await this.repo.findOneBy({ code });
    if (!entity) return null;
    return {
      code: entity.code,
      name: entity.name,
      rate: Number(entity.rate),
    };
  }
}
