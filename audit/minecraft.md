# Audit — `@torba/minecraft`

Code-quality audit, 2026-05-19 — open items only (resolved findings removed;
see git history).

## HIGH

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

## LOW

- **`forge/template.ts:40-58` — `modulePathArtifacts` re-flattens args by
  hand**, the same pattern `fixArg` in `recipe.ts` does. Consider a shared
  `flattenArgValues(args)` helper.
- **`forge/resolver.ts:76`, `cleanroom/resolver.ts`, `lwjgl3ify/resolver.ts` —
  `MasterIndex`/`RawRelease` typed as bare interfaces, no decode.** First-party
  services, so lower severity, but a zod boundary would catch upstream drift.

## Verdict

Good overall health: the plugin model is clean (pure factories, all I/O inside
`build`), `plugins.ts` and `mappers/` are tidy and functional, and
`forge/recipe.ts` is a model "parse, don't validate" decoder. The one file
still out of step is `lwjgl3ify/template.ts`, which abandons the zod
discipline for `as Record<string, unknown>` shape-poking — the best remaining
cleanup candidate.
