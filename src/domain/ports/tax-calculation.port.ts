import { Bill, TaxResult } from '../types';

export const TAX_CALCULATION_PORT = Symbol('TaxCalculationPort');

/**
 * Primary port — driven by the application layer.
 *
 * Invariants guaranteed by any implementation:
 *  - totalCustomerPays is never negative
 *  - totalTaxAmount is never negative
 *  - totalMerchantAbsorbs + totalCustomerPays === full bill value + tax
 *  - auditTrail is always populated, even for $0 results
 */
export interface TaxCalculationPort {
  calculate(bill: Bill): TaxResult;
}
