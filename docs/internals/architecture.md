# Architecture

This page is for a contributor who needs to know where a change belongs before
making it. It names the layers, the rules that keep them apart, and where the
code for common tasks lives. It is a reading path, not the full record: that is
[CLAUDE.md](https://github.com/harmoniya-net/opys/blob/main/CLAUDE.md) in the
repository root. The boundaries are also written as data in
`scripts/architecture/rules.mjs`, and that file is what the check enforces. If
this page, CLAUDE.md and the code disagree, fix the disagreement in the same
change.

Read [Concepts](/guide/concepts) first if you have not. It explains the
manifest, the bundle and the build and launch machines, which this page assumes.

## Principles

Five rules apply to every change.

1. **Functional.** Pure functions, total transforms, no shared mutable state.
   A `class` in a package's `lib/` is an `Error` subclass or has an entry in
   `rules.mjs` saying why it stays, or it goes.
2. **Parse, don't validate.** A domain type decodes itself into its normalised
   form. On the Rust side that is a serde `try_from` through a `…Wire` type that
   exists only for that decode. No `as unknown as` casts.
3. **Typed contracts, no footguns.** Misuse of the public API is a compile error,
   not a runtime check.
4. **No dirty workarounds.** Every special case is justified in a comment or
   deleted.
5. **Modular and unit-testable.** Pure pieces are tested in isolation. The
   standing bar is about 99% line coverage.

Principle 2 has one consequence that surprises people. A manifest may write a
rule as shorthand, `'allow.os.osx'`, and that is a first-class spelling, not a
step towards a longer one. `Rule` and `Ruleset` in `core` accept both. The
expanded form, `MojangRule` and `MojangRuleset` in `mojang-rules`, is the only
form the evaluator sees.

## The hard constraint: the manifest format is the contract

The schemas in `@opys/core` are the manifest format. A launcher written in
another language would reimplement exactly `core`, so that is the thing to keep
stable.

Package layout, the plugin API, the config shape and the CLI flags may all change
freely. The format changes only on purpose, and a bundle declares which format
it is written in (`format`, in its head) so that a reader refuses what it does
not understand. It has changed twice. `pointer` sources and the `discovery`
block were removed, because a manifest must be fully resolved. Then `file`,
`string` and `bytes` sources gave way to `blob`, and the manifest became a
bundle.

For you this means: a change to a schema in `core` is a format change, and needs
the same care as any other change to a published contract.

## Packages

Arrows point from a package to what it depends on. Edges that would clutter the
picture are left out; the complete list is in `scripts/architecture/rules.mjs`.

```text
                          @opys/cli
                 ┌──────────┼──────────────┐
                 ▼          ▼              ▼
          @opys/minecraft   │        @opys/runtime
                 │          │              │
                 ▼          │              │
        plugin packages     │              │
   (forge, java, modrinth…) │              │
                 │          ▼              │
                 └────► @opys/dev          │
                            │              │
                            ▼              ▼
                        @opys/core ◄───────┘
                            │
                            ▼
                    @opys/mojang-rules
                            ▲
                            │
                       @opys/mojang
```

What each package is:

- `@opys/mojang-rules` is types only, with no dependencies at all.
- `@opys/mojang` wraps the `opys-mojang` crate: Mojang's protocol parsers.
- `@opys/core` is the manifest model, the bundle, the shorthand and `Val`.
- `@opys/dev` is the build SDK: `defineConfig`, the build engine and the plugin
  contract.
- `@opys/runtime` is the install and launch executor.
- `@opys/minecraft` re-exports every plugin and adds nothing of its own.
- `@opys/cli` is the `opys` binary, and the only package that joins build time
  to runtime.

Each loader and each provider is also its own package (`@opys/forge`,
`@opys/modrinth`, and so on). `@opys/minecraft` re-exports them.

## Two walls

Two boundaries are the reason the layout looks the way it does. They are checked
by machine, not by review (see below).

**The runtime depends on core alone.** `opys-runtime` may reach `opys-core` and
`opys-mojang-rules`, and nothing else. `@opys/runtime` may reach `@opys/core`,
`@opys/mojang-rules` and its own binding, which leads to `opys-runtime`. A
launcher that embeds the runtime therefore needs the manifest format and an
installer, and nothing of the toolkit. The runtime's `lib/` imports only
`@opys/core`, its own binding and `node:`, and declares no other dependency.

**Dev and runtime never see each other.** `dev` and `runtime` are joined only by
the manifest. `core` is the one plank across the wall, and it holds only what
both sides need. A contract named by the build alone, such as the plugin output
`Contribution`, belongs in `dev`. A contract named by the runtime alone belongs
in `runtime`. Only `@opys/cli` depends on both, and it does so to run
`opys launch`, which builds in memory and installs from that.

A plugin never installs or launches. Every crate and package except `runtime`
and `cli` is barred from reaching the runtime.

## Rust crates and napi bindings

Each Rust crate is `crates/opys-<x>`. A crate that a JavaScript package needs
has a binding beside it, `crates/opys-<x>-napi`, built as a `cdylib`. The binding
is published as `@opys/<x>-binding`, and a package imports its own binding and
no other. `@opys/forge` imports `@opys/forge-binding`, for example.

The rules that follow:

- **One binding per crate.** A binding depends on the crate it exposes and
  reaches nothing that crate does not. It stays off crates.io.
- **Every plugin is a thin wrapper over the crate of the same name.** What stays
  in JavaScript is what only JavaScript has: the author's closures, a `Date`,
  the plugin object itself.
- **A callback never crosses napi.** `modrinth`, `curseforge`, `links` and
  `authliberty` take functions from the config author, and a closure cannot be
  handed to Rust. So each is split in two. Rust resolves to plain data, JavaScript
  makes the one call the author asked for, and Rust builds the artifacts from the
  data plus the answers. `files` works the same way: `scan_directory` says what
  is on disk, and `scanned_files` hashes the files the author placed.
- **Build-time merging is one implementation.** Folding plugin contributions into
  a `Manifest` is `opys-dev`'s `assemble`, reached from JavaScript through
  `@opys/dev-binding`. `opys-dev-napi` builds with the `net` feature off, because
  merging needs no network.

The cost of this layout is that each addon that makes requests statically links
its own HTTP and TLS stack, for every target. That cost is accepted on purpose.
The crate split is the architecture, and the number of binaries must not be
allowed to shape it.

## Loaders share one version-JSON mapping

A Minecraft loader describes its game as a version JSON, and each loader reads
that document differently. What they share is in `opys-minecraft-vanilla`:
the mappers for the client jar, libraries, assets, classpath and launch
arguments. Forge, NeoForge, Fabric, Cleanroom and lwjgl3ify each resolve their
own document and then call the same mappers, so a fix lands once.

Most loaders publish a patch rather than a whole version. A patch says
`inheritsFrom`, and folding it onto the base version has one implementation,
`patch_to_template`. Its rules come from the format, not from any loader:

- the patch's libraries go ahead of the base's on the classpath;
- a base library the patch supersedes is dropped, not left behind it;
- `arguments` appends, while `minecraftArguments` replaces the game line, and
  the two are independent.

The client jar goes last on the classpath, after every library. Fabric folds by
hand, because its profile spells libraries differently, but it goes through the
same `inherited_classpath` and `superseded` pair and never through a rule of its
own.

Two loaders do not fold at all. Cleanroom and lwjgl3ify publish complete version
documents, which are read as a `Client` through `Client::from_version_json`.
Forge publishes every build as an ordinary `inheritsFrom` document, so
`opys-forge` is an index lookup and the shared fold. It does not run Forge's
installers, which are already spelled out inside those documents. How the
published documents are made is in [Version documents](/internals/metadata).

## Build-time HTTP and the runtime downloader

These are two different things, and a change to one should never be made as if
it were the other.

The build side has `opys-dev`'s `http` module. It is one blocking request, with
no retry, no streaming and no resume. Resolvers run once against small JSON
APIs, so that is all they need. `http::get_json` is the layer resolvers call. It
sends a GET, rejects a non-2xx status as `JsonGetError::Status`, and decodes.
`http::get` sits underneath it for callers that treat a status as data, such as
a 404 for a platform a release does not ship. The siblings `post_json` and
`get_bytes` each serve one caller.

The install side has its own downloader, in `opys-runtime`, and it is the one
that fetches the files a player's installation is made of. It is not the
`opys-dev` client, and nothing from that module is used there.

Pinning a file at build time also has one implementation per kind of source.
`pin_github_asset` takes the digest a GitHub release lists, or downloads and
hashes the asset when there is none. `pin_url` downloads and hashes a plain URL.
`opys-link`, `opys-dgpuj` and the mod jars of `opys-lwjgl3ify` go through these,
so none of them can ship an asset unverified. Modrinth and CurseForge answer with
the hash they publish.

## How the boundaries are checked

`npm run architecture` runs `scripts/check-architecture.mjs`. It reads
manifests and sources, not built artifacts, so it needs `cargo` and an installed
`node_modules` and nothing else. It runs first in CI and on every commit.

The boundaries are written as data in `scripts/architecture/rules.mjs`. That
file holds:

- `crates` and `packages`: what each may depend on, and whether it has a
  binding;
- `walls`: sets of packages or crates that may reach only a named set, or may
  never reach a named one;
- `classes` and `hashMaps`: the exemptions, each with the reason it stays;
- `withoutDefaultFeatures`: which crates must take `opys-dev` without its `net`
  feature.

Every list is an allow-list. A crate or package that `rules.mjs` does not name
fails the check, so nothing joins the workspace without a place in it. Adding an
edge, a binding or an exemption means editing that file, and a reviewer sees the
edit as the architectural change it is. The walls are checked over everything a
node reaches, not just what it names, and they are checked across napi, so a
wrapper that reaches a crate through its binding breaks a wall the same way an
import would.

`npm run test:architecture` builds a small sound world and breaks it one rule at
a time, to show that each check can fail. That is the test of the checker itself.

The checker covers only what can be read from the text: the dependency graph,
the walls, the imports a `package.json` declares, and the syntax-level
principles: no `as unknown as`, no stray `class`, no `…Wire` type that is `pub`,
and no file that names `HashMap` without saying why. It also holds two lists that are
still kept by hand. Every package and binding must be in the root `workspaces`
list, with each package after the ones it depends on. `scripts/smoke-napi.mjs`
must load every binding. The release workflow finds bindings by directory name
and takes the crates.io publish order from the dependency graph, so those lists
are no longer written down; the check only confirms the workflow still does it.
Purity, total transforms and the rest stay a matter of review.

## Where to start reading

Find the task, then open the files in the order given.

**Add a loader.** Start with `crates/opys-forge`, the simplest loader: an index
lookup and the shared fold. `crates/opys-fabric` is the same shape with its own
profile format. The mappers it calls are in `crates/opys-minecraft-vanilla`, and
the JavaScript wrapper is `packages/forge`, which is the model for the new
package. The binding is `crates/opys-forge-napi`, including its `package.json`
and `npm/` directories. Then wire it in:

- In `rules.mjs`, add the loader's name to the three loader lists, which feed the
  `crates` entries, the `packages` entries and the wall that says a loader is
  built on vanilla and never on another loader. Add it to `LOADERS` as well if
  a modpack can name it.
- Add the crate to `[workspace.dependencies]` in the root `Cargo.toml`.
- Add the package and its binding to `workspaces` in the root `package.json`,
  after the packages they depend on.
- Add the package to the `@opys/minecraft` umbrella: its dependencies, its
  re-exports, and its entry in `rules.mjs`. The check does not notice a loader
  missing from the umbrella.
- Make `scripts/smoke-napi.mjs` load the new binding.

`npm run architecture` fails on a missed `workspaces` entry or a binding the
smoke test never loads. The release workflow needs no edit.

**Add a provider.** Look at `crates/opys-modrinth` and `crates/opys-curseforge`.
Both take a pinned file from a public API, and a modpack goes through
`crates/opys-modpack`, which holds what the two pack formats share. For a pasted
link, `parse_link` in `crates/opys-link/src/link.rs` is pure, and `resolve_links`
in `crates/opys-link/src/resolve.rs` dispatches to the providers. Give a new
provider an `apiBase` the way `opys-java` does, so the network path can be
tested against a loopback server. Its binding is `opys-<name>-napi` and its
wrapper is `packages/<name>`. Both need entries in `rules.mjs`, and the same
wiring as a loader: `workspaces`, the umbrella and the smoke test.

**Change the format.** Start in `crates/opys-core` and `packages/core`, where the
schemas are. A change there changes what every launcher reads, so it is a
deliberate format change, and you must decide whether the bundle's format number
(`BUNDLE_FORMAT` in `crates/opys-core/src/bundle.rs`) changes with it. The
consumer is `crates/opys-runtime`, which must still reach only `core`. Changes to
a loader crate, the runtime or horno are not verified until the launch matrix has
run the cases they touch. See [Testing](/internals/testing).

**Change the build.** The merge is `assemble` in `crates/opys-dev/src/engine.rs`.
Plugin contributions are in `contribution.rs`.

**Change the install.** The runtime runs its phases in order: resolve, scan,
fetch, verify, extract, sweep. Each is a module under
`crates/opys-runtime/src/phases`.

## Further reading

- [horno](/internals/horno) is the installer that runs a loader's processors on
  the launching machine.
- [Version documents](/internals/metadata) describes the published documents
  the loaders read.
- [Testing](/internals/testing) covers the Rust and TypeScript suites, the
  architecture check and the launch matrix.
- [CLAUDE.md](https://github.com/harmoniya-net/opys/blob/main/CLAUDE.md) is the
  full record of the decisions on this page, and the reasons for each.
