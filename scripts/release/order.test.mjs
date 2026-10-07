import assert from 'node:assert/strict';
import { test } from 'node:test';
import { publishOrder } from './order.mjs';

const crate = (name, deps = [], extra = {}) => ({
  name,
  publish: true,
  deps: deps.map((d) =>
    typeof d === 'string' ? { name: d, kind: 'normal' } : d,
  ),
  ...extra,
});

test('a crate comes after everything it depends on', () => {
  const order = publishOrder([
    crate('link', ['core', 'modrinth']),
    crate('modrinth', ['core', 'modpack']),
    crate('modpack', ['core']),
    crate('core', ['rules']),
    crate('rules'),
  ]);
  assert.deepEqual(order, ['rules', 'core', 'modpack', 'modrinth', 'link']);
});

test('crates with nothing between them go alphabetically, whatever order they arrive in', () => {
  const crates = [crate('b', ['z']), crate('a', ['z']), crate('z'), crate('c')];
  const expected = ['z', 'a', 'b', 'c'];
  assert.deepEqual(publishOrder(crates), expected);
  assert.deepEqual(publishOrder([...crates].reverse()), expected);
});

test('a crate that is not published is left out', () => {
  const order = publishOrder([
    crate('core'),
    crate('core-napi', ['core'], { publish: false }),
  ]);
  assert.deepEqual(order, ['core']);
});

test('a dev-dependency does not order anything, even pointing back up', () => {
  const order = publishOrder([
    crate('core', [{ name: 'testkit', kind: 'dev' }]),
    crate('testkit', ['core']),
  ]);
  assert.deepEqual(order, ['core', 'testkit']);
});

test('a build-dependency orders like a normal one', () => {
  const order = publishOrder([
    crate('a', [{ name: 'codegen', kind: 'build' }]),
    crate('codegen'),
  ]);
  assert.deepEqual(order, ['codegen', 'a']);
});

test('a published crate depending on an unpublished one is an error', () => {
  assert.throws(
    () =>
      publishOrder([
        crate('link', ['internal']),
        crate('internal', [], { publish: false }),
      ]),
    /link is published but depends on internal, which is not/,
  );
});

test('a cycle is reported, not looped on', () => {
  assert.throws(
    () => publishOrder([crate('a', ['b']), crate('b', ['a'])]),
    /dependency cycle: a → b → a/,
  );
});
