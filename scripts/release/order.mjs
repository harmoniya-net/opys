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
