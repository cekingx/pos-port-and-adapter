import { TaxResult } from '../../domain/types';

export const TAX_AUDIT_LOG_PORT = Symbol('TaxAuditLogPort');

/**
 * Driven port — the hexagon produces audit trails but doesn't decide
 * where they're stored (console, database, file, external service).
 */
export interface TaxAuditLogPort {
  persist(result: TaxResult): Promise<void>;
}
