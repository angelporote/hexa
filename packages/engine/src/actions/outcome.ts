import type { Result } from '../result.js';
import type { GameState } from '../state/types.js';
import type { RuleError } from './errors.js';
import type { GameEvent } from './events.js';

export interface ActionOutcome {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

export type ActionResult = Result<ActionOutcome, RuleError>;
