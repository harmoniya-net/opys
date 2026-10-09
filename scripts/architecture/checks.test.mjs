/**
 * A check that cannot fail checks nothing. The real tree only ever shows that
 * these pass, so each is run here against a small world built by hand and
 * then broken one way at a time.
 *
 *   node --test scripts/architecture/
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  checkAll,
  checkBindingCrates,
  checkCrates,
  checkFeatures,
  checkHashMaps,
  checkImports,
  checkPackages,
  checkSources,
  checkWalls,
  checkWireTypes,
  checkWiring,
  packageOf,
  reachable,
  stripRustComments,
} from './checks.mjs';
import { readTypeScript } from './world.mjs';

// ── a small, sound world ────────────────────────────────────────────────────
// core ← dev ← forge, core ← runtime; forge and core have bindings.

const rules = () => ({
  crates: {
    'opys-core': { deps: [], binding: true },
    'opys-dev': { deps: ['opys-core'], binding: false },
    'opys-runtime': { deps: ['opys-core'], binding: false },
    'opys-forge': { deps: ['opys-core', 'opys-dev'], binding: true },
  },
  packages: {
    '@opys/core': { deps: [], binding: true, external: [] },
    '@opys/forge': { deps: ['@opys/core'], binding: true },
  },
  walls: [
    {
      name: 'build never installs',
      from: ['opys-dev', '@opys/forge'],
      never: ['opys-runtime'],
    },
    {
      name: 'runtime is core alone',
      from: ['opys-runtime'],
      only: ['opys-core'],
    },
  ],
  classes: {},
  hashMaps: {},
  withoutDefaultFeatures: [{ crate: 'opys-forge', dependency: 'opys-dev' }],
});

const dep = (name, extra = {}) => ({
  name,
  kind: 'normal',
  defaultFeatures: true,
  ...extra,
});
const crate = (name, deps, extra = {}) => ({
  name,
  dir: `crates/${name}`,
  publish: name !== 'opys-napi',
  cdylib: name === 'opys-napi',
  deps,
  sources: [],
  ...extra,
});
const file = (path, extra = {}) => ({
  path,
  imports: [],
  classes: [],
  doubleCasts: [],
  escapes: [],
  ...extra,
});
const imp = (specifier, typeOnly = false, names = []) => ({
  specifier,
  line: 1,
  typeOnly,
  names,
});
/** A module of the addon: the crate it is named after, as JS sees it. */
const module = (stem, text) => ({
  path: `crates/opys-napi/src/${stem}.rs`,
  text,
});

const world = () => ({
  crates: [
    crate('opys-core', []),
    crate('opys-dev', [dep('opys-core')]),
    crate('opys-runtime', [dep('opys-core')]),
    crate('opys-forge', [
      dep('opys-core'),
      dep('opys-dev', { defaultFeatures: false }),
    ]),
    crate('opys-napi', [dep('opys-core'), dep('opys-forge')], {
      sources: [
        module('lib', 'pub mod core;\npub mod forge;'),
        module('core', 'opys_core::parse_manifest(&input)'),
        module(
          'forge',
          'opys_forge::resolve(o); opys_core::Manifest::default()',
        ),
      ],
    }),
  ],
  packages: [
    {
      name: '@opys/core',
      dir: 'packages/core',
      dependencies: { '@opys/binding': '1' },
      peerDependencies: {},
      devDependencies: {},
      lib: [
        file('packages/core/lib/index.ts', {
          imports: [imp('@opys/binding', false, ['core'])],
        }),
      ],
      tests: [],
    },
    {
      name: '@opys/forge',
      dir: 'packages/forge',
      dependencies: { '@opys/core': '1', '@opys/binding': '1' },
      peerDependencies: {},
      devDependencies: {},
      lib: [
        file('packages/forge/lib/index.ts', {
          imports: [
            imp('@opys/core'),
            imp('node:fs'),
            imp('@opys/binding', false, ['forge']),
          ],
        }),
      ],
      tests: [
        file('packages/forge/tests/a.test.ts', {
          imports: [imp('vitest'), imp('../lib/index')],
        }),
      ],
    },
  ],
  bindings: [
    { name: '@opys/binding', crate: 'opys-napi', dir: 'crates/opys-napi' },
  ],
  root: {
    workspaces: ['packages/core', 'packages/forge', 'crates/opys-napi'],
    devDependencies: { vitest: '1' },
  },
  release: {
    workflow: [
      '  working-directory: crates/opys-napi',
      '  path: crates/opys-napi/*.node',
      '  for crate in $(node scripts/release/crates.mjs); do',
      '    cargo publish -p "$crate"',
      '',
    ].join('\n'),
    smoke: `require('../crates/opys-napi/index.js');`,
  },
});

/** The messages a check produces once `change` has been applied. */
const broken = (check, change) => {
  const r = rules();
  const w = world();
  change(w, r);
  return check(r, w).map((v) => v.message);
};
const crateOf = (w, name) => w.crates.find((c) => c.name === name);
const packageNamed = (w, name) => w.packages.find((p) => p.name === name);
const one = (messages, pattern) => {
  assert.equal(
    messages.length,
    1,
    `expected one violation, got: ${JSON.stringify(messages)}`,
  );
  assert.match(messages[0], pattern);
};

test('the sound world passes every check', () => {
  assert.deepEqual(checkAll(rules(), world()), []);
});

// ── crates ──────────────────────────────────────────────────────────────────

test('a crate nobody declared is refused', () => {
  one(
    broken(checkCrates, (w) => w.crates.push(crate('opys-new', []))),
    /is not declared/,
  );
});

test('a declared crate that is gone is refused', () => {
  one(
    broken(
      checkCrates,
      (w, r) => (r.crates['opys-ghost'] = { deps: [], binding: false }),
    ),
    /not in the workspace/,
  );
});

test('a dependency outside the allow-list is refused, whatever its kind', () => {
  one(
    broken(checkCrates, (w) =>
      crateOf(w, 'opys-core').deps.push(dep('opys-dev', { kind: 'dev' })),
    ),
    /depends on opys-dev/,
  );
});

/** The addon, and one of its modules by the crate it exposes. */
const addon = (w) => crateOf(w, 'opys-napi');
const moduleOf = (w, stem) =>
  addon(w).sources.find((source) => source.path.endsWith(`/${stem}.rs`));

test('a module must exist exactly where a crate is declared as exposed', () => {
  one(
    broken(
      checkCrates,
      (w) =>
        (addon(w).sources = addon(w).sources.filter(
          (source) => source !== moduleOf(w, 'forge'),
        )),
    ),
    /is declared as exposed to JS, but opys-napi has no module/,
  );
  one(
    broken(checkCrates, (w) =>
      addon(w).sources.push(module('dev', 'opys_dev::assemble(o, c)')),
    ),
    /declared as not exposed to JS/,
  );
});

test('a module uses its own crate and names nothing that crate does not reach', () => {
  one(
    broken(checkBindingCrates, (w) => {
      moduleOf(w, 'forge').text = 'opys_core::Manifest::default()';
      addon(w).deps = [dep('opys-core')];
    }),
    /does not use opys-forge/,
  );
  // The wall between build time and runtime, held inside the one addon.
  one(
    broken(
      checkBindingCrates,
      (w) => (moduleOf(w, 'forge').text += ' opys_runtime::install(m)'),
    ),
    /names opys-runtime, which opys-forge itself does not reach/,
  );
  // What the crate reaches transitively is fine.
  assert.deepEqual(
    broken(
      checkBindingCrates,
      (w) => (moduleOf(w, 'forge').text += ' opys_dev::assemble(o, c)'),
    ),
    [],
  );
});

test('the addon links nothing its modules do not use', () => {
  one(
    broken(checkBindingCrates, (w) => addon(w).deps.push(dep('opys-runtime'))),
    /depends on opys-runtime, which none of its modules uses/,
  );
});

test('the addon is a cdylib that stays off crates.io', () => {
  one(
    broken(checkBindingCrates, (w) => (addon(w).cdylib = false)),
    /not a cdylib/,
  );
  one(
    broken(checkBindingCrates, (w) => (addon(w).publish = true)),
    /npm only/,
  );
});

test('a dependency pinned to no default features is held to it', () => {
  one(
    broken(
      checkFeatures,
      (w) => (crateOf(w, 'opys-forge').deps[1].defaultFeatures = true),
    ),
    /default features/,
  );
  one(
    broken(checkFeatures, (w) => (crateOf(w, 'opys-forge').deps = [])),
    /expected to depend/,
  );
});

// ── packages ────────────────────────────────────────────────────────────────

test('a package nobody declared is refused, and so is a declared one that is gone', () => {
  const undeclared = broken(
    checkPackages,
    (w, r) => delete r.packages['@opys/forge'],
  );
  // The package, and the binding that now has no declared wrapper.
  assert.equal(undeclared.length, 2);
  assert.match(undeclared[0], /is not declared/);
  assert.match(undeclared[1], /has no @opys\/forge package/);
  one(
    broken(
      checkPackages,
      (w, r) => (r.packages['@opys/ghost'] = { deps: [], binding: false }),
    ),
    /not under packages/,
  );
});

test('a package dependency outside the allow-list is refused, devDependencies included', () => {
  one(
    broken(
      checkPackages,
      (w) =>
        (packageNamed(w, '@opys/core').devDependencies['@opys/forge'] = '1'),
    ),
    /depends on @opys\/forge/,
  );
});

test('a package takes its own namespace of the addon, and no other', () => {
  const taking =
    (...names) =>
    (w) =>
      packageNamed(w, '@opys/forge').lib[0].imports.push(
        imp('@opys/binding', false, names),
      );
  one(
    broken(checkImports, taking('core')),
    /takes 'core' from @opys\/binding; @opys\/forge imports its own namespace, 'forge'/,
  );
  // All of it at once is every sibling's namespace too.
  one(broken(checkImports, taking('*')), /takes '\*' from @opys\/binding/);
  assert.deepEqual(broken(checkImports, taking('forge')), []);
});

test('only a declared wrapper depends on the addon, and a wrapper must', () => {
  one(
    broken(
      checkPackages,
      (w, r) => (r.packages['@opys/forge'].binding = false),
    ).filter((message) => /not declared as a wrapper/.test(message)),
    /depends on @opys\/binding, but is not declared as a wrapper/,
  );
  one(
    broken(
      checkPackages,
      (w) =>
        delete packageNamed(w, '@opys/forge').dependencies['@opys/binding'],
    ),
    /does not depend on @opys\/binding/,
  );
});

test('a module nobody wraps, and a second addon, are both refused', () => {
  one(
    broken(checkPackages, (w) =>
      addon(w).sources.push(module('dev', 'opys_dev::assemble(o, c)')),
    ),
    /has no @opys\/dev package/,
  );
  one(
    broken(checkPackages, (w) =>
      w.bindings.push({
        name: '@opys/forge-binding',
        crate: 'opys-forge-napi',
        dir: 'crates/opys-forge-napi',
      }),
    ),
    /there is one addon, opys-napi, published as @opys\/binding/,
  );
});

// ── imports ─────────────────────────────────────────────────────────────────

const libOf = (w, name) => packageNamed(w, name).lib[0];

test('an import the package does not declare is refused', () => {
  one(
    broken(checkImports, (w) =>
      libOf(w, '@opys/forge').imports.push(imp('fflate/browser')),
    ),
    /imports fflate,/,
  );
});

test('lib may not lean on a devDependency, but a test may', () => {
  const dev = (w) =>
    (packageNamed(w, '@opys/forge').devDependencies.nock = '1');
  one(
    broken(
      checkImports,
      (w) => (dev(w), libOf(w, '@opys/forge').imports.push(imp('nock'))),
    ),
    /does not declare as a dependency$/,
  );
  assert.deepEqual(
    broken(
      checkImports,
      (w) => (
        dev(w),
        packageNamed(w, '@opys/forge').tests[0].imports.push(imp('nock'))
      ),
    ),
    [],
  );
});

test('a type-only import is satisfied by its @types package', () => {
  const types = (w) =>
    (packageNamed(w, '@opys/forge').dependencies['@types/tar'] = '1');
  assert.deepEqual(
    broken(
      checkImports,
      (w) => (types(w), libOf(w, '@opys/forge').imports.push(imp('tar', true))),
    ),
    [],
  );
  one(
    broken(
      checkImports,
      (w) => (types(w), libOf(w, '@opys/forge').imports.push(imp('tar'))),
    ),
    /imports tar,/,
  );
});

test("a subpath into another package's internals is refused", () => {
  one(
    broken(checkImports, (w) =>
      libOf(w, '@opys/forge').imports.push(imp('@opys/core/lib/val')),
    ),
    /reaches into @opys\/core/,
  );
});

test('a relative import that leaves the package is refused', () => {
  one(
    broken(checkImports, (w) => {
      libOf(w, '@opys/forge').imports.push(imp('../../core/lib/index'));
      libOf(w, '@opys/forge').escapes.push('../../core/lib/index');
    }),
    /leaves the package/,
  );
});

// ── sources ─────────────────────────────────────────────────────────────────

test('a class in lib is an Error, an exemption, or a violation', () => {
  const add = (cls) => (w) =>
    libOf(w, '@opys/forge').classes.push({ line: 3, ...cls });
  one(
    broken(checkSources, add({ name: 'Cache', extendsError: false })),
    /class Cache/,
  );
  assert.deepEqual(
    broken(checkSources, add({ name: 'Boom', extendsError: true })),
    [],
  );
  assert.deepEqual(
    broken(checkSources, (w, r) => {
      add({ name: 'Cache', extendsError: false })(w);
      r.classes['packages/forge/lib/index.ts#Cache'] = 'because';
    }),
    [],
  );
});

test('an exemption that outlived its class is itself a violation', () => {
  one(
    broken(
      checkSources,
      (w, r) => (r.classes['packages/forge/lib/gone.ts#Gone'] = 'because'),
    ),
    /drop the exemption/,
  );
});

test('a double cast is refused in lib and in tests', () => {
  one(
    broken(checkSources, (w) => libOf(w, '@opys/forge').doubleCasts.push(9)),
    /as unknown as/,
  );
  one(
    broken(checkSources, (w) =>
      packageNamed(w, '@opys/forge').tests[0].doubleCasts.push(9),
    ),
    /as unknown as/,
  );
});

const withSource = (text) => (w) =>
  crateOf(w, 'opys-core').sources.push({
    path: 'crates/opys-core/src/a.rs',
    text,
  });

test('a wire type is pub(crate) at most and is never re-exported', () => {
  assert.deepEqual(
    broken(
      checkWireTypes,
      withSource('pub(crate) struct AWire {}\nstruct BWire;'),
    ),
    [],
  );
  one(
    broken(checkWireTypes, withSource('pub struct AWire {}')),
    /AWire is pub/,
  );
  one(broken(checkWireTypes, withSource('pub enum AWire {}')), /AWire is pub/);
  one(
    broken(checkWireTypes, withSource('pub use crate::a::{B, AWire};')),
    /re-exports AWire/,
  );
  // Prose about a wire type is not a wire type.
  assert.deepEqual(
    broken(checkWireTypes, withSource('// pub struct AWire {}')),
    [],
  );
});

test('a HashMap is an exemption or a violation, and a stale exemption is one too', () => {
  one(
    broken(checkHashMaps, withSource('use std::collections::HashMap;')),
    /uses a HashMap/,
  );
  assert.deepEqual(
    broken(
      checkHashMaps,
      withSource('/// was a `HashMap` once\nuse std::collections::BTreeMap;'),
    ),
    [],
  );
  assert.deepEqual(
    broken(checkHashMaps, (w, r) => {
      withSource('let m: HashMap<u8, u8>;')(w);
      r.hashMaps['crates/opys-core/src/a.rs'] = 'lookup';
    }),
    [],
  );
  one(
    broken(
      checkHashMaps,
      (w, r) => (r.hashMaps['crates/opys-core/src/gone.rs'] = 'lookup'),
    ),
    /drop the exemption/,
  );
});

// ── walls ───────────────────────────────────────────────────────────────────

test('a wall is held over everything a crate reaches, not just what it names', () => {
  // forge → dev → runtime: forge itself names nothing but core and dev.
  one(
    broken(checkWalls, (w, r) => {
      r.walls = [
        {
          name: 'forge never installs',
          from: ['opys-forge'],
          never: ['opys-runtime'],
        },
      ];
      crateOf(w, 'opys-dev').deps.push(dep('opys-runtime'));
    }),
    /reaches opys-runtime in the tree/,
  );
});

test('a wall crosses napi: a wrapper reaches what the crate behind it reaches', () => {
  const messages = broken(checkWalls, (w) =>
    crateOf(w, 'opys-forge').deps.push(dep('opys-runtime')),
  );
  assert.equal(messages.length, 1);
  assert.match(
    messages[0],
    /reaches opys-runtime in the tree — "build never installs"/,
  );
});

test('an `only` wall refuses anything outside its list', () => {
  one(
    broken(checkWalls, (w) =>
      crateOf(w, 'opys-runtime').deps.push(dep('opys-dev')),
    ),
    /reaches opys-dev in the tree — "runtime is core alone"/,
  );
});

test('an allow-list that contradicts a wall is reported in the rules, once', () => {
  // The tree is untouched and still sound; only the allow-list was loosened.
  // dev reaches runtime, and @opys/forge reaches it through its crate and dev.
  const messages = broken(checkWalls, (w, r) =>
    r.crates['opys-dev'].deps.push('opys-runtime'),
  );
  assert.equal(messages.length, 2);
  assert.ok(
    messages.every((m) => /reaches opys-runtime in rules\.mjs/.test(m)),
  );
});

test('a wall that names something that does not exist is refused', () => {
  one(
    broken(checkWalls, (w, r) =>
      r.walls.push({ name: 'x', from: ['opys-nope'], never: [] }),
    ),
    /does not exist/,
  );
});

// ── wiring ──────────────────────────────────────────────────────────────────

test('a package or binding missing from workspaces is refused', () => {
  one(
    broken(checkWiring, (w) => w.root.workspaces.pop()),
    /workspaces is missing crates\/opys-napi/,
  );
});

test('workspaces lists a package after what it is built on', () => {
  one(
    broken(checkWiring, (w) =>
      w.root.workspaces.splice(0, 2, 'packages/forge', 'packages/core'),
    ),
    /lists @opys\/forge before @opys\/core/,
  );
});

test('the addon is smoke-tested', () => {
  one(
    broken(checkWiring, (w) => (w.release.smoke = '// nothing loaded')),
    /never loads @opys\/binding/,
  );
});

test('the release builds the one addon and orders its crates without a list', () => {
  one(
    broken(
      checkWiring,
      (w) =>
        (w.release.workflow = w.release.workflow.replaceAll(
          'crates/opys-napi',
          'bindings',
        )),
    ),
    /no longer builds the addon/,
  );
  one(
    broken(
      checkWiring,
      (w) =>
        (w.release.workflow = w.release.workflow.replace(
          'scripts/release/crates.mjs',
          'order.txt',
        )),
    ),
    /no longer takes the crates\.io publish order/,
  );
  one(
    broken(
      checkWiring,
      (w) =>
        (w.release.workflow += '  working-directory: crates/opys-forge-napi\n'),
    ),
    /names opys-forge-napi; there is one addon/,
  );
  one(
    broken(
      checkWiring,
      (w) => (w.release.workflow += '- run: cargo publish -p opys-core\n'),
    ),
    /publishes a crate by name/,
  );
});

// ── the helpers the checks stand on ─────────────────────────────────────────

test('reachable follows edges transitively and survives a cycle', () => {
  assert.deepEqual(
    [...reachable({ a: ['b'], b: ['c'], c: ['a'] }, 'a')].sort(),
    ['a', 'b', 'c'],
  );
  assert.deepEqual([...reachable({ a: [] }, 'a')], []);
});

test('packageOf reads a scoped or bare name off a specifier', () => {
  assert.equal(packageOf('@opys/core/lib/val'), '@opys/core');
  assert.equal(packageOf('fflate/browser'), 'fflate');
  assert.equal(packageOf('zod'), 'zod');
});

test('stripRustComments drops comments and keeps a URL', () => {
  assert.equal(stripRustComments('let a = 1; // HashMap'), 'let a = 1; ');
  assert.equal(stripRustComments('/* HashMap\n */ x'), '\n x');
  assert.equal(
    stripRustComments('const U: &str = "https://x/y";'),
    'const U: &str = "https://x/y";',
  );
});

test('readTypeScript finds every way a file can import', () => {
  const text = [
    "import a from 'pkg-a';",
    "import type { B } from 'pkg-b';",
    "export * from './local';",
    "export type { C } from 'pkg-c';",
    "const d = await import('pkg-d');",
    "const e = require('pkg-e');",
    "type F = import('pkg-f').F;",
    "import '../../other/lib/x';",
  ].join('\n');
  const { imports, escapes } = readTypeScript(
    '/repo/packages/p/lib/index.ts',
    text,
    '/repo/packages/p',
  );
  assert.deepEqual(
    imports.map((i) => [i.specifier, i.typeOnly]),
    [
      ['pkg-a', false],
      ['pkg-b', true],
      ['./local', false],
      ['pkg-c', true],
      ['pkg-d', false],
      ['pkg-e', false],
      ['pkg-f', true],
      ['../../other/lib/x', false],
    ],
  );
  assert.deepEqual(escapes, ['../../other/lib/x']);
});

test('readTypeScript tells an Error from a class, and a double cast from a cast', () => {
  const text = [
    'export class Boom extends Error {}',
    'class Cache {}',
    'const a = x as unknown as Y;',
    'const b = (x as unknown) as Y;',
    'const c = x as Y;',
    '// no `as unknown as` here',
  ].join('\n');
  const { classes, doubleCasts } = readTypeScript(
    '/r/p/lib/a.ts',
    text,
    '/r/p',
  );
  assert.deepEqual(classes, [
    { name: 'Boom', line: 1, extendsError: true },
    { name: 'Cache', line: 2, extendsError: false },
  ]);
  assert.deepEqual(doubleCasts, [3, 4]);
});
