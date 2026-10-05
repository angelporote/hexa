// Falla si algún archivo versionado contiene los términos de marca prohibidos
// (ver «Propiedad intelectual» en CLAUDE.md). Se excluyen CLAUDE.md y este script,
// que necesitan nombrarlos.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const FORBIDDEN = [/catan/i, /settlers/i, /colonos de/i];
const EXCLUDED = new Set(['CLAUDE.md', 'scripts/check-forbidden-terms.mjs']);

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
  encoding: 'utf8',
})
  .split('\n')
  .filter((f) => f && !EXCLUDED.has(f) && f !== 'pnpm-lock.yaml');

let violations = 0;
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  if (text.includes('\u0000')) continue; // binario
  const haystacks = [
    ['contenido', text],
    ['nombre de archivo', file],
  ];
  for (const [where, haystack] of haystacks) {
    for (const re of FORBIDDEN) {
      if (re.test(haystack)) {
        console.error(`Término prohibido ${re} en ${where} de ${file}`);
        violations++;
      }
    }
  }
}

if (violations > 0) {
  console.error(`\n${violations} infracción(es) de propiedad intelectual.`);
  process.exit(1);
}
console.log(`Sin términos prohibidos (${files.length} archivos revisados).`);
