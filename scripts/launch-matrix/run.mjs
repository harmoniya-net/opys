// The launch matrix: build a bundle per case, install and launch it twice
// (cold, then warm), and call it a pass when the game owns a window and is
// still alive once it has settled. See README.md.
//
//   node run.mjs [--cases <file>] [--only <substr>] [--force] [--keep]
//                [--no-pool] [--budget <minutes>]
//
// Exits 1 when any case failed.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OPYS = path.resolve(HERE, '../../packages/cli/dist/opys.mjs');
const WORK = path.join(HERE, 'work');
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);

const cases = JSON.parse(
  fs.readFileSync(opt('--cases') ?? path.join(HERE, 'cases.json'), 'utf8'),
);
const only = opt('--only');
// How long a launch may take to show a window. Generous by default, because a
// cold install on a slow link is most of half an hour; a CI run on a
// fast one wants a hang to cost minutes.
const BUDGET_MS = Number(opt('--budget') ?? 30) * 60e3;

const READY =
  /Sound engine started|OpenAL initialized|SoundSystem.*started|Starting up SoundSystem|Created: \d+x\d+.*atlas|Forge Mod Loader has successfully loaded/;
// Not the crash report's header: FML 1.7.10 prints one at every start, to log
// the machine's specs ("THIS IS NOT A ERROR").
const FATAL =
  /Exception in thread "main"|Game crashed|Crash report saved|#@!@#|Could not find or load main class|A fatal error has been detected/;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sh = (cmd, args) => {
  try {
    return execFileSync(cmd, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 1 << 28,
    });
  } catch {
    return '';
  }
};

function descendants(root) {
  const kids = new Map();
  for (const d of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    try {
      const stat = fs.readFileSync(`/proc/${d}/stat`, 'utf8');
      const ppid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]);
      if (!kids.has(ppid)) kids.set(ppid, []);
      kids.get(ppid).push(Number(d));
    } catch {}
  }
  const out = new Set([root]);
  const q = [root];
  while (q.length)
    for (const k of kids.get(q.pop()) ?? [])
      if (!out.has(k)) {
        out.add(k);
        q.push(k);
      }
  return out;
}

// Where a game's window goes, and how it is found and photographed. Two
// stages: a headless Hyprland monitor on a desktop (the real GPU, and never
// the screen someone is working at), or one Xvfb display per launch on a
// machine with no desktop at all (`MATRIX_STAGE=xvfb`, software GL).
const CLASSES =
  '^(Minecraft.*|net-minecraft.*|org-lwjgl.*|com-mojang.*|GLFW.*)$';
const hyprland = {
  setup() {
    if (!sh('hyprctl', ['monitors', '-j']).includes('"opys-headless"'))
      sh('hyprctl', ['output', 'create', 'headless', 'opys-headless']);
    sh('hyprctl', [
      'keyword',
      'workspace',
      'name:opys, monitor:opys-headless, default:true, persistent:true',
    ]);
    // The workspace has to be the one the monitor shows, or grim photographs
    // the wallpaper; showing it takes a moment of focus, handed straight back.
    const shown = JSON.parse(sh('hyprctl', ['monitors', '-j']) || '[]');
    const back = shown.find((m) => m.focused)?.name;
    if (
      shown.find((m) => m.name === 'opys-headless')?.activeWorkspace?.name !==
        'opys' &&
      back
    )
      sh('hyprctl', [
        '--batch',
        `dispatch focusmonitor opys-headless ; dispatch workspace name:opys ; dispatch focusmonitor ${back}`,
      ]);
    sh('hyprctl', [
      'keyword',
      'windowrule',
      `match:class ${CLASSES}, workspace name:opys silent`,
    ]);
    sh('hyprctl', [
      'keyword',
      'windowrule',
      `match:class ${CLASSES}, no_initial_focus on`,
    ]);
  },
  open: () => ({ env: {}, close() {} }),
  windowOf(_stage, pids) {
    let clients = [];
    try {
      clients = JSON.parse(sh('hyprctl', ['clients', '-j']) || '[]');
    } catch {}
    const w = clients.find(
      (c) => pids.has(c.pid) && c.mapped !== false && c.size?.[0] > 1,
    );
    if (!w) return undefined;
    // A window whose class the rule did not foresee is sent after it appears.
    if (w.workspace?.name !== 'opys')
      sh('hyprctl', [
        'dispatch',
        'movetoworkspacesilent',
        `name:opys,address:${w.address}`,
      ]);
    return { title: w.title, at: w.at, size: w.size };
  },
  shoot: (_stage, w, file) =>
    sh('grim', ['-g', `${w.at[0]},${w.at[1]} ${w.size[0]}x${w.size[1]}`, file]),
};
let nextDisplay = Number(process.env.MATRIX_DISPLAY_BASE ?? 90);
const xvfb = {
  setup() {},
  open() {
    const display = `:${nextDisplay++}`;
    const server = spawn(
      'Xvfb',
      [
        display,
        '-screen',
        '0',
        '1280x720x24',
        '+extension',
        'GLX',
        '+extension',
        'RANDR',
        '-nolisten',
        'tcp',
      ],
      { stdio: 'ignore' },
    );
    return {
      display,
      env: {
        DISPLAY: display,
        LIBGL_ALWAYS_SOFTWARE: '1',
        // 26.3 opens its window through SDL, which asks GLX for a visual
        // Xvfb on Mesa 25 (the GitHub runner) does not offer, and then has no
        // backend at all. EGL on the same display does work there.
        SDL_VIDEO_FORCE_EGL: '1',
      },
      close: () => server.kill('SIGKILL'),
    };
  },
  // The display belongs to one launch, so any real window on it is the game's.
  windowOf(stage) {
    const tree = sh('xwininfo', ['-display', stage.display, '-root', '-tree']);
    for (const line of tree.split('\n')) {
      const m = line.match(
        /^\s+0x[0-9a-f]+ (?:"(.*)"|\(has no name\)): \(.*\)\s+(\d+)x(\d+)\+/,
      );
      if (
        m &&
        Number(m[2]) >= 300 &&
        Number(m[3]) >= 200 &&
        sh('xwininfo', [
          '-display',
          stage.display,
          '-id',
          line.trim().split(' ')[0],
        ]).includes('IsViewable')
      )
        return { title: m[1] ?? '', size: [Number(m[2]), Number(m[3])] };
    }
    return undefined;
  },
  shoot: (stage, _w, file) =>
    sh('import', ['-display', stage.display, '-window', 'root', file]),
};
const STAGE = process.env.MATRIX_STAGE === 'xvfb' ? xvfb : hyprland;
STAGE.setup();

function run(args, env, logFile, timeoutMs) {
  return new Promise((resolve) => {
    const out = fs.openSync(logFile, 'w');
    const t0 = Date.now();
    const child = spawn('node', [OPYS, ...args], {
      cwd: HERE,
      env: { ...process.env, ...env },
      stdio: ['ignore', out, out],
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('exit', (code) => {
      clearTimeout(timer);
      fs.closeSync(out);
      resolve({ code, ms: Date.now() - t0 });
    });
  });
}

async function launch(dir, tag, vars, { budgetMs, settleMs }) {
  const logFile = path.join(dir, `${tag}.log`);
  const out = fs.openSync(logFile, 'w');
  const args = [
    OPYS,
    'launch',
    path.join(dir, 'case.opys'),
    ...Object.entries(vars).flatMap(([k, v]) => ['--var', `${k}=${v}`]),
  ];
  const t0 = Date.now();
  const stage = STAGE.open();
  await sleep(stage.display ? 1500 : 0);
  const child = spawn('node', args, {
    cwd: dir,
    env: { ...process.env, ...stage.env },
    stdio: ['ignore', out, out],
    detached: true,
  });
  let exit = null;
  child.on('exit', (code, signal) => {
    exit = { code, signal };
  });
  const r = {
    tag,
    windowMs: null,
    readyMs: null,
    exit: null,
    fatal: null,
    alive: false,
    title: null,
  };
  const log = () => fs.readFileSync(logFile, 'utf8');

  while (!exit && Date.now() - t0 < budgetMs) {
    const w = STAGE.windowOf(stage, descendants(child.pid));
    if (w) {
      r.windowMs = Date.now() - t0;
      r.title = w.title;
      break;
    }
    await sleep(1500);
  }
  if (r.windowMs !== null) {
    const tw = Date.now();
    while (!exit && Date.now() - tw < settleMs) {
      if (r.readyMs === null && READY.test(log())) {
        r.readyMs = Date.now() - t0;
        await sleep(12000);
        break;
      }
      await sleep(1500);
    }
    const w = !exit && STAGE.windowOf(stage, descendants(child.pid));
    if (w) {
      r.title = w.title;
      STAGE.shoot(stage, w, path.join(dir, `${tag}.png`));
    }
    r.alive = !exit && Boolean(w);
  }
  r.exit = exit;
  r.totalMs = Date.now() - t0;
  if (!exit) {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {}
    for (let i = 0; i < 20 && !exit; i++) await sleep(500);
    if (!exit)
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {}
    await sleep(1000);
  }
  stage.close();
  fs.closeSync(out);
  const text = log();
  const m = text.match(FATAL);
  r.fatal = m ? m[0] : null;
  r.pass = r.alive && !r.fatal;
  return r;
}

// A pool of already-downloaded files, shared between cases. Only files a
// manifest names as a download are ever pooled or seeded — never what the
// loader's processors generate — and they are hard-linked, which is safe
// because the installer writes a `.partial` and renames over the target.
const POOL = path.join(HERE, 'pool');
const PREFIXES = {
  '${assets_root}/': 'assets/',
  '${library_directory}/': 'libraries/',
  '${java_runtime_dir}/': 'runtimes/',
};
function pooled(dir) {
  const manifest = JSON.parse(
    sh('unzip', ['-p', path.join(dir, 'case.opys'), 'manifest.json']) || '{}',
  );
  const out = [];
  for (const a of manifest.artifacts ?? []) {
    if (!a.source?.url || !(a.integrity || a.path.includes('/objects/')))
      continue;
    for (const [k, v] of Object.entries(PREFIXES))
      if (a.path.startsWith(k) && !a.path.includes('${', k.length))
        out.push(v + a.path.slice(k.length));
  }
  return out;
}
function link(fromRoot, toRoot, rels) {
  let n = 0;
  for (const rel of rels) {
    const from = path.join(fromRoot, rel),
      to = path.join(toRoot, rel);
    if (!fs.existsSync(from) || fs.existsSync(to)) continue;
    fs.mkdirSync(path.dirname(to), { recursive: true });
    try {
      fs.linkSync(from, to);
      n++;
    } catch {}
  }
  return n;
}

const summary = [];
for (const c of cases) {
  const id =
    `${c.loader}-${c.version || 'latest'}-j${c.java}${c.vendor ? '-' + c.vendor : ''}`.replace(
      /[^\w.-]/g,
      '_',
    );
  if (only && !id.includes(only)) continue;
  const dir = path.join(WORK, id);
  const resultFile = path.join(dir, 'result.json');
  if (fs.existsSync(resultFile) && !flag('--force')) {
    summary.push(JSON.parse(fs.readFileSync(resultFile, 'utf8')));
    continue;
  }
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const res = { id, case: c, at: new Date().toISOString() };
  console.log(`\n=== ${id}`);

  const env = {
    LOADER: c.loader,
    VERSION: c.version ?? '',
    JAVA: String(c.java),
    JAVA_VENDOR: c.vendor ?? '',
  };
  const b = await run(
    [
      'build',
      '-i',
      path.join(HERE, 'matrix.config.mjs'),
      '-o',
      path.join(dir, 'case.opys'),
    ],
    env,
    path.join(dir, 'build.log'),
    10 * 60e3,
  );
  res.build = b;
  console.log(`build   exit=${b.code} ${(b.ms / 1000).toFixed(1)}s`);
  if (b.code === 0) {
    res.bundleBytes = fs.statSync(path.join(dir, 'case.opys')).size;
    const vars = {
      root: path.join(dir, 'root'),
      username: 'Player',
      uuid: '00000000-0000-0000-0000-000000000001',
      token: '0',
    };
    const rels = pooled(dir);
    res.seeded = flag('--no-pool') ? 0 : link(POOL, vars.root, rels);
    console.log(`seeded  ${res.seeded}/${rels.length} file(s) from the pool`);
    for (const [tag, budgetMs] of [
      ['cold', BUDGET_MS],
      ['warm', Math.min(BUDGET_MS, 10 * 60e3)],
    ]) {
      const r = await launch(dir, tag, vars, {
        budgetMs,
        settleMs: c.settleMs ?? 90e3,
      });
      res[tag] = r;
      console.log(
        `${tag.padEnd(7)} ${r.pass ? 'PASS' : 'FAIL'} window=${r.windowMs}ms ready=${r.readyMs}ms exit=${JSON.stringify(r.exit)} fatal=${r.fatal} title=${r.title}`,
      );
      if (!r.pass) break;
    }
    res.harvested = link(vars.root, POOL, rels);
    try {
      res.rootBytes = Number(
        sh('du', ['-sb', path.join(dir, 'root')]).split('\t')[0],
      );
    } catch {}
  }
  res.pass = Boolean(res.build.code === 0 && res.cold?.pass && res.warm?.pass);
  fs.writeFileSync(resultFile, JSON.stringify(res, null, 2));
  summary.push(res);
  // Keep logs, screenshots and the bundle; the installation itself is ~1 GB.
  if (!flag('--keep') && res.pass)
    fs.rmSync(path.join(dir, 'root'), { recursive: true, force: true });
}

console.log(
  '\n' + summary.map((s) => `${s.pass ? 'PASS' : 'FAIL'}  ${s.id}`).join('\n'),
);
fs.mkdirSync(WORK, { recursive: true });
fs.writeFileSync(
  path.join(WORK, 'summary.json'),
  JSON.stringify(summary, null, 2),
);
if (summary.some((s) => !s.pass)) process.exitCode = 1;
