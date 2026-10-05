// Solo para tests: una partida real ya pasada la colocación inicial.
import { applyAction, createConfig, createGame, respectsDistanceRule } from '@hexa/engine';
import type { GameState } from '@hexa/engine';

export function autoSetupForTests(): GameState {
  let state = createGame(createConfig(['p0', 'p1', 'p2']), 'protocol-tests');
  while (state.phase.type === 'setup') {
    const player = state.turn.player;
    const vertex = state.board.topology.vertices.find(
      (v) => !state.buildings[v.id] && respectsDistanceRule(state, v.id),
    );
    if (!vertex) throw new Error('sin vértice');
    const settled = applyAction(state, player, { type: 'BUILD_SETTLEMENT', vertex: vertex.id });
    if (!settled.ok) throw new Error(settled.error);
    const edge = vertex.edges.find((e) => !settled.value.state.roads[e]);
    if (!edge) throw new Error('sin arista');
    const built = applyAction(settled.value.state, player, { type: 'BUILD_ROAD', edge });
    if (!built.ok) throw new Error(built.error);
    state = built.value.state;
  }
  return state;
}
