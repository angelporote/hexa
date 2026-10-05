import { RESOURCE_IDS } from '../board/types.js';
import type { EdgeId, VertexId } from '../board/topology.js';
import { err, ok } from '../result.js';
import { edgeExists, respectsDistanceRule, vertexExists } from '../rules/placement.js';
import { emptyCounts } from '../state/resources.js';
import type { GameState, PlayerId } from '../state/types.js';
import { getPlayer, giveFromBank, mapPlayer, setupSeat } from '../state/update.js';
import type { GameEvent } from './events.js';
import type { ActionResult } from './outcome.js';

function setupPhase(state: GameState) {
  return state.phase.type === 'setup' ? state.phase : null;
}

/** Poblado de la colocación inicial: gratis, sin exigir conexión, con regla de distancia. */
export function setupBuildSettlement(
  state: GameState,
  player: PlayerId,
  vertex: VertexId,
): ActionResult {
  const phase = setupPhase(state);
  if (!phase || phase.step !== 'settlement') return err('WRONG_PHASE');
  if (state.turn.player !== player) return err('NOT_YOUR_TURN');
  if (!vertexExists(state, vertex)) return err('INVALID_VERTEX');
  if (state.buildings[vertex]) return err('VERTEX_OCCUPIED');
  if (!respectsDistanceRule(state, vertex)) return err('TOO_CLOSE_TO_BUILDING');
  if (getPlayer(state, player).pieces.settlements < 1) return err('NO_PIECES_LEFT');

  let next: GameState = {
    ...state,
    buildings: { ...state.buildings, [vertex]: { owner: player, kind: 'settlement' } },
    phase: { ...phase, step: 'road', lastSettlement: vertex },
  };
  next = mapPlayer(next, player, (p) => ({
    ...p,
    pieces: { ...p.pieces, settlements: p.pieces.settlements - 1 },
  }));
  const events: GameEvent[] = [{ type: 'SETTLEMENT_BUILT', player, vertex }];

  // La segunda colocación (vuelta) otorga un recurso por cada terreno productor adyacente.
  if (phase.index >= state.players.length) {
    const gained = emptyCounts();
    for (const hexId of state.board.topology.vertexById[vertex]?.hexes ?? []) {
      const terrain = state.board.hexes[hexId]?.terrain;
      if (terrain && terrain !== 'none') gained[terrain] += 1;
    }
    if (RESOURCE_IDS.some((r) => gained[r] > 0)) {
      next = giveFromBank(next, player, gained);
      events.push({ type: 'RESOURCES_GAINED', player, resources: gained, reason: 'setup' });
    }
  }
  return ok({ state: next, events });
}

/** Camino de la colocación inicial: gratis y pegado al poblado recién puesto. */
export function setupBuildRoad(state: GameState, player: PlayerId, edge: EdgeId): ActionResult {
  const phase = setupPhase(state);
  if (!phase || phase.step !== 'road' || phase.lastSettlement === null) return err('WRONG_PHASE');
  if (state.turn.player !== player) return err('NOT_YOUR_TURN');
  if (!edgeExists(state, edge)) return err('INVALID_EDGE');
  if (state.roads[edge]) return err('EDGE_OCCUPIED');
  const anchor = state.board.topology.vertexById[phase.lastSettlement];
  if (!anchor?.edges.includes(edge)) return err('NOT_CONNECTED');
  if (getPlayer(state, player).pieces.roads < 1) return err('NO_PIECES_LEFT');

  let next: GameState = { ...state, roads: { ...state.roads, [edge]: player } };
  next = mapPlayer(next, player, (p) => ({
    ...p,
    pieces: { ...p.pieces, roads: p.pieces.roads - 1 },
  }));
  const events: GameEvent[] = [{ type: 'ROAD_BUILT', player, edge }];

  const count = state.players.length;
  const nextIndex = phase.index + 1;
  if (nextIndex >= 2 * count) {
    // Fin de la colocación: abre el primer turno quien empezó la ronda.
    const first = state.players[0];
    if (!first) throw new Error('unreachable');
    next = {
      ...next,
      phase: { type: 'roll' },
      turn: { player: first.id, number: 1, lastRoll: null, devCardPlayed: false },
    };
    events.push({ type: 'TURN_STARTED', player: first.id, number: 1 });
  } else {
    const seat = state.players[setupSeat(count, nextIndex)];
    if (!seat) throw new Error('unreachable');
    next = {
      ...next,
      phase: { type: 'setup', index: nextIndex, step: 'settlement', lastSettlement: null },
      turn: { ...next.turn, player: seat.id },
    };
  }
  return ok({ state: next, events });
}
