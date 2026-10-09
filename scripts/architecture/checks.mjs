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

/** The one addon: the crate, and the package it is published as. */
const ADDON = 'opys-napi';
const BINDING = '@opys/binding';
const NAPI = { test: (name) => name === ADDON };

const violation = (rule, where, message) => ({ rule, where, message });

/**
 * The addon's modules. Each is a crate as JS sees it and a namespace of the
 * addon: `src/minecraft_vanilla.rs` exposes `opys-minecraft-vanilla` as
 * `minecraftVanilla`. `uses` is every workspace crate the module names.
 */
export function addonModules(world) {
  const addon = world.crates.find((c) => c.name === ADDON);
  return (addon?.sources ?? [])
    .map((source) => ({ ...source, stem: /([^/]+)\.rs$/.exec(source.path)[1] }))
    .filter((source) => source.stem !== 'lib')
    .map((source) => ({
      path: source.path,
      crate: `opys-${source.stem.replace(/_/g, '-')}`,
      uses: [
        ...new Set(
          [...source.text.matchAll(/\bopys_[a-z0-9_]+(?=::)/g)].map((m) =>
            m[0].replace(/_/g, '-'),
          ),
        ),
      ],
    }));
}

/** `@opys/minecraft-vanilla` → `minecraftVanilla`, its namespace of the addon. */
export const namespaceOf = (pkg) =>
  pkg.replace('@opys/', '').replace(/-(\w)/g, (_, c) => c.toUpperCase());

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
  const exposed = new Set(addonModules(world).map((m) => m.crate));

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
    if (rule.binding && !exposed.has(crate.name))
      out.push(
        violation(
          'bindings',
          crate.name,
          `is declared as exposed to JS, but ${ADDON} has no module for it`,
        ),
      );
    if (!rule.binding && exposed.has(crate.name))
      out.push(
        violation(
          'bindings',
          crate.name,
          `is declared as not exposed to JS, but ${ADDON} has a module for it`,
        ),
      );
  }
  return out;
}

/**
 * One addon, and the boundaries between crates kept inside it: a module
 * exposes the crate it is named after, and names nothing that crate does not
 * already reach. So `mod forge` cannot call into `opys-runtime`, any more
 * than `opys-forge` can.
 */
export function checkBindingCrates(rules, world) {
  const out = [];
  const graph = Object.fromEntries(
    Object.entries(rules.crates).map(([name, rule]) => [name, rule.deps]),
  );
  const addon = world.crates.find((c) => c.name === ADDON);
  if (!addon) return out;

  const used = new Set();
  for (const module of addonModules(world)) {
    if (!rules.crates[module.crate]) {
      out.push(
        violation(
          'bindings',
          module.path,
          `exposes ${module.crate}, which is not a declared crate`,
        ),
      );
      continue;
    }
    if (!module.uses.includes(module.crate))
      out.push(
        violation(
          'bindings',
          module.path,
          `does not use ${module.crate}, the crate it is named after`,
        ),
      );
    const allowed = reachable(graph, module.crate);
    for (const dep of module.uses) {
      used.add(dep);
      if (dep !== module.crate && !allowed.has(dep))
        out.push(
          violation(
            'bindings',
            module.path,
            `names ${dep}, which ${module.crate} itself does not reach`,
          ),
        );
    }
  }
  for (const dep of workspaceDeps(addon)) {
    if (!used.has(dep))
      out.push(
        violation(
          'bindings',
          ADDON,
          `depends on ${dep}, which none of its modules uses`,
        ),
      );
  }
  if (!addon.cdylib) out.push(violation('bindings', ADDON, 'is not a cdylib'));
  if (addon.publish)
    out.push(
      violation(
        'bindings',
        ADDON,
        'is publishable to crates.io; the addon ships to npm only',
      ),
    );
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
      if (dep === BINDING) {
        if (!rule.binding)
          out.push(
            violation(
              'bindings',
              pkg.name,
              `depends on ${dep}, but is not declared as a wrapper`,
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
    if (rule.binding && !(BINDING in pkg.dependencies))
      out.push(
        violation(
          'bindings',
          pkg.name,
          `is declared as a wrapper but does not depend on ${BINDING}`,
        ),
      );
    if (rule.binding && !bindings.has(BINDING))
      out.push(
        violation(
          'bindings',
          pkg.name,
          `wraps ${BINDING}, which no crate publishes`,
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

  // The other direction: a module nobody wraps is a crate with no JS surface.
  for (const module of addonModules(world)) {
    const owner = module.crate.replace(/^opys-/, '@opys/');
    if (!rules.packages[owner]?.binding)
      out.push(
        violation(
          'bindings',
          module.path,
          `has no ${owner} package declared as its wrapper`,
        ),
      );
  }
  for (const binding of world.bindings) {
    if (binding.name !== BINDING || binding.crate !== ADDON)
      out.push(
        violation(
          'bindings',
          binding.crate,
          `publishes ${binding.name}; there is one addon, ${ADDON}, published as ${BINDING}`,
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
        for (const { specifier, line, typeOnly, names = [] } of file.imports) {
          const where = `${file.path}:${line}`;
          // The addon is shared, so the boundary is the namespace: a package
          // takes its own and no other, which is what importing its own
          // binding and never a sibling's used to say.
          if (specifier === BINDING) {
            const own = namespaceOf(pkg.name);
            for (const name of names.filter((n) => n !== own))
              out.push(
                violation(
                  'imports',
                  where,
                  `takes '${name}' from ${BINDING}; ${pkg.name} imports its own namespace, '${own}', and no other`,
                ),
              );
          }
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
          .filter((d) => d !== BINDING),
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
 * What still has to be kept by hand when a package or binding is added: the
 * npm workspace list, in build order, and a smoke test that loads the addon.
 *
 * The release used to be four more such lists — a build, upload, download
 * and publish step per binding, a `cargo publish` per crate in dependency
 * order, and the crates to stamp a version into. Those are derived now, from
 * the directory listing and the dependency graph, so what is checked here is
 * only that the workflow still derives them.
 */
export function checkWiring(rules, world) {
  const out = [];
  const { workflow, smoke } = world.release;

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

  for (const binding of world.bindings) {
    if (!smoke.includes(`'../${binding.dir}/index.js'`))
      out.push(
        violation(
          'wiring',
          'scripts/smoke-napi.mjs',
          `never loads ${binding.name}`,
        ),
      );
  }

  // The release finds its bindings and orders its crates; neither is a list.
  for (const [text, what] of [
    [`crates/${ADDON}`, 'no longer builds the addon'],
    [
      'scripts/release/crates.mjs',
      'no longer takes the crates.io publish order from the dependency graph',
    ],
  ]) {
    if (!workflow.includes(text))
      out.push(violation('wiring', 'release.yml', what));
  }
  const named = [...workflow.matchAll(/crates\/(opys-[a-z-]+-napi)\b/g)].map(
    (m) => m[1],
  );
  for (const name of new Set(named)) {
    out.push(
      violation(
        'wiring',
        'release.yml',
        `names ${name}; there is one addon, ${ADDON}`,
      ),
    );
  }
  if (/cargo publish -p opys-/.test(workflow))
    out.push(
      violation(
        'wiring',
        'release.yml',
        'publishes a crate by name; the order is derived, not listed',
      ),
    );
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
