// One launch of an already-installed case with a locally built horno in
// place of the published one — the loop for fixing horno against a real
// installation without releasing it first.
//
//   node probe.mjs <case id> <horno.jar> [jvm flags...]
//
// The case has to have been run with `--keep` (or have failed, which keeps
// it). PROBE_CP adds class path entries after horno; PROBE_MS is how long to
// let the game run before it is killed (default 90000).
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLaunch } from '@opys/runtime';

const [id, horno, ...flags] = process.argv.slice(2);
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'work', id);
const vars = {
  root: path.join(dir, 'root'),
  username: 'Player',
  uuid: '00000000-0000-0000-0000-000000000001',
  token: '0',
};
const spec = await buildLaunch(
  { bundle: path.join(dir, 'case.opys') },
  { vars },
);
const extra = process.env.PROBE_CP ? path.delimiter + process.env.PROBE_CP : '';
const swap = (arg) =>
  arg.replace(/[^:;]*[\\/]horno-[^:;]*\.jar/g, path.resolve(horno) + extra);
const result = spawnSync(spec.command, [...flags, ...spec.args.map(swap)], {
  cwd: spec.cwd ?? vars.root,
  stdio: 'inherit',
  env: { ...process.env, ...spec.env },
  timeout: Number(process.env.PROBE_MS ?? 90_000),
});
console.log('exit', result.status, result.signal);
