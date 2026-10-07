import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cargoVersions, stampCargo, stampPackage } from './stamp-lib.mjs';

test('a package takes the version, and so does every @opys range in it', () => {
  const pkg = {
    name: '@opys/forge',
    version: '0.2.0',
    dependencies: {
      '@opys/core': '^0.2.0',
      '@opys/forge-binding': '^0.2.0',
      zod: '^4.0.0',
    },
    peerDependencies: { '@opys/dev': '^0.2.0' },
    devDependencies: { vitest: '*', '@opys/mojang': '^0.2.0' },
  };
  assert.deepEqual(stampPackage(pkg, '0.3.0'), {
    name: '@opys/forge',
    version: '0.3.0',
    dependencies: {
      '@opys/core': '^0.3.0',
      '@opys/forge-binding': '^0.3.0',
      zod: '^4.0.0',
    },
    peerDependencies: { '@opys/dev': '^0.3.0' },
    devDependencies: { vitest: '*', '@opys/mojang': '^0.3.0' },
  });
});

test('a package already in step serialises to the same bytes', () => {
  const text = JSON.stringify(
    {
      name: 'x',
      version: '1.2.3',
      main: 'index.js',
      dependencies: { '@opys/core': '^1.2.3' },
      files: ['dist'],
    },
    null,
    2,
  );
  assert.equal(
    JSON.stringify(stampPackage(JSON.parse(text), '1.2.3'), null, 2),
    text,
  );
});

test('a package with no dependencies, and the input itself, are left alone', () => {
  const pkg = { name: '@opys/mojang-rules', version: '0.2.0' };
  assert.deepEqual(stampPackage(pkg, '0.3.0'), {
    name: '@opys/mojang-rules',
    version: '0.3.0',
  });
  assert.equal(pkg.version, '0.2.0');
});

const CARGO = `[workspace]
members = ["crates/*"]

[workspace.package]
edition = "2021"
version = "0.2.0"
rust-version = "1.80"

[workspace.dependencies]
serde = { version = "1", features = ["derive"] }
thiserror = "2"
# Ours, once.
opys-core = { path = "crates/opys-core", version = "0.2.0" }
opys-dev = { path = "crates/opys-dev", version = "0.2.0", default-features = false }
`;

test('the workspace version and every opys crate move; nothing else does', () => {
  const next = stampCargo(CARGO, '0.3.0');
  assert.deepEqual(cargoVersions(next), {
    workspace: '0.3.0',
    crates: { 'opys-core': '0.3.0', 'opys-dev': '0.3.0' },
  });
  // Third-party versions, the MSRV, the comment and the feature flag survive.
  assert.equal(next, CARGO.replaceAll('"0.2.0"', '"0.3.0"'));
  assert.match(next, /serde = \{ version = "1"/);
  assert.match(next, /rust-version = "1\.80"/);
});

test('a crate with a digit in its name is a crate like any other', () => {
  // `opys-lwjgl3ify`. The script this replaced matched `[a-z-]+` and would
  // have left it a version behind, which fails the build that follows.
  const text = `${CARGO}opys-lwjgl3ify = { path = "crates/opys-lwjgl3ify", version = "0.2.0" }\n`;
  assert.equal(
    cargoVersions(stampCargo(text, '0.3.0')).crates['opys-lwjgl3ify'],
    '0.3.0',
  );
});

test('stamping is idempotent', () => {
  assert.equal(stampCargo(CARGO, '0.2.0'), CARGO);
  assert.equal(
    stampCargo(stampCargo(CARGO, '0.3.0'), '0.3.0'),
    stampCargo(CARGO, '0.3.0'),
  );
});

test('a prerelease version is written whole', () => {
  assert.equal(
    cargoVersions(stampCargo(CARGO, '1.0.0-rc.1')).workspace,
    '1.0.0-rc.1',
  );
});

test('a Cargo.toml with no workspace version is an error, not a silent no-op', () => {
  assert.throws(
    () => stampCargo('[workspace]\nmembers = []\n', '1.0.0'),
    /no workspace version/,
  );
});
