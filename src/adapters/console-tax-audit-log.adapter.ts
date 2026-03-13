import { Injectable, Logger } from '@nestjs/common';
import { TaxResult } from '../domain/types';
import { TaxAuditLogPort } from '../domain/ports';

/**
 * Logs audit trails to console.
 * In production, swap for a database, file, or external service adapter.
 */
@Injectable()
export class ConsoleTaxAuditLogAdapter implements TaxAuditLogPort {
  private readonly logger = new Logger(ConsoleTaxAuditLogAdapter.name);

  async persist(result: TaxResult): Promise<void> {
    this.logger.log(`Audit trail for bill ${result.billId}:`);
    for (const step of result.auditTrail) {
      this.logger.log(
        `  Step ${step.step}: ${step.description} | ${step.inputValue} → ${step.outputValue} [${step.rule}]`,
      );
    }
  }
}
