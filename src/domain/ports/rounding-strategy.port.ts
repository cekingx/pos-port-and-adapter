import { Money } from '../money';

export const ROUNDING_STRATEGY_PORT = Symbol('RoundingStrategyPort');

/**
 * Secondary port — the domain needs rounding but doesn't decide how.
 * Implementations choose the strategy (half-up, half-even, etc.).
 */
export interface RoundingStrategyPort {
  apply(amount: Money): Money;
}
