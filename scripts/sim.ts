// Simulador de partidas: bots juegan N partidas completas comprobando invariantes.
// Uso: pnpm sim -- --games 1000 [--players 2|3|4] [--seed prefijo] [--check-every N]
//                  [--bots random|smart|mixed]
// random: todos aleatorios (por defecto). smart: todos razonables. mixed: p0 razonable, el resto aleatorios.
import { simulateGame } from '@hexa/engine';
import type { BotKind, GameReport } from '@hexa/engine';

type BotMode = 'random' | 'smart' | 'mixed';

interface Args {
  games: number;
  players: number | null;
  seed: string;
  checkEvery: number;
  bots: BotMode;
}

const IDS = ['p0', 'p1', 'p2', 'p3'];

function botsFor(mode: BotMode, players: number): Record<string, BotKind> {
  return Object.fromEntries(
    IDS.slice(0, players).map((id, i): [string, BotKind] => [
      id,
      mode === 'smart' || (mode === 'mixed' && i === 0) ? 'smart' : 'random',
    ]),
  );
}

function parseArgs(argv: string[]): Args {
  const args: Args = { games: 100, players: null, seed: 'sim', checkEvery: 1, bots: 'random' };
  const rest = argv.filter((a) => a !== '--');
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i];
    const value = rest[i + 1];
    if (value === undefined) throw new Error(`Falta el valor de ${key}`);
    if (key === '--games') args.games = Number(value);
    else if (key === '--players') args.players = Number(value);
    else if (key === '--seed') args.seed = value;
    else if (key === '--check-every') args.checkEvery = Number(value);
    else if (key === '--bots') {
      if (value !== 'random' && value !== 'smart' && value !== 'mixed') {
        throw new Error('--bots debe ser random, smart o mixed');
      }
      args.bots = value;
    } else throw new Error(`Argumento desconocido: ${key}`);
  }
  if (!Number.isInteger(args.games) || args.games < 1)
    throw new Error('--games debe ser un entero ≥ 1');
  if (args.players !== null && ![2, 3, 4].includes(args.players))
    throw new Error('--players debe ser 2, 3 o 4');
  return args;
}

const args = parseArgs(process.argv.slice(2));
const started = Date.now();
const reports: GameReport[] = [];
const wins: Record<string, number> = {};

for (let i = 0; i < args.games; i++) {
  const players = args.players ?? 2 + (i % 3);
  const report = simulateGame(`${args.seed}-${i}`, players, {
    maxSteps: 20000,
    checkEvery: args.checkEvery,
    bots: botsFor(args.bots, players),
  });
  reports.push(report);
  if (report.winner) wins[report.winner] = (wins[report.winner] ?? 0) + 1;
  if (report.violations.length > 0) {
    console.error(`✗ ${report.seed}: ${report.violations[0]}`);
  } else if (!report.finished) {
    console.error(`✗ ${report.seed}: no terminó en ${report.steps} pasos`);
  }
  if ((i + 1) % 100 === 0) console.log(`… ${i + 1}/${args.games}`);
}

const broken = reports.filter((r) => r.violations.length > 0);
const stalled = reports.filter((r) => r.violations.length === 0 && !r.finished);
const finished = reports.filter((r) => r.finished);
const avg = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

console.log('\n── Resumen ──');
console.log(`Partidas:              ${reports.length}`);
console.log(`Terminadas:            ${finished.length}`);
console.log(`Con invariantes rotas: ${broken.length}`);
console.log(`Atascadas:             ${stalled.length}`);
console.log(`Turnos (media):        ${avg(finished.map((r) => r.turns)).toFixed(1)}`);
console.log(`Acciones (media):      ${avg(finished.map((r) => r.steps)).toFixed(0)}`);
console.log(`Victorias por asiento: ${JSON.stringify(wins)}`);
console.log(`Tiempo:                ${((Date.now() - started) / 1000).toFixed(1)} s`);

if (broken.length > 0 || stalled.length > 0) process.exit(1);
