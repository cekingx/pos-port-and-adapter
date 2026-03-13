import { Money } from '../../domain/money';
import { Bill, FocPolicy } from '../../domain/types';
import { StandardExclusiveTaxAdapter } from '../standard-exclusive-tax.adapter';
import { HalfUpRoundingAdapter } from '../half-up-rounding.adapter';

// ─── Test helpers ────────────────────────────────────────────────

interface ItemDef {
  name: string;
  price: number;
  discountedPrice?: number;
  foc?: { reason: FocPolicy['reason']; treatment: FocPolicy['treatment'] };
}

interface BillDef {
  items: ItemDef[];
  taxRate: number;
  billLevelFoc?: { reason: FocPolicy['reason']; treatment: FocPolicy['treatment'] };
}

function buildBill(def: BillDef): Bill {
  return {
    id: 'bill-test',
    lineItems: def.items.map((item, i) => ({
      id: `item-${i}`,
      name: item.name,
      originalPrice: Money.of(item.price, 'USD'),
      discountedPrice: Money.of(item.discountedPrice ?? item.price, 'USD'),
      quantity: 1,
      isFoc: !!item.foc,
      focPolicy: item.foc ? { scope: 'item' as const, ...item.foc } : null,
    })),
    billLevelFoc: def.billLevelFoc
      ? { scope: 'bill' as const, ...def.billLevelFoc }
      : null,
    jurisdiction: { code: 'TEST', rate: def.taxRate, name: 'Test' },
    taxMode: 'exclusive',
  };
}

// ─── Setup ───────────────────────────────────────────────────────

const roundingStrategy = new HalfUpRoundingAdapter();
const adapter = new StandardExclusiveTaxAdapter(roundingStrategy);

// ─── TC-01: Normal Bill, No FOC ─────────────────────────────────

describe('TC-01: Normal bill with no FOC', () => {
  it('calculates tax on full subtotal', () => {
    const bill = buildBill({
      items: [
        { name: 'Burger', price: 10.0 },
        { name: 'Fries', price: 4.0 },
      ],
      taxRate: 0.1,
    });

    const result = adapter.calculate(bill);

    expect(result.totalTaxBase.toDecimal()).toBe(14.0);
    expect(result.totalTaxAmount.toDecimal()).toBe(1.4);
    expect(result.totalCustomerPays.toDecimal()).toBe(15.4);
    expect(result.totalMerchantAbsorbs.toDecimal()).toBe(0.0);
  });
});

// ─── TC-02: Item FOC — Zero Rated ───────────────────────────────

describe('TC-02: Item-level FOC, zero_rated', () => {
  it('excludes FOC item from tax base', () => {
    const bill = buildBill({
      items: [
        { name: 'Burger', price: 10.0 },
        {
          name: 'Drink',
          price: 3.0,
          foc: { reason: 'promotional', treatment: 'zero_rated' },
        },
      ],
      taxRate: 0.1,
    });

    const result = adapter.calculate(bill);

    expect(result.totalTaxBase.toDecimal()).toBe(10.0);
    expect(result.totalTaxAmount.toDecimal()).toBe(1.0);
    expect(result.totalCustomerPays.toDecimal()).toBe(11.0);
    expect(result.totalMerchantAbsorbs.toDecimal()).toBe(0.0);
  });
});

// ─── TC-03: Item FOC — Notional Value ───────────────────────────

describe('TC-03: Item-level FOC, notional_value', () => {
  it('includes FOC item in tax base, merchant absorbs item + tax', () => {
    const bill = buildBill({
      items: [
        { name: 'Water', price: 2.0 },
        {
          name: 'StaffMeal',
          price: 12.0,
          foc: { reason: 'staff_consumption', treatment: 'notional_value' },
        },
      ],
      taxRate: 0.1,
    });

    const result = adapter.calculate(bill);

    expect(result.totalTaxBase.toDecimal()).toBe(14.0);
    expect(result.totalTaxAmount.toDecimal()).toBe(1.4);
    expect(result.totalCustomerPays.toDecimal()).toBe(2.2);
    expect(result.totalMerchantAbsorbs.toDecimal()).toBe(13.2);
  });
});

// ─── TC-04: Bill-Level FOC — Merchant Absorbs ───────────────────

describe('TC-04: Bill-level FOC, merchant_absorbs', () => {
  it('customer pays nothing, merchant absorbs full bill including tax', () => {
    const bill = buildBill({
      items: [
        { name: 'RoomService', price: 80.0 },
        { name: 'Minibar', price: 30.0 },
      ],
      billLevelFoc: {
        reason: 'complimentary_bill',
        treatment: 'merchant_absorbs',
      },
      taxRate: 0.1,
    });

    const result = adapter.calculate(bill);

    expect(result.totalTaxBase.toDecimal()).toBe(110.0);
    expect(result.totalTaxAmount.toDecimal()).toBe(11.0);
    expect(result.totalCustomerPays.toDecimal()).toBe(0.0);
    expect(result.totalMerchantAbsorbs.toDecimal()).toBe(121.0);
  });
});

// ─── TC-05: Bill-Level FOC — Zero Rated ─────────────────────────

describe('TC-05: Bill-level FOC, zero_rated', () => {
  it('customer pays nothing, no tax liability for merchant', () => {
    const bill = buildBill({
      items: [
        { name: 'Lunch', price: 40.0 },
        { name: 'Coffee', price: 5.0 },
      ],
      billLevelFoc: { reason: 'promotional', treatment: 'zero_rated' },
      taxRate: 0.1,
    });

    const result = adapter.calculate(bill);

    expect(result.totalTaxBase.toDecimal()).toBe(0.0);
    expect(result.totalTaxAmount.toDecimal()).toBe(0.0);
    expect(result.totalCustomerPays.toDecimal()).toBe(0.0);
    expect(result.totalMerchantAbsorbs.toDecimal()).toBe(0.0);
  });
});

// ─── TC-06: FOC Cannot Make Total Negative ──────────────────────

describe('TC-06: Invariant — totals never negative', () => {
  const scenarios: BillDef[] = [
    {
      items: [
        { name: 'A', price: 10.0, foc: { reason: 'promotional', treatment: 'zero_rated' } },
        { name: 'B', price: 5.0, foc: { reason: 'staff_consumption', treatment: 'notional_value' } },
      ],
      taxRate: 0.1,
    },
    {
      items: [
        { name: 'A', price: 100.0 },
        { name: 'B', price: 50.0 },
      ],
      billLevelFoc: { reason: 'complimentary_bill', treatment: 'merchant_absorbs' },
      taxRate: 0.2,
    },
    {
      items: [
        { name: 'A', price: 0.01 },
        { name: 'B', price: 0.01, foc: { reason: 'damaged_goods', treatment: 'zero_rated' } },
      ],
      taxRate: 0.07,
    },
    {
      items: [
        { name: 'A', price: 25.0, foc: { reason: 'service_recovery', treatment: 'zero_rated' } },
        { name: 'B', price: 25.0, foc: { reason: 'staff_consumption', treatment: 'notional_value' } },
        { name: 'C', price: 25.0 },
      ],
      taxRate: 0.15,
    },
  ];

  it.each(scenarios)(
    'holds for scenario with %# items',
    (def) => {
      const bill = buildBill(def);
      const result = adapter.calculate(bill);

      expect(result.totalCustomerPays.toDecimal()).toBeGreaterThanOrEqual(0);
      expect(result.totalTaxAmount.toDecimal()).toBeGreaterThanOrEqual(0);
      expect(result.totalMerchantAbsorbs.toDecimal()).toBeGreaterThanOrEqual(0);
    },
  );
});

// ─── TC-07: Rounding Applied Once, Not Per Item ─────────────────

describe('TC-07: Rounding applied once on total, not summed from per-item', () => {
  it('avoids rounding accumulation error', () => {
    const bill = buildBill({
      items: [
        { name: 'A', price: 0.333 },
        { name: 'B', price: 0.333 },
        { name: 'C', price: 0.333 },
      ],
      taxRate: 0.1,
    });

    const result = adapter.calculate(bill);

    // Total tax base = $0.999, tax = $0.0999, rounded half-up = $0.10
    expect(result.totalTaxAmount.toDecimal()).toBe(0.1);
  });
});

// ─── Audit trail is always populated ────────────────────────────

describe('Audit trail', () => {
  it('is populated even for a simple bill', () => {
    const bill = buildBill({
      items: [{ name: 'Item', price: 5.0 }],
      taxRate: 0.1,
    });

    const result = adapter.calculate(bill);

    expect(result.auditTrail.length).toBeGreaterThan(0);
    expect(result.auditTrail[0].step).toBe(1);
    expect(result.auditTrail[0].rule).toBeDefined();
  });
});
