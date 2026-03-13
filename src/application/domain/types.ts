import { Money } from './money';

// ─── Enums ───────────────────────────────────────────────────────

export type FocReason =
  | 'promotional'
  | 'service_recovery'
  | 'staff_consumption'
  | 'damaged_goods'
  | 'complimentary_bill';

export type FocTaxTreatment =
  | 'zero_rated'
  | 'notional_value'
  | 'merchant_absorbs';

export type FocScope = 'item' | 'bill';

export type RoundingStrategyType = 'half_up' | 'half_even' | 'always_up';

export type TaxMode = 'exclusive' | 'inclusive';

// ─── Core Entities ───────────────────────────────────────────────

export interface FocPolicy {
  scope: FocScope;
  reason: FocReason;
  treatment: FocTaxTreatment;
}

export interface LineItem {
  id: string;
  name: string;
  originalPrice: Money;
  discountedPrice: Money;
  quantity: number;
  isFoc: boolean;
  focPolicy: FocPolicy | null;
}

export interface Bill {
  id: string;
  lineItems: LineItem[];
  billLevelFoc: FocPolicy | null;
  jurisdiction: TaxJurisdiction;
  taxMode: TaxMode;
}

export interface TaxJurisdiction {
  code: string;
  rate: number;
  name: string;
}

// ─── Result Types ────────────────────────────────────────────────

export interface AuditStep {
  step: number;
  description: string;
  inputValue: string;
  outputValue: string;
  rule: string;
}

export interface LineItemTaxResult {
  lineItemId: string;
  originalPrice: Money;
  effectiveTaxBase: Money;
  taxAmount: Money;
  customerPays: Money;
  merchantAbsorbs: Money;
  auditSteps: AuditStep[];
}

export interface TaxResult {
  billId: string;
  lineItemResults: LineItemTaxResult[];
  totalTaxBase: Money;
  totalTaxAmount: Money;
  totalCustomerPays: Money;
  totalMerchantAbsorbs: Money;
  roundingDifference: Money;
  auditTrail: AuditStep[];
}

// ─── Command (input to the driving port) ─────────────────────────

export interface CalculateTaxCommand {
  billId: string;
  lineItems: {
    id: string;
    name: string;
    price: number;
    discountedPrice?: number;
    quantity: number;
    foc?: {
      reason: FocReason;
      treatment: FocTaxTreatment;
    };
  }[];
  billLevelFoc?: {
    reason: FocReason;
    treatment: FocTaxTreatment;
  };
  jurisdictionCode: string;
  taxMode: TaxMode;
  currency: string;
}

// ─── Default FOC Reason → Treatment mapping ─────────────────────

export const DEFAULT_FOC_TREATMENT: Record<FocReason, FocTaxTreatment> = {
  promotional: 'zero_rated',
  service_recovery: 'zero_rated',
  staff_consumption: 'notional_value',
  damaged_goods: 'zero_rated',
  complimentary_bill: 'merchant_absorbs',
};
