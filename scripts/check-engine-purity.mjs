// Falla si el código de producción de `packages/engine` usa Node, el navegador o fuentes de
// no determinismo (Math.random, Date.now…). Los tests y `test-utils.ts` quedan fuera.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'packages/engine/src';
const FORBIDDEN = [
  [/from\s+['"]node:/, "importa un módulo 'node:'"],
  [/\brequire\s*\(/, 'usa require()'],
  [/\bMath\.random\b/, 'usa Math.random'],
  [/\bDate\.now\b/, 'usa Date.now'],
  [/\bnew Date\b/, 'usa new Date'],
  [/\bperformance\.now\b/, 'usa performance.now'],
  [/\bprocess\./, 'usa process'],
  [/\b(?:window|document|localStorage|navigator)\./, 'usa APIs del navegador'],
  [/\b(?:fetch|setTimeout|setInterval)\s*\(/, 'usa red o temporizadores'],
];

function* sources(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sources(path);
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts') && name !== 'test-utils.ts') {
      yield path;
    }
  }
}

let violations = 0;
let count = 0;
for (const file of sources(ROOT)) {
  count++;
  const text = readFileSync(file, 'utf8');
  // Se ignoran los comentarios para no penalizar la documentación.
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const [pattern, reason] of FORBIDDEN) {
    if (pattern.test(code)) {
      console.error(`${file}: ${reason}`);
      violations++;
    }
  }
}

if (violations > 0) {
  console.error(`\n${violations} infracción(es) de pureza del motor.`);
  process.exit(1);
}
console.log(`Motor puro (${count} archivos revisados).`);
