export type MoneyError =
  | { type: 'CURRENCY_MISMATCH'; left: string; right: string };

export type TaxDomainError =
  | MoneyError
  | { type: 'JURISDICTION_NOT_FOUND'; jurisdictionCode: string };
