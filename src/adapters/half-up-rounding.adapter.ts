import { Injectable } from '@nestjs/common';
import { Money } from '../domain/money';
import { RoundingStrategyPort } from '../domain/ports';

/**
 * Half-up rounding: rounds to the nearest cent (2 decimal places).
 * When the digit is exactly 5, rounds away from zero (standard commercial rounding).
 *
 * Money stores 4 decimal places internally (1 unit = 10000 subunits).
 * Rounding to cents means rounding to the nearest 100 subunits.
 */
@Injectable()
export class HalfUpRoundingAdapter implements RoundingStrategyPort {
  apply(amount: Money): Money {
    const subunits = amount.rawSubunits;
    const remainder = subunits % 100n;

    if (remainder === 0n) {
      return amount;
    }

    const absRemainder = remainder < 0n ? -remainder : remainder;

    if (absRemainder >= 50n) {
      const direction = subunits >= 0n ? 100n : -100n;
      return Money.fromSubunits(
        subunits - remainder + direction,
        amount.currency,
      );
    }

    return Money.fromSubunits(subunits - remainder, amount.currency);
  }
}
