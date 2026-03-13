# POS System Specification
## FOC (Free of Charge) Tax Calculation

**Version:** 1.0.0  
**Status:** Draft  
**Domain:** Tax Calculation — Ports & Adapters Architecture

---

## Table of Contents

1. [Glossary](#glossary)
2. [Business Rules](#business-rules)
3. [FOC Tax Treatment Policies](#foc-tax-treatment-policies)
4. [Scenarios & Expected Outcomes](#scenarios--expected-outcomes)
5. [Domain Model](#domain-model)
6. [Port Definitions](#port-definitions)
7. [Adapter Implementations](#adapter-implementations)
8. [Test Specifications](#test-specifications)
9. [Audit Trail](#audit-trail)
10. [Edge Cases & Decision Table](#edge-cases--decision-table)

---

## Glossary

| Term | Definition |
|---|---|
| **FOC** | Free of Charge — an item or bill given to the customer at $0 cost |
| **FOC Scope** | Whether FOC applies to a single line item (`item`) or the entire bill (`bill`) |
| **Tax Treatment** | The rule that governs how tax is calculated when FOC is involved |
| **Zero-Rated** | The item's tax base becomes $0; no tax is charged or recorded |
| **Notional Value** | The item still has its original price as the tax base; the merchant absorbs the price, but tax runs on full value |
| **Merchant Absorbs** | Tax is calculated normally; customer pays $0 but the tax liability falls on the merchant |
| **Tax Base** | The monetary amount on which tax percentage is applied |
| **Taxable Amount** | The portion of the bill that is subject to tax after FOC adjustments |
| **Money** | A value object storing amounts in integer subunits (e.g. cents) to avoid floating-point errors |
| **Audit Trail** | A step-by-step log of how a tax figure was derived |

---

## Business Rules

### BR-01: FOC Scope
- FOC can be applied at **item level** — one or more specific line items are marked free.
- FOC can be applied at **bill level** — the entire transaction is complimentary.
- A bill **cannot** have both item-level and bill-level FOC active simultaneously. Bill-level FOC takes precedence.

### BR-02: FOC Reason Required
Every FOC must carry a declared reason. The reason influences the default tax treatment.

| Reason | Default Tax Treatment |
|---|---|
| `promotional` | `zero_rated` |
| `service_recovery` | `zero_rated` |
| `staff_consumption` | `notional_value` |
| `damaged_goods` | `zero_rated` |
| `complimentary_bill` | `merchant_absorbs` |

> **Note:** The default can be explicitly overridden per transaction. The reason + treatment must be stored for tax reporting purposes.

### BR-03: Tax Calculation Order
Tax is always calculated **after** FOC adjustments are applied. The sequence is:

```
1. Resolve line item prices
2. Apply item-level discounts (if any)
3. Apply FOC flags (item or bill level)
4. Determine tax base per item based on FOC treatment
5. Sum tax bases
6. Apply tax rate to total tax base
7. Apply rounding strategy
8. Produce final tax amount
```

### BR-04: Rounding
- Rounding is applied **once** at the final tax total, not per line item.
- Default strategy: **half-up** (standard commercial rounding).
- Rounding strategy must be explicit and configurable — never implicit.

### BR-05: Tax-Inclusive Prices
- If the system operates in **tax-inclusive** mode, the tax is extracted from the price, not added on top.
- FOC on a tax-inclusive item at `zero_rated` treatment means both the price and embedded tax become $0.
- FOC on a tax-inclusive item at `notional_value` treatment means the merchant absorbs the full tax-inclusive price; the tax extracted from notional value is recorded as merchant liability.

---

## FOC Tax Treatment Policies

### Policy A: `zero_rated`

The FOC item contributes **$0** to the tax base. It is as if the item does not exist for tax purposes.

```
Item: Coffee — original price $5.00, FOC = true, treatment = zero_rated
Tax base contribution: $0.00
Tax on this item:      $0.00
Customer pays:         $0.00
Merchant absorbs:      $0.00 (tax liability)
```

**Use when:** The item is genuinely excluded from taxation (promotional giveaway, damaged write-off).

---

### Policy B: `notional_value`

The FOC item **retains its original price as the tax base**. The customer pays $0, but the tax is calculated on the full price and is a merchant liability.

```
Item: Coffee — original price $5.00, FOC = true, treatment = notional_value, tax rate = 10%
Tax base contribution: $5.00
Tax on this item:      $0.50
Customer pays:         $0.00
Merchant absorbs:      $5.50 (price + tax)
```

**Use when:** Tax authority requires tax to be paid even on complimentary items (e.g. staff meals in some jurisdictions).

---

### Policy C: `merchant_absorbs`

Tax is calculated normally on the full bill. The customer pays $0 for everything. The merchant absorbs both the item cost and the tax.

```
Bill: Item A $100 + Item B $50, bill-level FOC = true, treatment = merchant_absorbs, tax = 10%
Tax base:        $150.00
Tax amount:      $15.00
Customer pays:   $0.00
Merchant absorbs: $165.00 (full bill + tax)
```

**Use when:** A full bill is comped as goodwill — the business writes off the entire transaction including tax exposure.

---

## Scenarios & Expected Outcomes

### Scenario 1: Single Item FOC — Zero Rated

**Setup:**
- Item A: Burger — $10.00
- Item B: Drink — $3.00 (FOC, reason: `promotional`, treatment: `zero_rated`)
- Tax rate: 10% (exclusive)
- Rounding: half-up

**Calculation:**
```
Tax base = $10.00 + $0.00 = $10.00
Tax      = $10.00 × 10%  = $1.00
Subtotal = $10.00
Total    = $11.00
Customer pays: $11.00
```

**Receipt:**
```
Burger          $10.00
Drink            $0.00  [FOC - Promotional]
─────────────────────
Subtotal        $10.00
Tax (10%)        $1.00
─────────────────────
TOTAL           $11.00
```

---

### Scenario 2: Single Item FOC — Notional Value

**Setup:**
- Item A: Staff Meal — $12.00 (FOC, reason: `staff_consumption`, treatment: `notional_value`)
- Item B: Water — $2.00
- Tax rate: 10% (exclusive)

**Calculation:**
```
Tax base = $12.00 (notional) + $2.00 = $14.00
Tax      = $14.00 × 10%              = $1.40
Customer pays for Item A:              $0.00
Customer pays for Item B:              $2.00
Tax customer pays:                     $0.20  (only on Item B)
Merchant absorbs:                     $12.00 + $1.20 = $13.20
Total customer charge:                 $2.20
```

> **Key distinction from Scenario 1:** The tax base includes the notional value of the FOC item, but only the portion attributable to non-FOC items appears on the customer bill.

---

### Scenario 3: Multiple Items FOC — Mixed Treatments

**Setup:**
- Item A: Steak — $50.00 (taxable, no FOC)
- Item B: Wine — $20.00 (FOC, reason: `promotional`, treatment: `zero_rated`)
- Item C: Dessert — $10.00 (FOC, reason: `service_recovery`, treatment: `zero_rated`)
- Tax rate: 10% (exclusive)

**Calculation:**
```
Tax base = $50.00 + $0.00 + $0.00 = $50.00
Tax      = $50.00 × 10%           = $5.00
Total customer charge              = $55.00
```

---

### Scenario 4: Bill-Level FOC — Merchant Absorbs

**Setup:**
- Item A: Room Service — $80.00
- Item B: Minibar — $30.00
- Bill-level FOC: true, reason: `complimentary_bill`, treatment: `merchant_absorbs`
- Tax rate: 10% (exclusive)

**Calculation:**
```
Tax base         = $80.00 + $30.00 = $110.00
Tax amount       = $110.00 × 10%  = $11.00
Full bill value  = $121.00
Customer pays    = $0.00
Merchant absorbs = $121.00
```

**Receipt:**
```
Room Service     $80.00
Minibar          $30.00
─────────────────────
Subtotal        $110.00
Tax (10%)        $11.00
─────────────────────
TOTAL           $121.00
COMPLIMENTARY    -$121.00
─────────────────────
CUSTOMER PAYS    $0.00
```

---

### Scenario 5: Bill-Level FOC — Zero Rated

**Setup:**
- Item A: Lunch — $40.00
- Item B: Coffee — $5.00
- Bill-level FOC: true, reason: `promotional`, treatment: `zero_rated`
- Tax rate: 10% (exclusive)

**Calculation:**
```
Tax base      = $0.00  (entire bill is zero-rated)
Tax amount    = $0.00
Customer pays = $0.00
Merchant absorbs = $45.00 (item cost only, no tax liability)
```

> **Contrast with Scenario 4:** Under `zero_rated`, the merchant has no tax liability. Under `merchant_absorbs`, the merchant owes $11.00 to the tax authority.

---

### Scenario 6: FOC Item with Pre-existing Discount

**Setup:**
- Item A: Pizza — $20.00, 10% item discount applied → discounted price $18.00
- Item A is then marked FOC (reason: `service_recovery`, treatment: `zero_rated`)
- Tax rate: 10%

**Rule:** FOC overrides the discounted price. The discount is recorded in the audit trail for reporting but does not affect the FOC tax base.

```
Effective tax base for Item A: $0.00
Audit trail records:
  original_price:    $20.00
  discount_applied:  -$2.00
  discounted_price:  $18.00
  foc_override:      $18.00 → $0.00
  tax_base:          $0.00
```

---

### Scenario 7: Tax-Inclusive Pricing with FOC

**Setup:**
- Item A: Coffee — $5.50 (tax-inclusive, embedded tax rate 10%)
  - Price ex-tax: $5.00, embedded tax: $0.50
- Item A is FOC, treatment: `zero_rated`
- Tax rate: 10% inclusive

**Calculation:**
```
FOC zero_rated on tax-inclusive item:
  Tax base:     $0.00
  Extracted tax: $0.00
  Customer pays: $0.00
```

**If treatment were `notional_value`:**
```
  Notional tax-inclusive price: $5.50
  Extracted notional tax:        $0.50
  Customer pays:                 $0.00
  Merchant absorbs (tax only):   $0.50
```

---

## Domain Model

```typescript
// ─── Value Objects ───────────────────────────────────────────────

/**
 * Immutable monetary value stored in integer subunits.
 * Prevents floating-point arithmetic errors.
 */
class Money {
  private constructor(
    private readonly subunits: bigint,  // e.g. cents
    readonly currency: string
  ) {}

  static of(amount: number, currency: string): Money {
    return new Money(BigInt(Math.round(amount * 100)), currency);
  }

  static zero(currency: string): Money {
    return new Money(0n, currency);
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.subunits + other.subunits, this.currency);
  }

  multiplyByRate(rate: number): Money {
    // Use integer arithmetic: multiply then divide to preserve precision
    const scaled = this.subunits * BigInt(Math.round(rate * 10000));
    return new Money(scaled / 10000n, this.currency);
  }

  round(strategy: RoundingStrategy): Money {
    // Rounding is applied to the final total, not per-item
    return strategy.apply(this);
  }

  toDecimal(): number {
    return Number(this.subunits) / 100;
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error(`Currency mismatch: ${this.currency} vs ${other.currency}`);
    }
  }
}

// ─── Enums ───────────────────────────────────────────────────────

type FocReason =
  | 'promotional'
  | 'service_recovery'
  | 'staff_consumption'
  | 'damaged_goods'
  | 'complimentary_bill';

type FocTaxTreatment =
  | 'zero_rated'       // Tax base = $0, no tax liability
  | 'notional_value'   // Tax base = original price, merchant absorbs
  | 'merchant_absorbs'; // Tax calculated normally, merchant covers all

type FocScope = 'item' | 'bill';

type RoundingStrategyType = 'half_up' | 'half_even' | 'always_up';

type TaxMode = 'exclusive' | 'inclusive';

// ─── Core Entities ───────────────────────────────────────────────

interface FocPolicy {
  scope: FocScope;
  reason: FocReason;
  treatment: FocTaxTreatment;
}

interface LineItem {
  id: string;
  name: string;
  originalPrice: Money;
  discountedPrice: Money;  // equals originalPrice if no discount applied
  quantity: number;
  isFoc: boolean;
  focPolicy: FocPolicy | null;  // required when isFoc = true
}

interface Bill {
  id: string;
  lineItems: LineItem[];
  billLevelFoc: FocPolicy | null;  // null = no bill-level FOC
  jurisdiction: TaxJurisdiction;
  taxMode: TaxMode;
}

interface TaxJurisdiction {
  code: string;
  rate: number;           // e.g. 0.10 for 10%
  name: string;
}

// ─── Result Types ────────────────────────────────────────────────

interface LineItemTaxResult {
  lineItemId: string;
  originalPrice: Money;
  effectiveTaxBase: Money;    // price used for tax calculation
  taxAmount: Money;
  customerPays: Money;
  merchantAbsorbs: Money;
  auditSteps: AuditStep[];
}

interface TaxResult {
  billId: string;
  lineItemResults: LineItemTaxResult[];
  totalTaxBase: Money;
  totalTaxAmount: Money;
  totalCustomerPays: Money;
  totalMerchantAbsorbs: Money;
  roundingDifference: Money;  // difference introduced by rounding
  auditTrail: AuditStep[];
}

interface AuditStep {
  step: number;
  description: string;
  inputValue: string;
  outputValue: string;
  rule: string;
}
```

---

## Port Definitions

```typescript
// ─── PRIMARY PORT (driven by application) ────────────────────────

interface TaxCalculationPort {
  /**
   * Calculate tax for a bill, respecting FOC policies.
   * 
   * Invariants guaranteed by this port:
   *  - totalCustomerPays is never negative
   *  - totalTaxAmount is never negative
   *  - totalMerchantAbsorbs + totalCustomerPays === full bill value + tax
   *  - auditTrail is always populated, even for $0 results
   */
  calculate(bill: Bill): TaxResult;
}

// ─── SECONDARY PORT (driven by domain, implemented by infra) ─────

interface RoundingStrategyPort {
  apply(amount: Money): Money;
}

interface TaxJurisdictionRepositoryPort {
  findByCode(code: string): TaxJurisdiction | null;
}

interface TaxAuditLogPort {
  persist(result: TaxResult): void;
}
```

---

## Adapter Implementations

### Adapter 1: Standard Tax Adapter (Exclusive)

Handles the most common case: tax added on top of price, with full FOC treatment support.

```typescript
class StandardExclusiveTaxAdapter implements TaxCalculationPort {

  constructor(
    private readonly roundingStrategy: RoundingStrategyPort
  ) {}

  calculate(bill: Bill): TaxResult {
    const auditTrail: AuditStep[] = [];
    const currency = bill.lineItems[0].originalPrice.currency;

    // Step 1: Resolve effective items
    const effectiveItems = this.resolveEffectiveItems(bill, auditTrail);

    // Step 2: Calculate tax base per item
    const lineItemResults = effectiveItems.map((item, index) =>
      this.calculateLineItemTax(item, bill, index + 1, auditTrail)
    );

    // Step 3: Sum tax bases
    const totalTaxBase = lineItemResults.reduce(
      (acc, r) => acc.add(r.effectiveTaxBase),
      Money.zero(currency)
    );

    // Step 4: Calculate total tax (ONCE, not per-item sum)
    const rawTax = totalTaxBase.multiplyByRate(bill.jurisdiction.rate);

    // Step 5: Apply rounding ONCE on total
    const roundedTax = this.roundingStrategy.apply(rawTax);
    const roundingDifference = roundedTax.add(rawTax.negate());

    auditTrail.push({
      step: auditTrail.length + 1,
      description: 'Apply rounding to final tax total',
      inputValue: `raw tax ${rawTax.toDecimal()}`,
      outputValue: `rounded tax ${roundedTax.toDecimal()}`,
      rule: 'BR-04: Rounding applied once at final total'
    });

    // Step 6: Sum customer payments and merchant absorptions
    const totalCustomerPays = lineItemResults.reduce(
      (acc, r) => acc.add(r.customerPays),
      Money.zero(currency)
    ).add(this.customerTaxPortion(lineItemResults, roundedTax, bill));

    const totalMerchantAbsorbs = lineItemResults.reduce(
      (acc, r) => acc.add(r.merchantAbsorbs),
      Money.zero(currency)
    );

    return {
      billId: bill.id,
      lineItemResults,
      totalTaxBase,
      totalTaxAmount: roundedTax,
      totalCustomerPays,
      totalMerchantAbsorbs,
      roundingDifference,
      auditTrail
    };
  }

  private resolveEffectiveItems(bill: Bill, audit: AuditStep[]): LineItem[] {
    // Bill-level FOC overrides all item-level FOC
    if (bill.billLevelFoc !== null) {
      audit.push({
        step: audit.length + 1,
        description: 'Bill-level FOC detected — overrides all item FOC flags',
        inputValue: `${bill.lineItems.length} items`,
        outputValue: `Bill FOC applied: reason=${bill.billLevelFoc.reason}, treatment=${bill.billLevelFoc.treatment}`,
        rule: 'BR-01: Bill-level FOC takes precedence'
      });
      // Return all items with bill-level FOC policy applied
      return bill.lineItems.map(item => ({
        ...item,
        isFoc: true,
        focPolicy: bill.billLevelFoc
      }));
    }
    return bill.lineItems;
  }

  private calculateLineItemTax(
    item: LineItem,
    bill: Bill,
    stepOffset: number,
    audit: AuditStep[]
  ): LineItemTaxResult {
    const basePrice = item.discountedPrice;

    if (!item.isFoc || !item.focPolicy) {
      // Normal item — full tax applies
      const taxBase = basePrice;
      const tax = taxBase.multiplyByRate(bill.jurisdiction.rate);

      audit.push({
        step: audit.length + 1,
        description: `[${item.name}] Normal item — full tax base`,
        inputValue: `price ${basePrice.toDecimal()}`,
        outputValue: `tax base ${taxBase.toDecimal()}`,
        rule: 'Standard taxable item'
      });

      return {
        lineItemId: item.id,
        originalPrice: item.originalPrice,
        effectiveTaxBase: taxBase,
        taxAmount: tax,
        customerPays: basePrice,
        merchantAbsorbs: Money.zero(basePrice.currency),
        auditSteps: []
      };
    }

    // FOC item — apply treatment
    return this.applyFocTreatment(item, bill, audit);
  }

  private applyFocTreatment(
    item: LineItem,
    bill: Bill,
    audit: AuditStep[]
  ): LineItemTaxResult {
    const policy = item.focPolicy!;
    const basePrice = item.discountedPrice;
    const currency = basePrice.currency;

    switch (policy.treatment) {

      case 'zero_rated': {
        audit.push({
          step: audit.length + 1,
          description: `[${item.name}] FOC zero_rated — tax base zeroed`,
          inputValue: `original price ${basePrice.toDecimal()}, reason: ${policy.reason}`,
          outputValue: 'tax base $0.00',
          rule: 'Policy A: zero_rated removes item from tax base'
        });
        return {
          lineItemId: item.id,
          originalPrice: item.originalPrice,
          effectiveTaxBase: Money.zero(currency),
          taxAmount: Money.zero(currency),
          customerPays: Money.zero(currency),
          merchantAbsorbs: Money.zero(currency),
          auditSteps: []
        };
      }

      case 'notional_value': {
        const notionalTax = basePrice.multiplyByRate(bill.jurisdiction.rate);
        audit.push({
          step: audit.length + 1,
          description: `[${item.name}] FOC notional_value — tax base is original price, merchant absorbs`,
          inputValue: `notional price ${basePrice.toDecimal()}, rate ${bill.jurisdiction.rate}`,
          outputValue: `tax base ${basePrice.toDecimal()}, merchant absorbs tax ${notionalTax.toDecimal()}`,
          rule: 'Policy B: notional_value keeps full price as tax base, merchant liability'
        });
        return {
          lineItemId: item.id,
          originalPrice: item.originalPrice,
          effectiveTaxBase: basePrice,
          taxAmount: notionalTax,
          customerPays: Money.zero(currency),
          merchantAbsorbs: basePrice.add(notionalTax),
          auditSteps: []
        };
      }

      case 'merchant_absorbs': {
        const tax = basePrice.multiplyByRate(bill.jurisdiction.rate);
        audit.push({
          step: audit.length + 1,
          description: `[${item.name}] FOC merchant_absorbs — full price+tax absorbed by merchant`,
          inputValue: `price ${basePrice.toDecimal()}, tax ${tax.toDecimal()}`,
          outputValue: `merchant absorbs ${basePrice.add(tax).toDecimal()}`,
          rule: 'Policy C: merchant_absorbs — merchant covers price and tax'
        });
        return {
          lineItemId: item.id,
          originalPrice: item.originalPrice,
          effectiveTaxBase: basePrice,
          taxAmount: tax,
          customerPays: Money.zero(currency),
          merchantAbsorbs: basePrice.add(tax),
          auditSteps: []
        };
      }
    }
  }

  // Helper: determine what portion of total tax the customer actually pays
  private customerTaxPortion(
    results: LineItemTaxResult[],
    totalTax: Money,
    bill: Bill
  ): Money {
    // If all items are merchant_absorbs or zero_rated, customer pays no tax
    const allMerchantOrZero = results.every(r =>
      r.merchantAbsorbs.toDecimal() > 0 || r.effectiveTaxBase.toDecimal() === 0
    );
    if (allMerchantOrZero) return Money.zero(totalTax.currency);

    // Proportional tax allocation: customer pays tax on items they are charged for
    const customerTaxBase = results
      .filter(r => r.customerPays.toDecimal() > 0)
      .reduce((acc, r) => acc.add(r.effectiveTaxBase), Money.zero(totalTax.currency));

    return customerTaxBase.multiplyByRate(bill.jurisdiction.rate);
  }
}
```

---

### Adapter 2: Mock Tax Adapter (for Testing)

```typescript
class MockTaxAdapter implements TaxCalculationPort {
  private fixedResult: Partial<TaxResult> = {};

  givenResult(result: Partial<TaxResult>): this {
    this.fixedResult = result;
    return this;
  }

  calculate(bill: Bill): TaxResult {
    return {
      billId: bill.id,
      lineItemResults: [],
      totalTaxBase: Money.zero('USD'),
      totalTaxAmount: Money.zero('USD'),
      totalCustomerPays: Money.zero('USD'),
      totalMerchantAbsorbs: Money.zero('USD'),
      roundingDifference: Money.zero('USD'),
      auditTrail: [{ step: 1, description: 'Mock', inputValue: '-', outputValue: '-', rule: 'mock' }],
      ...this.fixedResult
    };
  }
}
```

---

## Test Specifications

### TC-01: Normal Bill, No FOC

```typescript
describe('TC-01: Normal bill with no FOC', () => {
  it('calculates tax on full subtotal', () => {
    const bill = buildBill({
      items: [
        { name: 'Burger', price: 10.00 },
        { name: 'Fries',  price: 4.00  }
      ],
      taxRate: 0.10
    });

    const result = adapter.calculate(bill);

    expect(result.totalTaxBase.toDecimal()).toBe(14.00);
    expect(result.totalTaxAmount.toDecimal()).toBe(1.40);
    expect(result.totalCustomerPays.toDecimal()).toBe(15.40);
    expect(result.totalMerchantAbsorbs.toDecimal()).toBe(0.00);
  });
});
```

---

### TC-02: Item FOC — Zero Rated

```typescript
describe('TC-02: Item-level FOC, zero_rated', () => {
  it('excludes FOC item from tax base', () => {
    const bill = buildBill({
      items: [
        { name: 'Burger', price: 10.00 },
        { name: 'Drink',  price: 3.00, foc: { reason: 'promotional', treatment: 'zero_rated' } }
      ],
      taxRate: 0.10
    });

    const result = adapter.calculate(bill);

    expect(result.totalTaxBase.toDecimal()).toBe(10.00);
    expect(result.totalTaxAmount.toDecimal()).toBe(1.00);
    expect(result.totalCustomerPays.toDecimal()).toBe(11.00);
    expect(result.totalMerchantAbsorbs.toDecimal()).toBe(0.00);
  });
});
```

---

### TC-03: Item FOC — Notional Value

```typescript
describe('TC-03: Item-level FOC, notional_value', () => {
  it('includes FOC item in tax base, merchant absorbs item + tax', () => {
    const bill = buildBill({
      items: [
        { name: 'Water',     price: 2.00 },
        { name: 'StaffMeal', price: 12.00, foc: { reason: 'staff_consumption', treatment: 'notional_value' } }
      ],
      taxRate: 0.10
    });

    const result = adapter.calculate(bill);

    expect(result.totalTaxBase.toDecimal()).toBe(14.00);
    expect(result.totalTaxAmount.toDecimal()).toBe(1.40);
    // Customer only pays for Water + tax on Water
    expect(result.totalCustomerPays.toDecimal()).toBe(2.20);
    // Merchant absorbs staff meal + its tax
    expect(result.totalMerchantAbsorbs.toDecimal()).toBe(13.20);
  });
});
```

---

### TC-04: Bill-Level FOC — Merchant Absorbs

```typescript
describe('TC-04: Bill-level FOC, merchant_absorbs', () => {
  it('customer pays nothing, merchant absorbs full bill including tax', () => {
    const bill = buildBill({
      items: [
        { name: 'RoomService', price: 80.00 },
        { name: 'Minibar',     price: 30.00 }
      ],
      billLevelFoc: { reason: 'complimentary_bill', treatment: 'merchant_absorbs' },
      taxRate: 0.10
    });

    const result = adapter.calculate(bill);

    expect(result.totalTaxBase.toDecimal()).toBe(110.00);
    expect(result.totalTaxAmount.toDecimal()).toBe(11.00);
    expect(result.totalCustomerPays.toDecimal()).toBe(0.00);
    expect(result.totalMerchantAbsorbs.toDecimal()).toBe(121.00);
  });
});
```

---

### TC-05: Bill-Level FOC — Zero Rated

```typescript
describe('TC-05: Bill-level FOC, zero_rated', () => {
  it('customer pays nothing, no tax liability for merchant', () => {
    const bill = buildBill({
      items: [
        { name: 'Lunch',  price: 40.00 },
        { name: 'Coffee', price: 5.00  }
      ],
      billLevelFoc: { reason: 'promotional', treatment: 'zero_rated' },
      taxRate: 0.10
    });

    const result = adapter.calculate(bill);

    expect(result.totalTaxBase.toDecimal()).toBe(0.00);
    expect(result.totalTaxAmount.toDecimal()).toBe(0.00);
    expect(result.totalCustomerPays.toDecimal()).toBe(0.00);
    expect(result.totalMerchantAbsorbs.toDecimal()).toBe(0.00);
  });
});
```

---

### TC-06: FOC Cannot Make Total Negative (Property Test)

```typescript
describe('TC-06: Invariant — totals never negative', () => {
  it('holds for any combination of FOC flags and treatments', () => {
    fc.assert(fc.property(
      arbitraryBill(),
      (bill) => {
        const result = adapter.calculate(bill);
        expect(result.totalCustomerPays.toDecimal()).toBeGreaterThanOrEqual(0);
        expect(result.totalTaxAmount.toDecimal()).toBeGreaterThanOrEqual(0);
        expect(result.totalMerchantAbsorbs.toDecimal()).toBeGreaterThanOrEqual(0);
      }
    ));
  });
});
```

---

### TC-07: Rounding Applied Once, Not Per Item

```typescript
describe('TC-07: Rounding applied once on total, not summed from per-item', () => {
  it('avoids rounding accumulation error', () => {
    // 3 items × $1.00 × 10% = $0.10 each
    // Per-item rounding: $0.10 + $0.10 + $0.10 = $0.30 ✓ (no issue here)
    // Edge case: 3 items × $0.333 × 10% = $0.0333 each
    // Wrong: round($0.034) × 3 = $0.102
    // Correct: round($0.0999) = $0.10
    const bill = buildBill({
      items: [
        { name: 'A', price: 0.333 },
        { name: 'B', price: 0.333 },
        { name: 'C', price: 0.333 }
      ],
      taxRate: 0.10
    });

    const result = adapter.calculate(bill);
    // Total tax base = $0.999, tax = $0.0999, rounded = $0.10
    expect(result.totalTaxAmount.toDecimal()).toBe(0.10);
  });
});
```

---

## Audit Trail

Every `TaxResult` includes a complete audit trail. Example output for Scenario 2:

```json
{
  "billId": "bill-001",
  "auditTrail": [
    {
      "step": 1,
      "description": "[StaffMeal] FOC notional_value — tax base is original price, merchant absorbs",
      "inputValue": "notional price 12.00, rate 0.10",
      "outputValue": "tax base 12.00, merchant absorbs tax 1.20",
      "rule": "Policy B: notional_value keeps full price as tax base"
    },
    {
      "step": 2,
      "description": "[Water] Normal item — full tax base",
      "inputValue": "price 2.00",
      "outputValue": "tax base 2.00",
      "rule": "Standard taxable item"
    },
    {
      "step": 3,
      "description": "Apply rounding to final tax total",
      "inputValue": "raw tax 1.4",
      "outputValue": "rounded tax 1.40",
      "rule": "BR-04: Rounding applied once at final total"
    }
  ]
}
```

This audit trail serves as the **source of truth** when a PO disputes a calculated total. The engineer can point to a specific step and rule reference rather than reverse-engineering a black-box formula.

---

## Edge Cases & Decision Table

| Scenario | Bill FOC | Item FOC | Treatment | Tax Base | Customer Pays | Merchant Absorbs Tax |
|---|---|---|---|---|---|---|
| Normal bill | ✗ | ✗ | — | Full price | Full + tax | $0 |
| Item FOC promo | ✗ | ✓ | `zero_rated` | Non-FOC items only | Non-FOC + tax | $0 |
| Item FOC staff | ✗ | ✓ | `notional_value` | All items incl. FOC | Non-FOC + tax | FOC item tax |
| Full bill comped | ✓ | — | `merchant_absorbs` | Full bill | $0 | Full tax |
| Full bill promo | ✓ | — | `zero_rated` | $0 | $0 | $0 |
| Bill FOC + item FOC | ✓ overrides | ignored | bill-level | Bill-level rules | Bill-level rules | Bill-level rules |
| FOC + discount | ✗ | ✓ | any | Discount recorded, FOC applied after | $0 | Based on treatment |
| All items FOC | ✗ | all ✓ | `zero_rated` | $0 | $0 | $0 |
| All items FOC | ✗ | all ✓ | `notional_value` | Full original prices | $0 | All tax |

---

*Specification maintained by: Engineering & Product*  
*Review required when: Tax jurisdiction changes, new FOC reason types added, rounding strategy updated*
