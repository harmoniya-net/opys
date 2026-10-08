// Keeps the Ukrainian pages in step with the English ones.
//
//   node i18n.mjs          report what is out of step; exit 1 if anything is
//   node i18n.mjs --fix    also give each translated heading its English id
//
// A page is written in English at `<path>.md` and translated at
// `uk/<path>.md`. Three things have to hold, and none of them is visible in a
// build:
//
// - every English page has a translation, and nothing is translated that no
//   longer exists;
// - a translation has the same headings, in the same order, as its original —
//   a missing section is how a translation goes stale;
// - a heading keeps the anchor it has in English. VitePress makes an anchor
//   out of a heading's text, so `## Vendors` and `## Постачальники` would be
//   two different anchors and every `#vendors` link would break in one
//   language. `--fix` writes `## Постачальники {#vendors}`, so one link works
//   in both and no translator has to compute an anchor.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const fix = process.argv.includes('--fix');
const SKIP = new Set(['node_modules', '.vitepress', 'examples', 'uk']);
const NOTES = new Set(['CONTRIBUTING.md']);

function pages(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory())
      return dir === base && SKIP.has(entry.name) ? [] : pages(full, base);
    const rel = path.relative(base, full);
    return entry.name.endsWith('.md') && !NOTES.has(rel) ? [rel] : [];
  });
}

// The same steps as VitePress's own slugify (`@mdit-vue/shared`).
const slugify = (text) =>
  text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/[\s~`!@#$%^&*()\-_+=[\]{}|\\;:"'“”‘’<>,.?/]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^(\d)/, '_$1')
    .toLowerCase();

// What a heading reads as: its markup gone, a link reduced to its text.
const plain = (text) =>
  text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_]/g, '')
    .trim();

/** The headings of a page, outside its code blocks. */
function headings(source) {
  const out = [];
  let fence = null;
  source.split('\n').forEach((line, index) => {
    const mark = line.match(/^\s*(`{3,}|~{3,})/);
    if (mark) {
      if (!fence) fence = mark[1][0];
      else if (mark[1][0] === fence) fence = null;
      return;
    }
    if (fence) return;
    const m = line.match(/^(#{1,6})\s+(.*?)\s*(?:\{#([^}]+)\})?\s*$/);
    if (m) out.push({ index, level: m[1].length, text: m[2], id: m[3] });
  });
  return out;
}

/** Each heading's anchor, numbered the way VitePress numbers a repeat. */
function anchors(list) {
  const seen = new Map();
  return list.map((h) => {
    const slug = h.id ?? slugify(plain(h.text));
    const n = seen.get(slug) ?? 0;
    seen.set(slug, n + 1);
    return h.id || n === 0 ? slug : `${slug}-${n}`;
  });
}

const problems = [];
const english = pages(root);
const ukrainian = fs.existsSync(path.join(root, 'uk'))
  ? pages(path.join(root, 'uk'))
  : [];

for (const rel of ukrainian)
  if (!english.includes(rel))
    problems.push(`uk/${rel}: no English page of that name`);

for (const rel of english) {
  const translated = path.join(root, 'uk', rel);
  if (!fs.existsSync(translated)) {
    problems.push(`uk/${rel}: not translated`);
    continue;
  }
  const source = fs.readFileSync(translated, 'utf8');
  const theirs = headings(source);
  const ours = headings(fs.readFileSync(path.join(root, rel), 'utf8'));
  if (
    ours.length !== theirs.length ||
    ours.some((h, i) => h.level !== theirs[i].level)
  ) {
    problems.push(
      `uk/${rel}: ${theirs.length} heading(s) where the English has ${ours.length}, or at different levels`,
    );
    continue;
  }
  const ids = anchors(ours);
  const lines = source.split('\n');
  let stale = 0;
  theirs.forEach((h, i) => {
    // The title takes part in the numbering — a section named like its page
    // is `#name-1` — but is not itself a link target worth pinning.
    if (h.level === 1 || h.id === ids[i]) return;
    stale++;
    lines[h.index] = `${'#'.repeat(h.level)} ${h.text} {#${ids[i]}}`;
  });
  if (!stale) continue;
  if (fix) fs.writeFileSync(translated, lines.join('\n'));
  else
    problems.push(
      `uk/${rel}: ${stale} heading(s) without their English id (run with --fix)`,
    );
}

for (const line of problems) console.log(line);
console.log(
  problems.length
    ? `${problems.length} problem(s)`
    : `${english.length} page(s), each translated and in step`,
);
process.exit(problems.length ? 1 : 0);
