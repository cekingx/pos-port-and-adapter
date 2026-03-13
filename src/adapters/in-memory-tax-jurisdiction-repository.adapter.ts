import { Injectable } from '@nestjs/common';
import { TaxJurisdiction } from '../domain/types';
import { TaxJurisdictionRepositoryPort } from '../domain/ports';

/**
 * In-memory adapter for tax jurisdictions.
 * In production, swap this for a database or external API adapter —
 * the domain doesn't care which.
 */
@Injectable()
export class InMemoryTaxJurisdictionRepositoryAdapter
  implements TaxJurisdictionRepositoryPort
{
  private readonly jurisdictions: Map<string, TaxJurisdiction> = new Map([
    ['SG', { code: 'SG', rate: 0.09, name: 'Singapore GST' }],
    ['US-CA', { code: 'US-CA', rate: 0.0725, name: 'California Sales Tax' }],
    ['GB', { code: 'GB', rate: 0.2, name: 'UK VAT' }],
    ['DEFAULT', { code: 'DEFAULT', rate: 0.1, name: 'Default 10%' }],
  ]);

  async findByCode(code: string): Promise<TaxJurisdiction | null> {
    return this.jurisdictions.get(code) ?? null;
  }
}
