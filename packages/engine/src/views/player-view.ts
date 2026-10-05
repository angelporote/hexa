import type { Action } from '../actions/types.js';
import type { HexId } from '../board/hex.js';
import type { EdgeId, Topology, VertexId } from '../board/topology.js';
import type { BoardHex, Port, ResourceId } from '../board/types.js';
import { tradeRatios } from '../rules/ports.js';
import { longestRoadLength } from '../scoring/longest-road.js';
import { publicPoints, totalPoints } from '../scoring/points.js';
import { totalCards } from '../state/resources.js';
import type { ResourceCounts } from '../state/resources.js';
import type {
  Building,
  DevCardId,
  GameState,
  Phase,
  PlayerId,
  TradeOffer,
  TurnState,
} from '../state/types.js';
import { canOfferTrade, legalActions } from './legal-actions.js';

export type Viewer = PlayerId | 'host' | 'spectator';

/** Lo que cualquiera puede saber de un jugador: solo totales, nunca el contenido de su mano. */
export interface PublicPlayer {
  readonly id: PlayerId;
  readonly resourceCount: number;
  readonly devCardCount: number;
  readonly armiesPlayed: number;
  readonly longestRoad: number;
  /** Puntos visibles; al acabar la partida incluye las cartas de punto, ya reveladas. */
  readonly points: number;
  readonly pieces: {
    readonly roads: number;
    readonly settlements: number;
    readonly cities: number;
  };
}

export interface OwnDevCard {
  readonly card: DevCardId;
  /** Se puede jugar ahora mismo (no comprada este turno). */
  readonly playable: boolean;
}

export interface PlayerView {
  readonly viewer: Viewer;
  readonly version: number;
  readonly rules: { readonly victoryPoints: number; readonly discardLimit: number };
  readonly board: {
    readonly mapId: string;
    readonly topology: Topology;
    readonly hexes: Readonly<Record<HexId, BoardHex>>;
    readonly ports: readonly Port[];
  };
  readonly buildings: Readonly<Record<VertexId, Building>>;
  readonly roads: Readonly<Record<EdgeId, PlayerId>>;
  readonly robber: HexId;
  /** Existencias del banco (públicas). */
  readonly bank: ResourceCounts;
  /** Número de cartas que quedan en el mazo, sin su orden. */
  readonly deckSize: number;
  readonly phase: Phase;
  readonly turn: TurnState;
  readonly pendingTrade: TradeOffer | null;
  readonly awards: GameState['awards'];
  readonly winner: PlayerId | null;
  readonly players: readonly PublicPlayer[];
  /** Información privada; `null` para el host y los espectadores. */
  readonly you: {
    readonly id: PlayerId;
    readonly hand: ResourceCounts;
    readonly devCards: readonly OwnDevCard[];
    readonly totalPoints: number;
    readonly tradeRatios: Readonly<Record<ResourceId, number>>;
  } | null;
  readonly legalActions: readonly Action[];
  readonly canOfferTrade: boolean;
}

/**
 * Proyección del estado para un cliente. Todo lo que sale del servidor pasa por aquí: no se
 * incluyen el RNG, la semilla, el orden del mazo, el registro ni las manos ajenas.
 */
export function getPlayerView(state: GameState, viewer: Viewer): PlayerView {
  const me = state.players.find((p) => p.id === viewer) ?? null;
  const ended = state.phase.type === 'ended';

  const players: PublicPlayer[] = state.players.map((p) => ({
    id: p.id,
    resourceCount: totalCards(p.hand),
    devCardCount: p.devCards.length,
    armiesPlayed: p.armiesPlayed,
    longestRoad: longestRoadLength(state, p.id),
    points: ended ? totalPoints(state, p.id) : publicPoints(state, p.id),
    pieces: p.pieces,
  }));

  return {
    viewer,
    version: state.version,
    rules: {
      victoryPoints: state.config.rules.victoryPoints,
      discardLimit: state.config.rules.discardLimit,
    },
    board: {
      mapId: state.board.mapId,
      topology: state.board.topology,
      hexes: state.board.hexes,
      ports: state.board.ports,
    },
    buildings: state.buildings,
    roads: state.roads,
    robber: state.robber,
    bank: state.bank,
    deckSize: state.devDeck.length,
    phase: state.phase,
    turn: state.turn,
    pendingTrade: state.pendingTrade,
    awards: state.awards,
    winner: state.winner,
    players,
    you: me
      ? {
          id: me.id,
          hand: me.hand,
          devCards: me.devCards.map((c) => ({
            card: c.card,
            playable: c.boughtOnTurn < state.turn.number,
          })),
          totalPoints: totalPoints(state, me.id),
          tradeRatios: tradeRatios(state, me.id),
        }
      : null,
    legalActions: me ? legalActions(state, me.id) : [],
    canOfferTrade: me ? canOfferTrade(state, me.id) : false,
  };
}
