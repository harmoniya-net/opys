# Audit — `@torba/minecraft`

Read-only code-quality audit, 2026-05-19. Findings only — nothing changed.

## HIGH

- [FIXED] **`lwjgl3ify/resolver.ts:61-80`, `cleanroom/resolver.ts:55-74`,
  `lwjgl3ify/template.ts:47-66` — three+ copies of GitHub release-listing
  logic.** `fetchReleases` is duplicated almost verbatim between
  `cleanroom/resolver.ts` and `lwjgl3ify/resolver.ts` (same headers, same
  `?per_page=100` URL, same error message); a third copy is inlined in
  `resolveUnimixins`. The `RawRelease`/`RawAsset` interfaces and the
  `digest?.startsWith('sha256:')` snippet are re-declared in all three. Extract
  a shared `github.ts` (`listReleases(repo, token)` + `assetSha256(asset)` +
  the types) and have all three call it.
- **`lwjgl3ify/template.ts:176-267` — untyped `Record<string,unknown>`
  spelunking and `as` casts everywhere.** `collectRepoLibs` and
  `patchLibraries` walk raw library objects with `raw as Record<string,
unknown>`, `art.url` indexed off an `unknown`, `coord as ResolvedCoord`, etc.
  This is exactly the cast-heavy style the refactor removed elsewhere — there
  is a real schema (`@torba/mojang`'s library schema) being routed around.
  Define a small zod schema for the two non-standard lwjgl3ify entry shapes and
  decode through it.

## MEDIUM

- **`forge/template.ts:255-270` — `forgeWrapper` override option is
  over-engineered and partly type-lying.** Four independent fields
  (`url`/`sha1`/`size`/`path`) with interdependent fallbacks
  (`fwSha1 = fwOpt.sha1 ?? (fwOpt.url ? undefined : DEFAULT.sha1)` — a custom
  `url` silently drops the bundled hash). Almost certainly zero real callers.
  Drop it, or reduce to a single `forgeWrapper?: { url; sha1?; size? }` value
  object where the fields travel together.
- **`cleanroom/template.ts:58-91` & `lwjgl3ify/template.ts:311` — installer /
  manifest JSON parsed via hand-written interfaces + `JSON.parse … as T`.**
  `InstallerVersionJson` / `InstallerProfileJson` have no runtime validation.
  `forge/recipe.ts` uses zod properly — these two should too; a malformed
  installer should give a clear parse error, not a downstream crash.
- **`plugins.ts:17-33` — `LoaderTemplate` re-declares a shape that already
  exists**, and the four `*Template` interfaces
  (`MinecraftTemplate`/`ForgeTemplate`/…) independently re-declare
  `artifacts`/`vars`/`launch`/`jvmArgs`/`mainClass`/`gameArgs` with copy-pasted
  doc comments. Define one shared `LoaderTemplate` type and have the resolvers
  return it.
- **`mappers/launch.ts:32-36` — `buildClasspath` hardcodes a `platforms` list
  with a dead `arch` field.** All three entries use `arch: 'x86_64'`. Vanilla
  Mojang library rules _do_ branch on arch (x86 / arm64 natives), so non-x64
  classpaths are silently wrong. Decide whether arch-specific classpaths are in
  scope: drop `arch` + document the x64-only assumption, or iterate arches.
- [FIXED] **`mappers/launch.ts:6-8` — `mojangArgsToValset` is a one-line pass-through
  wrapper** over `parseValset`. Inline it at the two call sites.

## LOW

- **`serverlist.ts:13-58` — hand-rolled NBT encoder.** Correct and
  self-contained, but NBT is a standard format with mature libraries
  (`prismarine-nbt`, `nbtify`). Borderline — fine to keep if avoiding the
  dependency is a conscious choice; flagged so the choice is conscious.
- [FIXED] **`mappers/assets.ts:8`, `mappers/client.ts:7`, `mappers/libraries.ts:7-9`
  — unused configurability parameters** (`assetsRootVar`, `versionDirVar`,
  `libraryDirVar`, `nativesDirVar`); every caller uses the default. Inline the
  `${…}` literals and drop the params.
- **`forge/template.ts:40-58` — `modulePathArtifacts` re-flattens args by
  hand**, the same pattern `fixArg` in `recipe.ts` does. Consider a shared
  `flattenArgValues(args)` helper.
- **`forge/resolver.ts:76`, `cleanroom/resolver.ts`, `lwjgl3ify/resolver.ts` —
  `MasterIndex`/`RawRelease` typed as bare interfaces, no decode.** First-party
  services, so lower severity, but a zod boundary would catch upstream drift.

## Verdict

Good overall health: the plugin model is clean (pure factories, all I/O inside
`build`), `plugins.ts` and `mappers/` are tidy and functional,
`bifrost.ts`/`serverlist.ts`/`authliberty/` are small and well-factored, and
`forge/recipe.ts` is a model "parse, don't validate" decoder. The real problems
are concentrated: (1) duplication across the forge-family — three copies of
GitHub release-fetching wanting a shared `github.ts`, plus four near-identical
`*Template` interfaces; and (2) `lwjgl3ify/template.ts`, the one file that
abandons the zod discipline for `as Record<string, unknown>` shape-poking.
Fixing those two would bring the package fully in line with the rest.
