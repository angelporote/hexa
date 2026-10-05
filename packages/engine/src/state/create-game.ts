import { generateBoard } from '../board/generator.js';
import { createRng, shuffle } from '../rng/rng.js';
import { emptyCounts } from './resources.js';
import { DEV_CARD_IDS, STATE_VERSION } from './types.js';
import type { DevCardId, GameConfig, GameState, PlayerState } from './types.js';

/**
 * Crea una partida en su estado inicial (colocación inicial, primer jugador).
 * Una configuración inválida es un error de programación, no un error de dominio: lanza.
 */
export function createGame(config: GameConfig, seed: string): GameState {
  const { players, rules } = config;
  if (players.length < 2 || players.length > 4) {
    throw new Error(`Número de jugadores no soportado: ${players.length}`);
  }
  if (new Set(players).size !== players.length) throw new Error('Jugadores repetidos');

  const generated = generateBoard(config.map, createRng(seed), {
    avoidAdjacentHotNumbers: rules.avoidAdjacentHotNumbers,
  });
  if (!generated.ok) throw new Error(`No se pudo generar el tablero: ${generated.error}`);
  const { board } = generated.value;

  const deckCards: DevCardId[] = [];
  for (const card of DEV_CARD_IDS) {
    for (let i = 0; i < rules.devDeck[card]; i++) deckCards.push(card);
  }
  const deck = shuffle(generated.value.rng, deckCards);

  // El ladrón empieza en el terreno que no produce; si no hay, en el primer hexágono.
  const robber =
    board.topology.hexes.find((h) => board.hexes[h.id]?.terrain === 'none')?.id ??
    board.topology.hexes[0]?.id;
  if (robber === undefined) throw new Error('El mapa no tiene hexágonos');

  const playerStates: PlayerState[] = players.map((id) => ({
    id,
    hand: emptyCounts(),
    devCards: [],
    armiesPlayed: 0,
    pieces: { ...rules.pieces },
  }));

  const first = players[0];
  if (first === undefined) throw new Error('unreachable');

  return {
    version: STATE_VERSION,
    seed,
    rng: deck.rng,
    config,
    board,
    players: playerStates,
    buildings: {},
    roads: {},
    robber,
    bank: {
      r1: rules.bankStock,
      r2: rules.bankStock,
      r3: rules.bankStock,
      r4: rules.bankStock,
      r5: rules.bankStock,
    },
    devDeck: deck.value,
    phase: { type: 'setup', index: 0, step: 'settlement', lastSettlement: null },
    turn: { player: first, number: 0, lastRoll: null, devCardPlayed: false },
    pendingTrade: null,
    nextOfferId: 1,
    awards: { largestArmy: null, longestRoad: null },
    winner: null,
    log: [],
  };
}
