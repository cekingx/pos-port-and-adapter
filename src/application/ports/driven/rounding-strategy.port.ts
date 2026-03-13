import { Money } from '../../domain/money';

export const ROUNDING_STRATEGY_PORT = Symbol('RoundingStrategyPort');

/**
 * Driven port — the hexagon needs rounding but doesn't decide how.
 * Adapters outside the hexagon provide the implementation.
 */
export interface RoundingStrategyPort {
  apply(amount: Money): Money;
}
