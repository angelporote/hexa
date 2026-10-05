import { RESOURCE_IDS } from '../board/types.js';
import { updateAwards } from '../scoring/awards.js';
import { longestRoadLength } from '../scoring/longest-road.js';
import { totalPoints } from '../scoring/points.js';
import { totalCards } from '../state/resources.js';
import { DEV_CARD_IDS } from '../state/types.js';
import type { GameState } from '../state/types.js';

const PLAY_ACTIONS = new Set(['PLAY_ARMY', 'PLAY_ROADS', 'PLAY_PLENTY', 'PLAY_MONOPOLY']);

/** Comprueba las invariantes del estado; devuelve la lista de las que se rompen. */
export function checkInvariants(state: GameState): string[] {
  const problems: string[] = [];
  const { rules } = state.config;
  const { vertexById, edgeById, hexById } = state.board.topology;

  // Conservación de recursos: banco + manos = existencias iniciales de cada recurso.
  for (const r of RESOURCE_IDS) {
    const inHands = state.players.reduce((sum, p) => sum + p.hand[r], 0);
    if (state.bank[r] + inHands !== rules.bankStock) {
      problems.push(`recurso ${r}: banco ${state.bank[r]} + manos ${inHands} ≠ ${rules.bankStock}`);
    }
    if (state.bank[r] < 0) problems.push(`banco negativo en ${r}`);
  }
  for (const p of state.players) {
    for (const r of RESOURCE_IDS) {
      if (!Number.isInteger(p.hand[r]) || p.hand[r] < 0) {
        problems.push(`${p.id} tiene ${p.hand[r]} de ${r}`);
      }
    }
  }

  // Conservación de cartas de desarrollo: mazo + en manos + jugadas = composición inicial.
  const initialDeck = DEV_CARD_IDS.reduce((sum, c) => sum + rules.devDeck[c], 0);
  const held = state.players.reduce((sum, p) => sum + p.devCards.length, 0);
  const played = state.log.filter((e) => PLAY_ACTIONS.has(e.action.type)).length;
  if (state.devDeck.length + held + played !== initialDeck) {
    problems.push(
      `cartas de desarrollo: ${state.devDeck.length} + ${held} + ${played} ≠ ${initialDeck}`,
    );
  }

  // Piezas: lo colocado más lo que queda es el total de cada jugador.
  for (const p of state.players) {
    const roads = Object.values(state.roads).filter((o) => o === p.id).length;
    const owned = Object.values(state.buildings).filter((b) => b.owner === p.id);
    const settlements = owned.filter((b) => b.kind === 'settlement').length;
    const cities = owned.filter((b) => b.kind === 'city').length;
    if (roads + p.pieces.roads !== rules.pieces.roads)
      problems.push(`${p.id}: caminos mal contados`);
    if (settlements + p.pieces.settlements !== rules.pieces.settlements) {
      problems.push(`${p.id}: poblados mal contados`);
    }
    if (cities + p.pieces.cities !== rules.pieces.cities)
      problems.push(`${p.id}: ciudades mal contadas`);
    if (p.pieces.roads < 0 || p.pieces.settlements < 0 || p.pieces.cities < 0) {
      problems.push(`${p.id}: piezas negativas`);
    }
  }

  // Tablero: elementos existentes, propietarios válidos y regla de distancia.
  const ids = new Set(state.players.map((p) => p.id));
  for (const [vertex, building] of Object.entries(state.buildings)) {
    const node = vertexById[vertex];
    if (!node) problems.push(`edificio en vértice inexistente ${vertex}`);
    if (!ids.has(building.owner)) problems.push(`edificio de jugador desconocido en ${vertex}`);
    if (node?.neighbors.some((n) => state.buildings[n])) {
      problems.push(`regla de distancia rota en ${vertex}`);
    }
  }
  for (const [edge, owner] of Object.entries(state.roads)) {
    if (!edgeById[edge]) problems.push(`camino en arista inexistente ${edge}`);
    if (!ids.has(owner)) problems.push(`camino de jugador desconocido en ${edge}`);
  }
  if (!hexById[state.robber]) problems.push('el ladrón está fuera del tablero');

  // Bonificaciones coherentes con el estado y puntos dentro de lo posible.
  if (updateAwards(state).events.length > 0) problems.push('bonificaciones desactualizadas');
  const roadHolder = state.awards.longestRoad;
  if (roadHolder && longestRoadLength(state, roadHolder) < rules.minLongestRoad) {
    problems.push('titular del camino más largo sin longitud suficiente');
  }
  const armyHolder = state.awards.largestArmy;
  const armies = state.players.find((p) => p.id === armyHolder)?.armiesPlayed ?? 0;
  if (armyHolder && armies < rules.minLargestArmy) {
    problems.push('titular del mayor ejército sin cartas suficientes');
  }

  // Fase y turno.
  if (!ids.has(state.turn.player)) problems.push('turno de un jugador desconocido');
  if (state.phase.type === 'discard') {
    for (const [id, owed] of Object.entries(state.phase.owed)) {
      const p = state.players.find((x) => x.id === id);
      if (!p || owed < 1 || totalCards(p.hand) < owed) problems.push(`descarte imposible de ${id}`);
    }
  }
  if (state.phase.type !== 'setup' && state.phase.type !== 'ended') {
    if (totalPoints(state, state.turn.player) >= rules.victoryPoints) {
      problems.push('el jugador activo tiene los puntos de victoria y la partida sigue');
    }
  }
  if (state.phase.type === 'ended' && (state.winner === null || !ids.has(state.winner))) {
    problems.push('partida terminada sin ganador válido');
  }
  if (state.winner !== null && state.phase.type !== 'ended') {
    problems.push('hay ganador pero la partida no está terminada');
  }
  if (state.pendingTrade && state.phase.type !== 'main') {
    problems.push('oferta de comercio abierta fuera de la fase principal');
  }
  return problems;
}
