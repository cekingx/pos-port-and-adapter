import { TaxJurisdiction } from '../../domain/types';

export const TAX_JURISDICTION_REPOSITORY_PORT = Symbol(
  'TaxJurisdictionRepositoryPort',
);

/**
 * Driven port — the hexagon needs jurisdiction data but doesn't know
 * whether it comes from a database, API, or config file.
 */
export interface TaxJurisdictionRepositoryPort {
  findByCode(code: string): Promise<TaxJurisdiction | null>;
}
