# Audit — `@lanka/mojang`

Code-quality audit, 2026-05-19 — open items only (resolved findings removed;
see git history).

## HIGH

- **`lib/client/maven.ts:33-43` — `encodeMaven` silently discards data; not a
  total inverse of `parseMaven`.** `MavenCoord.version` is typed optional, but
  `encodeMaven` drops `packaging` unless `classifier` AND `version` are all
  present, and drops `classifier` unless `version` is present. So
  `{groupId, artifactId, classifier:'natives-linux'}` (a valid `MavenCoord`)
  encodes to `g:a` — data loss with no error. The type says `version?` is
  optional, but `encodeMaven` is only correct when it is set. Either make
  `version` required in `MavenCoord`, or make `encodeMaven` total / throw on
  un-encodable shapes. (`maven.test.ts:111` enshrines the lossy behaviour.)

## MEDIUM

- **`lib/client/client.ts:35-39` — `arguments`/`minecraftArguments` and
  `libraries` typed `z.unknown()`, defeating "parse, don't validate".** The
  schema parses the envelope but punts the two hardest fields to `z.unknown()`,
  then `parseArguments`/`parseLibraries` re-parse from scratch. The wire shape
  is already known (`MojangArgSchema`/`RawLibSchema`). Compose the sub-schemas
  via `.transform()`, or document the deliberate two-pass approach.
- **`lib/client/client.ts:48-52` — `parseClient` throws a bare `Error`** for a
  missing-arguments wire defect, while every other failure path is a `ZodError`
  and the version module has a structured `VersionFetchError`. Use a typed
  error or a `.refine`.
- **`lib/version.ts:36-39`, `lib/client/client.ts:9,18` — hand-written
  `interface`s duplicating zod schemas** where `z.infer` is used elsewhere
  (`logging.ts`, `VersionSchema`). `VersionManifest` / `ClientMetadata` /
  `Client` must be kept in sync by hand and can drift. Pick one approach.

## LOW

- **`lib/version.ts:62-65` — `latestRelease` is exported but unused** (no
  consumer outside the package) and throws a bare `Error`. Drop it, or align
  it with the `VersionFetchError` style.
- **`lib/client/assets.ts:44-49` — `fetchAssetManifest` throws a bare `Error`**
  while the sibling `fetchVersionManifest` throws a structured
  `VersionFetchError`. Two fetchers, two error contracts.
- **`lib/client/libraries.ts:35` — `extract: { exclude }` is parsed in
  `RawLibSchema` then never read.** `Library` has no `extract` field. Dead
  schema surface, or a missing feature.

## Verdict

Good shape. The one real bug is `encodeMaven` being a lossy non-inverse of
`parseMaven` while `MavenCoord` advertises `version` as optional — a type that
lies. The rest is stylistic consistency: `z.unknown()` deferral, mixed
structured-vs-bare errors, hand-written interfaces vs `z.infer`.
