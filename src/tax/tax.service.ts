import { Inject, Injectable } from '@nestjs/common';
import { TaxDomainError } from '../application/domain/errors';
import { Result } from '../application/domain/result';
import { CalculateTaxCommand, TaxResult } from '../application/domain/types';
import type { CalculateTaxPort } from '../application/ports/driving/calculate-tax.port';
import { CALCULATE_TAX_PORT } from '../application/ports/driving/calculate-tax.port';

export type TaxServiceError = TaxDomainError;

/**
 * Application service — sits between the controller and the hexagon.
 *
 * Responsibilities:
 *  - Delegates to the driving port (use case)
 *  - Returns Result from the use case as-is
 */
@Injectable()
export class TaxService {
  constructor(
    @Inject(CALCULATE_TAX_PORT)
    private readonly calculateTax: CalculateTaxPort,
  ) {}

  async calculate(
    command: CalculateTaxCommand,
  ): Promise<Result<TaxResult, TaxServiceError>> {
    return this.calculateTax.execute(command);
  }
}
