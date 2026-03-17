import { TaxDomainError } from '../../domain/errors';
import { Result } from '../../domain/result';
import { CalculateTaxCommand, TaxResult } from '../../domain/types';

export const CALCULATE_TAX_PORT = Symbol('CalculateTaxPort');

/**
 * Driving port — the entry point into the hexagon.
 *
 * External actors (REST controller, CLI, tests) call this port.
 * The hexagon implements it via a use case.
 *
 * Invariants guaranteed:
 *  - totalCustomerPays is never negative
 *  - totalTaxAmount is never negative
 *  - auditTrail is always populated, even for $0 results
 */
export interface CalculateTaxPort {
  execute(
    command: CalculateTaxCommand,
  ): Promise<Result<TaxResult, TaxDomainError>>;
}
