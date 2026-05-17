/**
 * Tiny glob → RegExp converter. Supports the subset torba uses across
 * `restrict` sweeping and `pipe` artifact selectors:
 *
 *   `*`        — any sequence of non-separator chars
 *   `**`       — any sequence of chars including separators (zero or more
 *                path segments when surrounded by `/`)
 *   `?`        — exactly one non-separator char
 *   `{a,b,c}`  — flat alternation (no nesting)
 *
 * Separator is `/` regardless of platform; callers normalize Windows
 * backslashes before matching.
 */

const STAR = '__TORBA_GLOBSTAR_';
const RX_META = /[.+^$()|[\]\\]/;
const ALT_META = /[.+^$()|[\]\\*?{}]/g;

export function globToRegex(glob: string): RegExp {
  let s = glob;
  // Distinct sentinels for the four globstar positions, processed in
  // most-specific-first order so they don't overlap.
  s = s.replace(/\/\*\*$/, `\0${STAR}END\0`); //   …/**       (suffix)
  s = s.replace(/\/\*\*\//g, `\0${STAR}MID\0`); // …/**/…     (middle)
  s = s.replace(/^\*\*\//, `\0${STAR}START\0`); //   **/…     (prefix)
  s = s.replace(/\*\*/g, `\0${STAR}BARE\0`); //     **        (bare)

  let out = '';
  let i = 0;
  while (i < s.length) {
    const ch = s[i]!;
    if (ch === '\0') {
      const close = s.indexOf('\0', i + 1);
      const tag = s.slice(i + 1 + STAR.length, close);
      if (tag === 'END') out += '(?:/.*)?';
      else if (tag === 'MID') out += '(?:/.*)?/';
      else if (tag === 'START') out += '(?:.*/)?';
      else out += '.*'; // BARE
      i = close + 1;
    } else if (ch === '*') {
      out += '[^/]*';
      i += 1;
    } else if (ch === '?') {
      out += '[^/]';
      i += 1;
    } else if (ch === '{') {
      const end = s.indexOf('}', i);
      if (end === -1) {
        out += '\\{';
        i += 1;
      } else {
        const parts = s.slice(i + 1, end).split(',');
        out +=
          '(?:' + parts.map((p) => p.replace(ALT_META, '\\$&')).join('|') + ')';
        i = end + 1;
      }
    } else if (RX_META.test(ch)) {
      out += '\\' + ch;
      i += 1;
    } else {
      out += ch;
      i += 1;
    }
  }
  return new RegExp('^' + out + '$');
}

/**
 * The longest prefix of `glob` that contains no glob metacharacters,
 * truncated to the last path separator. Used as the filesystem starting
 * point for sweep-walking.
 *
 * `/home/x/mods/**\/*.jar` → `/home/x/mods`
 * `/home/x/mods/foo.jar`   → `/home/x/mods`
 * `*.jar`                   → `''` (caller substitutes cwd)
 */
export function globBase(glob: string): string {
  let lastSlash = -1;
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i]!;
    if (ch === '*' || ch === '?' || ch === '{' || ch === '[') break;
    if (ch === '/') lastSlash = i;
  }
  return lastSlash >= 0 ? glob.slice(0, lastSlash) : '';
}
