# Audit — `@torba/mojang`

Read-only code-quality audit, 2026-05-19. Findings only — nothing changed.

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
- **`lib/client/libraries.ts:50-51` — magic `'{arch}' → '64'` substitution**
  with no 32-bit path. Probably fine in practice (only legacy
  `java-objc-bridge` uses `{arch}`), but it is an undocumented assumption baked
  into a string replace. Comment it, or reconsider whether the placeholder
  handling earns its keep.
- **`lib/client/arguments.ts:51` — redundant `as MojangArgValue[]` cast** on a
  `string[]` (`string` is a member of the `MojangArgValue` union). Drop it.
- **`lib/version.ts:36-39`, `lib/client/client.ts:9,18` — hand-written
  `interface`s duplicating zod schemas** where `z.infer` is used elsewhere
  (`logging.ts`, `VersionSchema`). `VersionManifest` / `ClientMetadata` /
  `Client` must be kept in sync by hand and can drift. Pick one approach.

## LOW

- **`lib/version.ts:55-66` — `findVersion` is a one-line `Array.find` wrapper,
  and `latestRelease` re-implements the lookup** instead of calling
  `findVersion`.
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

Good shape overall: small cohesive modules, clear boundaries, genuinely
functional (the two `Error` subclasses are legitimate), zod schemas at every
wire boundary, solid roundtrip/edge-case tests. The main real bug is
`encodeMaven` being a lossy non-inverse of `parseMaven` while `MavenCoord`
advertises `version` as optional — a type that lies. Secondary issues are
stylistic inconsistency: mixed `z.infer` vs hand-written interfaces, mixed
structured-vs-bare errors, and `client.ts` deferring its two hardest fields to
`z.unknown()`. No overcomplication or reinvented wheels of note.
