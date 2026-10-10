/**
 * Which version a push to `main` releases, told from its commits.
 *
 * Pure: the commits are handed in, so the rule is tested without a
 * repository.
 *
 * A commit says what it is in its subject, `type(scope)!: summary`, as
 * every commit here already does. The largest change since the last release
 * decides:
 *
 * - breaking (`!`, or a `BREAKING CHANGE:` line): the major version, or the
 *   minor one while the major is 0;
 * - `feat`: the minor version, or the patch one while the major is 0;
 * - `fix`, `perf`, `refactor`, `revert`: the patch version;
 * - anything else (`docs`, `test`, `ci`, `style`, `chore`, a subject that
 *   is not in this form): nothing. A push of only these releases nothing,
 *   since nothing a package ships has changed.
 */

const PATCH = new Set(['fix', 'perf', 'refactor', 'revert']);
const SUBJECT = /^([a-z]+)(\([^)]*\))?(!)?: /;

/** `breaking`, `feat`, `patch` or `none`, for one commit message. */
export function changeOf(message) {
  const [subject, ...body] = message.split('\n');
  const match = SUBJECT.exec(subject);
  if (!match) return 'none';
  const [, type, , bang] = match;
  if (bang || body.some((line) => /^BREAKING[ -]CHANGE: /.test(line)))
    return 'breaking';
  if (type === 'feat') return 'feat';
  return PATCH.has(type) ? 'patch' : 'none';
}

const parse = (version) => {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return match ? match.slice(1).map(Number) : null;
};

/**
 * The version after `last` given the commit `messages` since it, or `null`
 * when none of them releases anything.
 */
export function nextVersion(last, messages) {
  const changes = new Set(messages.map(changeOf));
  const [major, minor, patch] = parse(last);
  const stable = major > 0;
  if (changes.has('breaking'))
    return stable ? `${major + 1}.0.0` : `0.${minor + 1}.0`;
  if (changes.has('feat'))
    return stable ? `${major}.${minor + 1}.0` : `0.${minor}.${patch + 1}`;
  if (changes.has('patch')) return `${major}.${minor}.${patch + 1}`;
  return null;
}
