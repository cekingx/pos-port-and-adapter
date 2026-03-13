import { CalculateTaxCommand } from '../../domain/types';
import type { RoundingStrategyPort } from '../../ports/driven/rounding-strategy.port';
import type { TaxJurisdictionRepositoryPort } from '../../ports/driven/tax-jurisdiction-repository.port';
import type { TaxAuditLogPort } from '../../ports/driven/tax-audit-log.port';
import { HalfUpRoundingAdapter } from '../../../adapters/driven/rounding/half-up-rounding.adapter';
import { CalculateTaxUseCase } from '../calculate-tax.use-case';

// ─── Stub driven adapters ────────────────────────────────────────

const stubJurisdictionRepo = (rate: number): TaxJurisdictionRepositoryPort => ({
  async findByCode(code) {
    return { code, rate, name: 'Test' };
  },
});

const noopAuditLog: TaxAuditLogPort = {
  async persist() {},
};

// ─── Helper ──────────────────────────────────────────────────────

function buildCommand(
  overrides: Partial<CalculateTaxCommand> & {
    items: CalculateTaxCommand['lineItems'];
    taxRate: number;
  },
): { command: CalculateTaxCommand; useCase: CalculateTaxUseCase } {
  const useCase = new CalculateTaxUseCase(
    new HalfUpRoundingAdapter(),
    stubJurisdictionRepo(overrides.taxRate),
    noopAuditLog,
  );

  const command: CalculateTaxCommand = {
    billId: 'bill-test',
    lineItems: overrides.items,
    jurisdictionCode: 'TEST',
    taxMode: 'exclusive',
    currency: 'USD',
    ...overrides,
  };

  return { command, useCase };
}

// ─── TC-01: Normal Bill, No FOC ─────────────────────────────────

describe('TC-01: Normal bill with no FOC', () => {
  it('calculates tax on full subtotal', async () => {
    const { command, useCase } = buildCommand({
      items: [
        { id: '1', name: 'Burger', price: 10.0, quantity: 1 },
        { id: '2', name: 'Fries', price: 4.0, quantity: 1 },
      ],
      taxRate: 0.1,
    });

    const result = await useCase.execute(command);

    expect(result.totalTaxBase.toDecimal()).toBe(14.0);
    expect(result.totalTaxAmount.toDecimal()).toBe(1.4);
    expect(result.totalCustomerPays.toDecimal()).toBe(15.4);
    expect(result.totalMerchantAbsorbs.toDecimal()).toBe(0.0);
  });
});

// ─── TC-02: Item FOC — Zero Rated ───────────────────────────────

describe('TC-02: Item-level FOC, zero_rated', () => {
  it('excludes FOC item from tax base', async () => {
    const { command, useCase } = buildCommand({
      items: [
        { id: '1', name: 'Burger', price: 10.0, quantity: 1 },
        {
          id: '2',
          name: 'Drink',
          price: 3.0,
          quantity: 1,
          foc: { reason: 'promotional', treatment: 'zero_rated' },
        },
      ],
      taxRate: 0.1,
    });

    const result = await useCase.execute(command);

    expect(result.totalTaxBase.toDecimal()).toBe(10.0);
    expect(result.totalTaxAmount.toDecimal()).toBe(1.0);
    expect(result.totalCustomerPays.toDecimal()).toBe(11.0);
    expect(result.totalMerchantAbsorbs.toDecimal()).toBe(0.0);
  });
});

// ─── TC-03: Item FOC — Notional Value ───────────────────────────

describe('TC-03: Item-level FOC, notional_value', () => {
  it('includes FOC item in tax base, merchant absorbs item + tax', async () => {
    const { command, useCase } = buildCommand({
      items: [
        { id: '1', name: 'Water', price: 2.0, quantity: 1 },
        {
          id: '2',
          name: 'StaffMeal',
          price: 12.0,
          quantity: 1,
          foc: { reason: 'staff_consumption', treatment: 'notional_value' },
        },
      ],
      taxRate: 0.1,
    });

    const result = await useCase.execute(command);

    expect(result.totalTaxBase.toDecimal()).toBe(14.0);
    expect(result.totalTaxAmount.toDecimal()).toBe(1.4);
    expect(result.totalCustomerPays.toDecimal()).toBe(2.2);
    expect(result.totalMerchantAbsorbs.toDecimal()).toBe(13.2);
  });
});

// ─── TC-04: Bill-Level FOC — Merchant Absorbs ───────────────────

describe('TC-04: Bill-level FOC, merchant_absorbs', () => {
  it('customer pays nothing, merchant absorbs full bill including tax', async () => {
    const { command, useCase } = buildCommand({
      items: [
        { id: '1', name: 'RoomService', price: 80.0, quantity: 1 },
        { id: '2', name: 'Minibar', price: 30.0, quantity: 1 },
      ],
      billLevelFoc: {
        reason: 'complimentary_bill',
        treatment: 'merchant_absorbs',
      },
      taxRate: 0.1,
    });

    const result = await useCase.execute(command);

    expect(result.totalTaxBase.toDecimal()).toBe(110.0);
    expect(result.totalTaxAmount.toDecimal()).toBe(11.0);
    expect(result.totalCustomerPays.toDecimal()).toBe(0.0);
    expect(result.totalMerchantAbsorbs.toDecimal()).toBe(121.0);
  });
});

// ─── TC-05: Bill-Level FOC — Zero Rated ─────────────────────────

describe('TC-05: Bill-level FOC, zero_rated', () => {
  it('customer pays nothing, no tax liability for merchant', async () => {
    const { command, useCase } = buildCommand({
      items: [
        { id: '1', name: 'Lunch', price: 40.0, quantity: 1 },
        { id: '2', name: 'Coffee', price: 5.0, quantity: 1 },
      ],
      billLevelFoc: { reason: 'promotional', treatment: 'zero_rated' },
      taxRate: 0.1,
    });

    const result = await useCase.execute(command);

    expect(result.totalTaxBase.toDecimal()).toBe(0.0);
    expect(result.totalTaxAmount.toDecimal()).toBe(0.0);
    expect(result.totalCustomerPays.toDecimal()).toBe(0.0);
    expect(result.totalMerchantAbsorbs.toDecimal()).toBe(0.0);
  });
});

// ─── TC-06: FOC Cannot Make Total Negative ──────────────────────

describe('TC-06: Invariant — totals never negative', () => {
  const scenarios = [
    {
      items: [
        { id: '1', name: 'A', price: 10.0, quantity: 1, foc: { reason: 'promotional' as const, treatment: 'zero_rated' as const } },
        { id: '2', name: 'B', price: 5.0, quantity: 1, foc: { reason: 'staff_consumption' as const, treatment: 'notional_value' as const } },
      ],
      taxRate: 0.1,
    },
    {
      items: [
        { id: '1', name: 'A', price: 100.0, quantity: 1 },
        { id: '2', name: 'B', price: 50.0, quantity: 1 },
      ],
      billLevelFoc: { reason: 'complimentary_bill' as const, treatment: 'merchant_absorbs' as const },
      taxRate: 0.2,
    },
    {
      items: [
        { id: '1', name: 'A', price: 0.01, quantity: 1 },
        { id: '2', name: 'B', price: 0.01, quantity: 1, foc: { reason: 'damaged_goods' as const, treatment: 'zero_rated' as const } },
      ],
      taxRate: 0.07,
    },
  ];

  it.each(scenarios)(
    'holds for scenario %#',
    async (def) => {
      const { command, useCase } = buildCommand(def);
      const result = await useCase.execute(command);

      expect(result.totalCustomerPays.toDecimal()).toBeGreaterThanOrEqual(0);
      expect(result.totalTaxAmount.toDecimal()).toBeGreaterThanOrEqual(0);
      expect(result.totalMerchantAbsorbs.toDecimal()).toBeGreaterThanOrEqual(0);
    },
  );
});

// ─── TC-07: Rounding Applied Once, Not Per Item ─────────────────

describe('TC-07: Rounding applied once on total, not summed from per-item', () => {
  it('avoids rounding accumulation error', async () => {
    const { command, useCase } = buildCommand({
      items: [
        { id: '1', name: 'A', price: 0.333, quantity: 1 },
        { id: '2', name: 'B', price: 0.333, quantity: 1 },
        { id: '3', name: 'C', price: 0.333, quantity: 1 },
      ],
      taxRate: 0.1,
    });

    const result = await useCase.execute(command);

    expect(result.totalTaxAmount.toDecimal()).toBe(0.1);
  });
});

// ─── Audit trail is always populated ────────────────────────────

describe('Audit trail', () => {
  it('is populated even for a simple bill', async () => {
    const { command, useCase } = buildCommand({
      items: [{ id: '1', name: 'Item', price: 5.0, quantity: 1 }],
      taxRate: 0.1,
    });

    const result = await useCase.execute(command);

    expect(result.auditTrail.length).toBeGreaterThan(0);
    expect(result.auditTrail[0].step).toBe(1);
    expect(result.auditTrail[0].rule).toBeDefined();
  });
});
