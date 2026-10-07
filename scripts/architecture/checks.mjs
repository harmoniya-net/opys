/**
 * The checks, as pure functions: `(rules, world) → Violation[]`.
 *
 * `world` is a snapshot of the tree (see `world.mjs`) and `rules` is
 * `rules.mjs`. Nothing here reads a file, so each check is tested against a
 * world built by hand — including the one thing a real tree cannot show,
 * that the check fails when it should.
 *
 * @typedef {{ rule: string, where: string, message: string }} Violation
 */

const NAPI = /-napi$/;
const BINDING = /-binding$/;

const violation = (rule, where, message) => ({ rule, where, message });

/** `opys-forge-napi` → `opys-forge`. */
export const baseCrateOf = (binding) => binding.replace(NAPI, '');

/** Everything `from` reaches in `graph`, itself excluded. */
export function reachable(graph, from) {
  const seen = new Set();
  const walk = (node) => {
    for (const next of graph[node] ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      walk(next);
    }
  };
  walk(from);
  return seen;
}

const workspaceDeps = (crate) => [...new Set(crate.deps.map((d) => d.name))];

// ── crates ──────────────────────────────────────────────────────────────────

/** Every crate has a place, and names nothing outside it. */
export function checkCrates(rules, world) {
  const out = [];
  const actual = new Map(world.crates.map((c) => [c.name, c]));

  for (const name of Object.keys(rules.crates)) {
    if (!actual.has(name))
      out.push(
        violation('crates', name, 'is declared but is not in the workspace'),
      );
  }

  for (const crate of world.crates) {
    if (NAPI.test(crate.name)) continue;
    const rule = rules.crates[crate.name];
    if (!rule) {
      out.push(
        violation(
          'crates',
          crate.name,
          'is not declared in scripts/architecture/rules.mjs',
        ),
      );
      continue;
    }
    for (const dep of workspaceDeps(crate)) {
      if (!rule.deps.includes(dep))
        out.push(
          violation(
            'crates',
            crate.name,
            `depends on ${dep}, which it is not allowed to`,
          ),
        );
    }
    const binding = `${crate.name}-napi`;
    if (rule.binding && !actual.has(binding))
      out.push(
        violation(
          'bindings',
          crate.name,
          `is declared with a binding, but ${binding} does not exist`,
        ),
      );
    if (!rule.binding && actual.has(binding))
      out.push(
        violation(
          'bindings',
          crate.name,
          `is declared without a binding, but ${binding} exists`,
        ),
      );
  }
  return out;
}

/**
 * One binding per crate: `opys-<x>-napi` exposes `opys-<x>` and reaches
 * nothing that crate does not already reach.
 */
export function checkBindingCrates(rules, world) {
  const out = [];
  const graph = Object.fromEntries(
    Object.entries(rules.crates).map(([name, rule]) => [name, rule.deps]),
  );
  for (const crate of world.crates) {
    if (!NAPI.test(crate.name)) continue;
    const base = baseCrateOf(crate.name);
    if (!rules.crates[base]) {
      out.push(
        violation(
          'bindings',
          crate.name,
          `exposes ${base}, which is not a declared crate`,
        ),
      );
      continue;
    }
    const deps = workspaceDeps(crate);
    if (!deps.includes(base))
      out.push(
        violation(
          'bindings',
          crate.name,
          `does not depend on ${base}, the crate it is named after`,
        ),
      );
    const allowed = reachable(graph, base);
    for (const dep of deps) {
      if (dep !== base && !allowed.has(dep))
        out.push(
          violation(
            'bindings',
            crate.name,
            `depends on ${dep}, which ${base} itself does not reach`,
          ),
        );
    }
    if (!crate.cdylib)
      out.push(violation('bindings', crate.name, 'is not a cdylib'));
    if (crate.publish)
      out.push(
        violation(
          'bindings',
          crate.name,
          'is publishable to crates.io; a binding ships to npm only',
        ),
      );
  }
  return out;
}

/** A dependency that must be taken with `default-features = false`. */
export function checkFeatures(rules, world) {
  const out = [];
  for (const { crate: name, dependency } of rules.withoutDefaultFeatures) {
    const crate = world.crates.find((c) => c.name === name);
    const dep = crate?.deps.find(
      (d) => d.name === dependency && d.kind === 'normal',
    );
    if (!dep) {
      out.push(
        violation('features', name, `is expected to depend on ${dependency}`),
      );
    } else if (dep.defaultFeatures) {
      out.push(
        violation(
          'features',
          name,
          `takes ${dependency} with its default features; it must not`,
        ),
      );
    }
  }
  return out;
}

// ── packages ────────────────────────────────────────────────────────────────

const ownBinding = (name) => `${name}-binding`;
const isOpys = (name) => name.startsWith('@opys/');

/** Every package has a place, and declares nothing outside it. */
export function checkPackages(rules, world) {
  const out = [];
  const actual = new Map(world.packages.map((p) => [p.name, p]));
  const bindings = new Set(world.bindings.map((b) => b.name));

  for (const name of Object.keys(rules.packages)) {
    if (!actual.has(name))
      out.push(
        violation('packages', name, 'is declared but is not under packages/'),
      );
  }

  for (const pkg of world.packages) {
    const rule = rules.packages[pkg.name];
    if (!rule) {
      out.push(
        violation(
          'packages',
          pkg.name,
          'is not declared in scripts/architecture/rules.mjs',
        ),
      );
      continue;
    }
    const declared = {
      ...pkg.dependencies,
      ...pkg.peerDependencies,
      ...pkg.devDependencies,
    };
    for (const dep of Object.keys(declared).filter(isOpys)) {
      if (BINDING.test(dep)) {
        if (dep !== ownBinding(pkg.name) || !rule.binding)
          out.push(
            violation(
              'bindings',
              pkg.name,
              `depends on ${dep}; a package imports its own binding, never a sibling's`,
            ),
          );
      } else if (!rule.deps.includes(dep)) {
        out.push(
          violation(
            'packages',
            pkg.name,
            `depends on ${dep}, which it is not allowed to`,
          ),
        );
      }
    }
    const has = ownBinding(pkg.name) in pkg.dependencies;
    if (rule.binding && !has)
      out.push(
        violation(
          'bindings',
          pkg.name,
          `is declared as a wrapper but does not depend on ${ownBinding(pkg.name)}`,
        ),
      );
    if (rule.binding && !bindings.has(ownBinding(pkg.name)))
      out.push(
        violation(
          'bindings',
          pkg.name,
          `wraps ${ownBinding(pkg.name)}, which no crate publishes`,
        ),
      );

    if (rule.external) {
      const runtime = { ...pkg.dependencies, ...pkg.peerDependencies };
      for (const dep of Object.keys(runtime).filter((d) => !isOpys(d))) {
        if (!rule.external.includes(dep))
          out.push(
            violation(
              'packages',
              pkg.name,
              `depends on ${dep}; its third-party dependencies are fixed`,
            ),
          );
      }
    }
  }

  // The other direction: a binding nobody wraps is a crate with no JS surface.
  for (const binding of world.bindings) {
    const owner = binding.name.replace(BINDING, '');
    if (!rules.packages[owner]?.binding)
      out.push(
        violation(
          'bindings',
          binding.name,
          `has no ${owner} package declared as its wrapper`,
        ),
      );
    if (
      binding.name !==
      `@opys/${baseCrateOf(binding.crate).replace(/^opys-/, '')}-binding`
    )
      out.push(
        violation(
          'bindings',
          binding.crate,
          `publishes ${binding.name}; a binding is named after its crate`,
        ),
      );
  }
  return out;
}

const NODE_BUILTIN = /^node:/;

/** `@opys/core/x` → `@opys/core`; `fflate/browser` → `fflate`. */
export function packageOf(specifier) {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/**
 * What the sources import is what the package declares. A dependency that
 * resolves only because npm hoisted it is an undeclared edge, and a subpath
 * into another package reaches past its public surface.
 */
export function checkImports(rules, world) {
  const out = [];
  for (const pkg of world.packages) {
    const runtime = new Set(
      Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies }),
    );
    const development = new Set([
      ...runtime,
      ...Object.keys(pkg.devDependencies),
      ...Object.keys(world.root.devDependencies),
      pkg.name,
    ]);
    const scan = (files, allowed, kind) => {
      for (const file of files) {
        for (const { specifier, line, typeOnly } of file.imports) {
          const where = `${file.path}:${line}`;
          if (NODE_BUILTIN.test(specifier)) continue;
          if (specifier.startsWith('.')) {
            if (file.escapes?.includes(specifier))
              out.push(
                violation(
                  'imports',
                  where,
                  `'${specifier}' leaves the package; import the other package by name`,
                ),
              );
            continue;
          }
          const name = packageOf(specifier);
          if (isOpys(name) && specifier !== name)
            out.push(
              violation(
                'imports',
                where,
                `'${specifier}' reaches into ${name}; import its public entry`,
              ),
            );
          // `@types/x` satisfies a type-only import of `x`.
          if (
            !allowed.has(name) &&
            !(typeOnly && allowed.has(`@types/${name}`))
          )
            out.push(
              violation(
                'imports',
                where,
                `imports ${name}, which ${pkg.name} does not declare as a ${kind}`,
              ),
            );
        }
      }
    };
    scan(pkg.lib, runtime, 'dependency');
    scan(pkg.tests, development, 'dependency or devDependency');
  }
  return out;
}

/** Principles 1 and 2, as far as they can be read off the syntax tree. */
export function checkSources(rules, world) {
  const out = [];
  const used = new Set();
  for (const pkg of world.packages) {
    for (const file of pkg.lib) {
      for (const cls of file.classes) {
        const key = `${file.path}#${cls.name}`;
        if (cls.extendsError) continue;
        if (rules.classes[key]) used.add(key);
        else
          out.push(
            violation(
              'classes',
              `${file.path}:${cls.line}`,
              `class ${cls.name} — a class in lib/ is justified in rules.mjs or removed`,
            ),
          );
      }
    }
    for (const file of [...pkg.lib, ...pkg.tests]) {
      for (const line of file.doubleCasts)
        out.push(
          violation(
            'casts',
            `${file.path}:${line}`,
            '`as unknown as` — parse the value instead of asserting it',
          ),
        );
    }
  }
  for (const key of Object.keys(rules.classes)) {
    if (!used.has(key))
      out.push(
        violation(
          'classes',
          key,
          'is exempted in rules.mjs but no longer exists; drop the exemption',
        ),
      );
  }
  return out;
}

// ── Rust sources ────────────────────────────────────────────────────────────

/** Drop comments, so a rule about code is not tripped by prose about it. */
export function stripRustComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''))
    .replace(/(^|[^:"'])\/\/.*$/gm, '$1');
}

const WIRE_DEFINITION =
  /^[ \t]*(pub(?:\([a-z: ]+\))?[ \t]+)?(?:struct|enum|type)[ \t]+(\w+Wire)\b/gm;
const WIRE_REEXPORT = /^[ \t]*pub[ \t]+use\b[^;]*\b(\w+Wire)\b/gm;

/**
 * A `…Wire` type is `pub(crate)` at most, so no consumer can name one. Inside
 * its crate it may be named freely — a document's wire type is built out of
 * its fields' wire types — and the compiler keeps it there once it is not
 * `pub`. So visibility is the whole check.
 */
export function checkWireTypes(rules, world) {
  const out = [];
  for (const crate of world.crates) {
    for (const source of crate.sources) {
      const code = stripRustComments(source.text);
      for (const [, visibility, name] of code.matchAll(WIRE_DEFINITION)) {
        if (visibility?.trim() === 'pub')
          out.push(
            violation(
              'wire',
              source.path,
              `${name} is pub; a wire type is pub(crate) at most`,
            ),
          );
      }
      for (const [, name] of code.matchAll(WIRE_REEXPORT))
        out.push(
          violation(
            'wire',
            source.path,
            `re-exports ${name}; a wire type never leaves its crate`,
          ),
        );
    }
  }
  return out;
}

/** A file that names `HashMap` says what for, in rules.mjs. */
export function checkHashMaps(rules, world) {
  const out = [];
  const used = new Set();
  for (const crate of world.crates) {
    for (const source of crate.sources) {
      if (!/\bHashMap\b/.test(stripRustComments(source.text))) continue;
      if (rules.hashMaps[source.path]) used.add(source.path);
      else
        out.push(
          violation(
            'ordering',
            source.path,
            'uses a HashMap; use a BTreeMap, or say in rules.mjs why its order never reaches a manifest',
          ),
        );
    }
  }
  for (const path of Object.keys(rules.hashMaps)) {
    if (!used.has(path))
      out.push(
        violation(
          'ordering',
          path,
          'is exempted in rules.mjs but no longer uses a HashMap; drop the exemption',
        ),
      );
  }
  return out;
}

// ── walls ───────────────────────────────────────────────────────────────────

/**
 * One graph over both languages: crate → crate, package → package, and a
 * wrapper → the crate behind its binding, so a wall holds across napi too.
 */
function graphOf(crateDeps, packageDeps, rules) {
  const graph = {};
  for (const [name, deps] of Object.entries(crateDeps)) graph[name] = [...deps];
  for (const [name, deps] of Object.entries(packageDeps)) {
    graph[name] = [...deps];
    if (rules.packages[name]?.binding)
      graph[name].push(name.replace('@opys/', 'opys-'));
  }
  return graph;
}

function checkWallsIn(graph, walls, source) {
  const out = [];
  for (const wall of walls) {
    for (const from of wall.from) {
      if (!(from in graph)) {
        out.push(
          violation(
            'walls',
            from,
            `"${wall.name}" names it, but it does not exist`,
          ),
        );
        continue;
      }
      for (const reached of reachable(graph, from)) {
        const breaks = wall.only
          ? !wall.only.includes(reached)
          : wall.never.includes(reached);
        if (breaks)
          out.push(
            violation(
              'walls',
              from,
              `reaches ${reached} ${source} — "${wall.name}"`,
            ),
          );
      }
    }
  }
  return out;
}

/** The walls hold in the tree, and the allow-lists do not contradict them. */
export function checkWalls(rules, world) {
  const declared = graphOf(
    Object.fromEntries(
      Object.entries(rules.crates).map(([n, r]) => [n, r.deps]),
    ),
    Object.fromEntries(
      Object.entries(rules.packages).map(([n, r]) => [n, r.deps]),
    ),
    rules,
  );
  const actual = graphOf(
    Object.fromEntries(
      world.crates
        .filter((c) => !NAPI.test(c.name))
        .map((c) => [c.name, workspaceDeps(c)]),
    ),
    Object.fromEntries(
      world.packages.map((p) => [
        p.name,
        Object.keys({ ...p.dependencies, ...p.peerDependencies })
          .filter(isOpys)
          .filter((d) => !BINDING.test(d)),
      ]),
    ),
    rules,
  );
  const inRules = checkWallsIn(declared, rules.walls, 'in rules.mjs');
  // A wall the rules already break is reported once, where it has to be fixed.
  return inRules.length > 0
    ? inRules
    : checkWallsIn(actual, rules.walls, 'in the tree');
}

// ── wiring ──────────────────────────────────────────────────────────────────

/** A dependency comes before its dependents in `order`. */
function outOfOrder(order, depsOf) {
  const at = new Map(order.map((name, i) => [name, i]));
  const out = [];
  for (const name of order) {
    for (const dep of depsOf(name)) {
      if (at.has(dep) && at.get(dep) > at.get(name)) out.push([name, dep]);
    }
  }
  return out;
}

/**
 * A crate or binding added to the workspace is also added to everything that
 * builds, stamps, publishes and smoke-tests the workspace. Each of these is a
 * hand-kept list, and each has been forgotten at least once.
 */
export function checkWiring(rules, world) {
  const out = [];
  const { workflow, script, smoke } = world.release;

  // npm workspaces: every package and binding, packages in dependency order
  // (`npm run build --workspaces` builds them in the order listed).
  const listed = new Set(world.root.workspaces);
  for (const dir of [
    ...world.packages.map((p) => p.dir),
    ...world.bindings.map((b) => b.dir),
  ]) {
    if (!listed.has(dir))
      out.push(
        violation('wiring', 'package.json', `workspaces is missing ${dir}`),
      );
  }
  const byDir = new Map(world.packages.map((p) => [p.dir, p]));
  const packageOrder = world.root.workspaces
    .filter((d) => byDir.has(d))
    .map((d) => byDir.get(d).name);
  const byName = new Map(world.packages.map((p) => [p.name, p]));
  for (const [name, dep] of outOfOrder(packageOrder, (n) =>
    Object.keys(byName.get(n).dependencies),
  )) {
    out.push(
      violation(
        'wiring',
        'package.json',
        `workspaces lists ${name} before ${dep}, which it is built on`,
      ),
    );
  }

  // crates.io: every publishable crate, dependencies first.
  const published = [...workflow.matchAll(/cargo publish -p ([\w-]+)/g)].map(
    (m) => m[1],
  );
  const crates = new Map(world.crates.map((c) => [c.name, c]));
  for (const crate of world.crates) {
    if (crate.publish && !published.includes(crate.name))
      out.push(
        violation(
          'wiring',
          'release.yml',
          `never runs cargo publish -p ${crate.name}`,
        ),
      );
  }
  for (const name of published) {
    if (!crates.get(name)?.publish)
      out.push(
        violation(
          'wiring',
          'release.yml',
          `publishes ${name}, which is not a publishable crate`,
        ),
      );
  }
  for (const [name, dep] of outOfOrder(
    published.filter((n) => crates.has(n)),
    (n) =>
      crates
        .get(n)
        .deps.filter((d) => d.kind !== 'dev')
        .map((d) => d.name),
  )) {
    out.push(
      violation(
        'wiring',
        'release.yml',
        `publishes ${name} before ${dep}, which it depends on`,
      ),
    );
  }

  // The version stamp rewrites every internal path dependency.
  for (const crate of world.crates) {
    if (crate.deps.length > 0 && !script.includes(`'${crate.dir}'`))
      out.push(
        violation(
          'wiring',
          'scripts/release.mjs',
          `does not stamp ${crate.dir}`,
        ),
      );
  }

  // Each binding: built and uploaded per target, gathered, and published.
  for (const binding of world.bindings) {
    const short = binding.name.replace('@opys/', '');
    const needs = [
      [`Build ${binding.name}`, 'build step'],
      [`path: ${binding.dir}/*.node`, 'an upload step'],
      [`pattern: ${short}-*`, 'download step'],
      [`path: ${binding.dir}/artifacts`, 'download step'],
      [`Publish ${binding.name}`, 'publish step'],
    ];
    for (const [text, what] of needs) {
      if (!workflow.includes(text))
        out.push(
          violation(
            'wiring',
            'release.yml',
            `has no ${what} for ${binding.name} (looked for "${text}")`,
          ),
        );
    }
    if (workflow.split(`working-directory: ${binding.dir}\n`).length - 1 < 2)
      out.push(
        violation(
          'wiring',
          'release.yml',
          `runs fewer than two steps in ${binding.dir} (build, publish)`,
        ),
      );
    const loop =
      workflow.split('\n').find((line) => /^\s*for c in /.test(line)) ?? '';
    if (
      !loop.split(/\s+/).includes(binding.dir) &&
      !loop.includes(`${binding.dir};`)
    )
      out.push(
        violation(
          'wiring',
          'release.yml',
          `the artifacts loop does not visit ${binding.dir}`,
        ),
      );
    if (!smoke.includes(`'../${binding.dir}/index.js'`))
      out.push(
        violation(
          'wiring',
          'scripts/smoke-napi.mjs',
          `never loads ${binding.name}`,
        ),
      );
  }
  return out;
}

export const checks = [
  checkCrates,
  checkBindingCrates,
  checkFeatures,
  checkPackages,
  checkImports,
  checkSources,
  checkWireTypes,
  checkHashMaps,
  checkWalls,
  checkWiring,
];

export const checkAll = (rules, world) =>
  checks.flatMap((check) => check(rules, world));
