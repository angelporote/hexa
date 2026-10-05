import type { Action } from '../actions/types.js';
import type { HexId } from '../board/hex.js';
import type { MapTemplate } from '../board/map-template.js';
import type { EdgeId, VertexId } from '../board/topology.js';
import type { Board, ResourceId } from '../board/types.js';
import type { RngState } from '../rng/rng.js';
import type { ResourceCounts } from './resources.js';

export const STATE_VERSION = 1;

export type PlayerId = string;

// Cartas de desarrollo con identificadores neutros; los nombres viven en `packages/theme`.
export const DEV_CARD_IDS = ['army', 'roads', 'plenty', 'monopoly', 'point'] as const;
export type DevCardId = (typeof DEV_CARD_IDS)[number];

export interface RuleSet {
  readonly victoryPoints: number;
  /** Con más cartas que este límite, un 7 obliga a descartar la mitad. */
  readonly discardLimit: number;
  readonly avoidAdjacentHotNumbers: boolean;
  readonly pieces: {
    readonly roads: number;
    readonly settlements: number;
    readonly cities: number;
  };
  /** Cartas de cada recurso en el banco al empezar. */
  readonly bankStock: number;
  /** Composición del mazo de desarrollo. */
  readonly devDeck: Readonly<Record<DevCardId, number>>;
  readonly minLongestRoad: number;
  readonly minLargestArmy: number;
}

export interface GameConfig {
  /** Jugadores en orden de asiento (el primero abre la colocación inicial). */
  readonly players: readonly PlayerId[];
  readonly map: MapTemplate;
  readonly rules: RuleSet;
}

export interface DevCardEntry {
  readonly card: DevCardId;
  /** Turno en que se compró: no se puede jugar ese mismo turno. */
  readonly boughtOnTurn: number;
}

export interface PlayerState {
  readonly id: PlayerId;
  readonly hand: ResourceCounts;
  readonly devCards: readonly DevCardEntry[];
  /** Cartas de ejército jugadas (para «mayor ejército»). */
  readonly armiesPlayed: number;
  /** Piezas que le quedan por colocar. */
  readonly pieces: {
    readonly roads: number;
    readonly settlements: number;
    readonly cities: number;
  };
}

export interface Building {
  readonly owner: PlayerId;
  readonly kind: 'settlement' | 'city';
}

export type Phase =
  /** Colocación inicial en ida y vuelta; `index` recorre 0..2n-1 sobre el orden de ida y vuelta. */
  | {
      readonly type: 'setup';
      readonly index: number;
      readonly step: 'settlement' | 'road';
      readonly lastSettlement: VertexId | null;
    }
  | { readonly type: 'roll' }
  | { readonly type: 'discard'; readonly owed: Readonly<Record<PlayerId, number>> }
  | { readonly type: 'robber'; readonly returnTo: 'roll' | 'main' }
  | {
      readonly type: 'roadBuilding';
      readonly remaining: number;
      readonly returnTo: 'roll' | 'main';
    }
  | { readonly type: 'main' }
  | { readonly type: 'ended' };

export interface TradeOffer {
  readonly id: number;
  readonly from: PlayerId;
  /** `null` = abierta a todos los demás jugadores. */
  readonly to: readonly PlayerId[] | null;
  readonly give: ResourceCounts;
  readonly want: ResourceCounts;
  readonly accepted: readonly PlayerId[];
  readonly rejected: readonly PlayerId[];
}

export interface TurnState {
  readonly player: PlayerId;
  /** Número de turno global, empezando en 1 tras la colocación inicial. */
  readonly number: number;
  readonly lastRoll: readonly [number, number] | null;
  readonly devCardPlayed: boolean;
}

export interface LogEntry {
  readonly player: PlayerId;
  readonly action: Action;
}

/** Estado completo de la partida. Es un valor JSON puro: sin clases, `Map`, `Set` ni `undefined`. */
export interface GameState {
  readonly version: number;
  readonly seed: string;
  readonly rng: RngState;
  readonly config: GameConfig;
  readonly board: Board;
  readonly players: readonly PlayerState[];
  readonly buildings: Readonly<Record<VertexId, Building>>;
  readonly roads: Readonly<Record<EdgeId, PlayerId>>;
  readonly robber: HexId;
  readonly bank: ResourceCounts;
  /** Oculto para todos los clientes. */
  readonly devDeck: readonly DevCardId[];
  readonly phase: Phase;
  readonly turn: TurnState;
  readonly pendingTrade: TradeOffer | null;
  readonly nextOfferId: number;
  readonly awards: {
    readonly largestArmy: PlayerId | null;
    readonly longestRoad: PlayerId | null;
  };
  readonly winner: PlayerId | null;
  /** Acciones aplicadas con éxito, en orden: permite reconstruir y auditar la partida. */
  readonly log: readonly LogEntry[];
}

export type { ResourceId };
