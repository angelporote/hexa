// Simulador de partidas: bots aleatorios juegan N partidas completas comprobando invariantes.
// Uso: pnpm sim -- --games 1000 [--players 2|3|4] [--seed prefijo] [--check-every N]
import { simulateGame } from '@hexa/engine';
import type { GameReport } from '@hexa/engine';

interface Args {
  games: number;
  players: number | null;
  seed: string;
  checkEvery: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { games: 100, players: null, seed: 'sim', checkEvery: 1 };
  const rest = argv.filter((a) => a !== '--');
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i];
    const value = rest[i + 1];
    if (value === undefined) throw new Error(`Falta el valor de ${key}`);
    if (key === '--games') args.games = Number(value);
    else if (key === '--players') args.players = Number(value);
    else if (key === '--seed') args.seed = value;
    else if (key === '--check-every') args.checkEvery = Number(value);
    else throw new Error(`Argumento desconocido: ${key}`);
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
