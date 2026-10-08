// Every config under examples/ is built, so a page cannot show one that does
// not resolve. A page includes an example with `<<< @/examples/<name>/…`
// rather than pasting it, which is what keeps the two the same text.
//
// Needs the packages built (`npm run build` at the repository root) and the
// network: a build resolves real versions. An example that needs a secret is
// skipped when the secret is not set, and says so.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const opys = path.join(here, '../packages/cli/dist/opys.mjs');
const root = path.join(here, 'examples');
const needs = { curseforge: 'CURSEFORGE_TOKEN' };

let failed = 0;
for (const name of fs.readdirSync(root).sort()) {
  const dir = path.join(root, name);
  if (!fs.existsSync(path.join(dir, 'opys.config.mjs'))) continue;
  const secret = Object.entries(needs).find(([k]) => name.includes(k))?.[1];
  if (secret && !process.env[secret]) {
    console.log(`skip  ${name} (${secret} is not set)`);
    continue;
  }
  const out = path.join(fs.mkdtempSync('/tmp/opys-example-'), 'out.opys');
  const r = spawnSync('node', [opys, 'build', '-o', out], {
    cwd: dir,
    encoding: 'utf8',
  });
  if (r.status === 0) {
    console.log(`ok    ${name}`);
  } else {
    failed++;
    console.log(`FAIL  ${name}\n${r.stdout}${r.stderr}`);
  }
}
process.exit(failed ? 1 : 0);
