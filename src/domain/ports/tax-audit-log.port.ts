import { TaxResult } from '../types';

export const TAX_AUDIT_LOG_PORT = Symbol('TaxAuditLogPort');

/**
 * Secondary port — the domain produces audit trails but doesn't decide
 * where they're stored (console, database, file, external service).
 */
export interface TaxAuditLogPort {
  persist(result: TaxResult): Promise<void>;
}
