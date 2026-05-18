# Audit — `@torba/java`

Read-only code-quality audit, 2026-05-19. Findings only — nothing changed.

## HIGH

None. No correctness bugs, no lying types, no incidental classes.

## MEDIUM

- [FIXED] **`resolver.ts:232-234` — release-name tie-break comparator is over-clever
  and inverted.** `(a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1)` sorts by
  count descending, then breaks ties by name — but the string branch returns
  `1` when `a` is _smaller_, i.e. it sorts names descending so the
  lexicographically larger name wins. The intent is buried (the tests had to
  reverse-engineer it) and it never returns `0` for equal names. Rewrite as the
  conventional `b[1] - a[1] || b[0].localeCompare(a[0])` with a one-line
  comment ("newest release name wins on a tie"). Note the assumption that
  Adoptium release names sort lexically by recency.
- [FIXED] **`resolver.ts:146-156` — `commonQuery` sends an undocumented `heap_size:
'normal'`** (and `vendor=eclipse`). The file header documents `image_type`
  and `jvm_impl` as the query knobs but not these. Document them, or drop them
  if they are defaults. Also `commonQuery` is a vague name — `adoptiumQuery`
  is clearer.
- **`template.ts:40-45` — `osArchRuleset` emits two separate rules where one
  combined `OsConstraint` works.** It produces
  `[{action:'allow',os:{name}}, {action:'allow',os:{arch}}]`. `core/lib/os.ts`
  documents that `{ name, arch }` together is allowed and `satisfiesOs` checks
  both. A single `[{ action:'allow', os:{ name, arch } }]` expresses the same
  AND with half the rules. If the two-rule split is a deliberate cross-package
  convention, leave it but add a comment.

## LOW

- [FIXED] **`template.ts:88-90` — `archiveDir` and `extractInto` are single-use
  aliases** (`'${java_runtime_dir}'` and `javaRoot`). Inline them.
- [FIXED] **`template.ts:98` — `extractDump(extractInto, { excludes: [] })` passes a
  redundant empty `excludes`.** Drop the options object unless `[]` is
  semantically distinct from absent.
- [FIXED] **`resolver.ts:135-144` / `:161` — the inline anonymous type
  `{ kind: 'major' | 'full'; raw: string }` is written twice.** Extract a
  named `type VersionInput`.
- [FIXED] **`README.md` "Disk usage" note is stale** — it says the archive is left in
  `${root}/runtimes/jdk-<major>/.cache/`, but `template.ts:86-90` downloads the
  archive into `${java_runtime_dir}` as a sibling of the extract target with no
  `.cache` special-casing. Correct the note.
- **`template.ts:108-112` — `seenOses` then `release.binaries.find(...)`
  re-scans the binaries list per OS.** A single pass building a
  `Map<OsName, JavaPlatform>` is one pass and avoids the non-null `!`. Minor
  at 6 entries.

## Verdict

Good health. Genuinely functional: `resolveJava`/`resolveOpenjdk`/
`normalizeInput`/`commonQuery` are pure transforms, the plugin is
pure-to-construct with all I/O inside `build`, no classes, types are honest
(the only casts live in tests). Clean module boundaries (resolver = Adoptium
I/O + shape mapping, template = manifest fragment, plugin = thin wiring).
Findings are all polish — the tie-break comparator is the one spot measurably
"done the hard way"; everything else is single-use aliases, a redundant option,
a duplicated inline type, and a stale README paragraph.
