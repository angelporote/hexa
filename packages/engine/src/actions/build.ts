import type { EdgeId, VertexId } from '../board/topology.js';
import { err, ok } from '../result.js';
import { COSTS } from '../rules/costs.js';
import {
  edgeExists,
  respectsDistanceRule,
  roadConnects,
  touchesOwnRoad,
  vertexExists,
} from '../rules/placement.js';
import { covers } from '../state/resources.js';
import type { GameState, PlayerId } from '../state/types.js';
import { getPlayer, mapPlayer, payToBank } from '../state/update.js';
import type { ActionResult } from './outcome.js';

function inMainPhase(state: GameState, player: PlayerId): ActionResult | null {
  if (state.turn.player !== player) return err('NOT_YOUR_TURN');
  if (state.phase.type !== 'main') return err('WRONG_PHASE');
  return null;
}

export function buildRoad(state: GameState, player: PlayerId, edge: EdgeId): ActionResult {
  const blocked = inMainPhase(state, player);
  if (blocked) return blocked;
  if (!edgeExists(state, edge)) return err('INVALID_EDGE');
  if (state.roads[edge]) return err('EDGE_OCCUPIED');
  if (!roadConnects(state, player, edge)) return err('NOT_CONNECTED');
  const me = getPlayer(state, player);
  if (me.pieces.roads < 1) return err('NO_PIECES_LEFT');
  if (!covers(me.hand, COSTS.road)) return err('NOT_ENOUGH_RESOURCES');

  let next = payToBank(state, player, COSTS.road);
  next = { ...next, roads: { ...next.roads, [edge]: player } };
  next = mapPlayer(next, player, (p) => ({
    ...p,
    pieces: { ...p.pieces, roads: p.pieces.roads - 1 },
  }));
  return ok({ state: next, events: [{ type: 'ROAD_BUILT', player, edge }] });
}

export function buildSettlement(
  state: GameState,
  player: PlayerId,
  vertex: VertexId,
): ActionResult {
  const blocked = inMainPhase(state, player);
  if (blocked) return blocked;
  if (!vertexExists(state, vertex)) return err('INVALID_VERTEX');
  if (state.buildings[vertex]) return err('VERTEX_OCCUPIED');
  if (!respectsDistanceRule(state, vertex)) return err('TOO_CLOSE_TO_BUILDING');
  if (!touchesOwnRoad(state, player, vertex)) return err('NOT_CONNECTED');
  const me = getPlayer(state, player);
  if (me.pieces.settlements < 1) return err('NO_PIECES_LEFT');
  if (!covers(me.hand, COSTS.settlement)) return err('NOT_ENOUGH_RESOURCES');

  let next = payToBank(state, player, COSTS.settlement);
  next = {
    ...next,
    buildings: { ...next.buildings, [vertex]: { owner: player, kind: 'settlement' } },
  };
  next = mapPlayer(next, player, (p) => ({
    ...p,
    pieces: { ...p.pieces, settlements: p.pieces.settlements - 1 },
  }));
  return ok({ state: next, events: [{ type: 'SETTLEMENT_BUILT', player, vertex }] });
}

/** La ciudad mejora un poblado propio y devuelve esa pieza a la reserva del jugador. */
export function buildCity(state: GameState, player: PlayerId, vertex: VertexId): ActionResult {
  const blocked = inMainPhase(state, player);
  if (blocked) return blocked;
  if (!vertexExists(state, vertex)) return err('INVALID_VERTEX');
  const existing = state.buildings[vertex];
  if (existing?.owner !== player || existing.kind !== 'settlement') {
    return err('NO_SETTLEMENT_TO_UPGRADE');
  }
  const me = getPlayer(state, player);
  if (me.pieces.cities < 1) return err('NO_PIECES_LEFT');
  if (!covers(me.hand, COSTS.city)) return err('NOT_ENOUGH_RESOURCES');

  let next = payToBank(state, player, COSTS.city);
  next = { ...next, buildings: { ...next.buildings, [vertex]: { owner: player, kind: 'city' } } };
  next = mapPlayer(next, player, (p) => ({
    ...p,
    pieces: { ...p.pieces, cities: p.pieces.cities - 1, settlements: p.pieces.settlements + 1 },
  }));
  return ok({ state: next, events: [{ type: 'CITY_BUILT', player, vertex }] });
}
