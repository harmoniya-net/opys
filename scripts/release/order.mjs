/**
 * The order crates are published to crates.io in: every crate after the
 * workspace crates it depends on.
 *
 * Derived, not written down. The release workflow used to carry this as a
 * hand-kept list of `cargo publish -p …` lines, which had to be edited — in
 * the right place — every time a crate was added.
 *
 * @param {{ name: string, publish: boolean, deps: { name: string, kind: string }[] }[]} crates
 * @returns {string[]} publishable crate names, dependencies first
 */
export function publishOrder(crates) {
  const publishable = new Map(
    crates.filter((c) => c.publish).map((c) => [c.name, c]),
  );
  const done = new Set();
  const order = [];
  const visit = (name, path) => {
    if (done.has(name)) return;
    if (path.includes(name)) {
      throw new Error(`dependency cycle: ${[...path, name].join(' → ')}`);
    }
    const crate = publishable.get(name);
    // A dev-dependency is not needed to publish, and may point back up.
    const needs = crate.deps
      .filter((d) => d.kind !== 'dev')
      .map((d) => d.name)
      .sort();
    for (const dep of needs) {
      if (!publishable.has(dep)) {
        throw new Error(
          `${name} is published but depends on ${dep}, which is not`,
        );
      }
      visit(dep, [...path, name]);
    }
    done.add(name);
    order.push(name);
  };
  // Alphabetical among crates with nothing between them, so the order is the
  // same on every run.
  for (const name of [...publishable.keys()].sort()) visit(name, []);
  return order;
}

/** The fields of a `package.json` that a package needs installed to work. */
const NEEDED = ['dependencies', 'optionalDependencies', 'peerDependencies'];

/**
 * The order npm packages are published in: every package after the packages
 * of the tree it depends on, the same way crates are.
 *
 * It was the order `package.json` lists the workspaces in, which is build
 * order, and there the addon comes last. So `@opys/core` and everything else
 * that depends on `@opys/binding` reached the registry before the binding
 * did; an install in between resolved a version of the tree that named a
 * binding nobody could fetch yet. Platform packages count too: `@opys/binding`
 * names each one, exactly, as an optional dependency.
 *
 * @param {{ name: string, private?: boolean, [field: string]: unknown }[]} manifests
 *   the `package.json` of every package of the tree, as stamped
 * @returns {string[]} the names of those to publish, dependencies first
 */
export function npmPublishOrder(manifests) {
  const ours = new Set(manifests.map((m) => m.name));
  return publishOrder(
    manifests.map((m) => ({
      name: m.name,
      publish: !m.private,
      deps: [
        ...NEEDED.flatMap((field) =>
          Object.keys(m[field] ?? {}).map((name) => ({ name, kind: 'normal' })),
        ),
        ...Object.keys(m.devDependencies ?? {}).map((name) => ({
          name,
          kind: 'dev',
        })),
      ].filter((dep) => ours.has(dep.name)),
    })),
  );
}
