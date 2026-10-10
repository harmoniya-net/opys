import assert from 'node:assert/strict';
import { test } from 'node:test';
import { changeOf, nextVersion } from './bump.mjs';

test('a commit says what it is in its subject', () => {
  assert.equal(changeOf('feat: a loader takes libraries'), 'feat');
  assert.equal(changeOf('feat(java): support Zulu'), 'feat');
  assert.equal(changeOf('feat!: cleanup replaces restrict'), 'breaking');
  assert.equal(changeOf('fix(runtime)!: refuse a path'), 'breaking');
  assert.equal(changeOf('fix: a typo\n\nBREAKING CHANGE: no'), 'breaking');
  assert.equal(changeOf('fix: the natives rule'), 'patch');
  assert.equal(changeOf('perf: hash as it is read'), 'patch');
  assert.equal(changeOf('refactor: one merge'), 'patch');
});

test('what ships nothing releases nothing', () => {
  for (const subject of [
    'docs: a documentation site',
    'style: cargo fmt',
    'ci(launch-matrix): run by hand only',
    'test: the published documents',
    'chore: bump a dev dependency',
    'release v0.2.0',
    'Merge branch main',
    // A breaking word in the body is not the marker.
    'docs: explain a BREAKING CHANGE',
  ]) {
    assert.equal(changeOf(subject), 'none', subject);
  }
});

test('before 1.0 a breaking change is a minor and a feature a patch', () => {
  assert.equal(nextVersion('0.2.0', ['feat!: x', 'fix: y']), '0.3.0');
  assert.equal(nextVersion('0.2.3', ['feat: x', 'docs: y']), '0.2.4');
  assert.equal(nextVersion('0.2.3', ['fix: x']), '0.2.4');
});

test('from 1.0 on the three kinds are the three numbers', () => {
  assert.equal(nextVersion('1.4.2', ['feat!: x']), '2.0.0');
  assert.equal(nextVersion('1.4.2', ['feat: x', 'fix: y']), '1.5.0');
  assert.equal(nextVersion('1.4.2', ['fix: x']), '1.4.3');
});

test('a push of only docs and chores releases nothing', () => {
  assert.equal(nextVersion('0.2.0', ['docs: x', 'ci: y', 'style: z']), null);
  assert.equal(nextVersion('0.2.0', []), null);
});
