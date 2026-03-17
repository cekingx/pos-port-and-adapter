import { MoneyError } from './errors';
import { Result, ok, fail } from './result';

/**
 * Immutable monetary value stored in integer subunits (1/10000 of currency unit).
 * Uses bigint to prevent floating-point arithmetic errors.
 *
 * Internal precision: 4 decimal places (e.g. $1.00 = 10000 subunits).
 * Rounding to cents (2 decimal places) is deferred to the RoundingStrategyPort.
 */
export class Money {
  private constructor(
    private readonly subunits: bigint,
    readonly currency: string,
  ) {}

  static of(amount: number, currency: string): Money {
    return new Money(BigInt(Math.round(amount * 10000)), currency);
  }

  static zero(currency: string): Money {
    return new Money(0n, currency);
  }

  static fromSubunits(subunits: bigint, currency: string): Money {
    return new Money(subunits, currency);
  }

  get rawSubunits(): bigint {
    return this.subunits;
  }

  add(other: Money): Result<Money, MoneyError> {
    const error = this.checkSameCurrency(other);
    if (error) return fail(error);
    return ok(new Money(this.subunits + other.subunits, this.currency));
  }

  subtract(other: Money): Result<Money, MoneyError> {
    const error = this.checkSameCurrency(other);
    if (error) return fail(error);
    return ok(new Money(this.subunits - other.subunits, this.currency));
  }

  negate(): Money {
    return new Money(-this.subunits, this.currency);
  }

  multiplyByRate(rate: number): Money {
    const rateScaled = BigInt(Math.round(rate * 10000));
    const result = (this.subunits * rateScaled) / 10000n;
    return new Money(result, this.currency);
  }

  toDecimal(): number {
    return Number(this.subunits) / 10000;
  }

  isZero(): boolean {
    return this.subunits === 0n;
  }

  isPositive(): boolean {
    return this.subunits > 0n;
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.subunits === other.subunits;
  }

  private checkSameCurrency(other: Money): MoneyError | null {
    if (this.currency !== other.currency) {
      return {
        type: 'CURRENCY_MISMATCH',
        left: this.currency,
        right: other.currency,
      };
    }
    return null;
  }
}
