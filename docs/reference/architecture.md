# How opys is built

This page is for someone about to change opys itself. It gives you the map:
what the pieces are, which rules keep them apart, and where to start reading
for the common kinds of change.

The complete record, with the reason behind every decision, is
[CLAUDE.md](https://github.com/harmoniya-net/opys/blob/main/CLAUDE.md) in
the repository. This page is the short version.

## The big picture

```text
                 build time                      │       launch time
                                                 │
  config ──▶ plugins ──▶ merge ──▶ manifest ─────┼──▶ runtime ──▶ game
            (@opys/minecraft,   (@opys/dev)      │   (@opys/runtime)
             @opys/java, …)                      │
                                                 │
                      └────────── @opys/core ────┴──────────┘
                            the format, shared by both
```

There is a wall down the middle. The build side and the runtime never import
each other. They meet only through the manifest, whose format lives in
`@opys/core`. The file it is published as, the bundle, is `@opys/bundle`. That is what lets a launcher ship the small runtime alone, and
what would let someone rewrite the runtime in another language.

## Rust underneath, TypeScript on top

Nearly all behaviour is written in Rust, in `crates/`. One native addon
exposes every crate to JavaScript, each under its own namespace, and each npm
package in `packages/` is a thin typed wrapper over the crate of the same
name:

```text
crates/opys-forge             the logic
crates/opys-napi/src/forge.rs its namespace   ──▶ @opys/binding, as `forge`
packages/forge                the wrapper     ──▶ @opys/forge
```

A package imports its own namespace and no other. The boundary check holds
that, so the crates stay as separate as when each had an addon of its own.

What stays in TypeScript is what only JavaScript has: the config author's
functions (a `to` callback cannot cross into Rust), the plugin objects, and
the command-line tool.

When something behaves wrongly, the fix is almost always in the crate, and
so is its test.

## The rules we hold ourselves to

1. **The format is the contract.** A change to a type in `opys-core` changes
   what every launcher reads. It is done on purpose, and the format number
   goes up.
2. **A manifest is fully resolved.** If the installer would have to look
   something up, a plugin should have done it at build time.
3. **One implementation of each thing.** One merge of plugin output, one
   reading of a Mojang version file, one rule evaluator. Every loader goes
   through the same code, so a fix lands for all of them.
4. **Parse, don't validate.** A type decodes itself into a normal form. No
   unchecked casts.
5. **Functional and testable.** Pure functions wherever possible. A resolver
   is pure logic around a single network call, and takes its API address as
   an option so tests can point it at a local server.

The boundaries are not just prose. They are written as data in
`scripts/architecture/rules.mjs`, and `npm run architecture` fails when the
code leaves them. To add a dependency between packages, you edit that file,
where a reviewer will see it.

## Two things that live outside this repository

**Version documents.** Forge, NeoForge, Cleanroom and lwjgl3ify each
install in their own peculiar way. Rather than teach opys every one, each
build is converted once into a document shaped like Mojang's own.

They are published at `harmoniya-net.github.io/metadata`. A loader crate is
then small: find the build in an index, fetch its document, hand it to the
shared code. Generator:
[harmoniya-net/metadata](https://github.com/harmoniya-net/metadata).

**horno.** Forge and NeoForge finish installing by patching the game jar,
which can only happen on the player's machine. horno is a small Java program
that does it on first launch, then starts the game.

A version document names it as the main class, so opys has no Forge-specific
install code. Source:
[harmoniya-net/horno](https://github.com/harmoniya-net/horno).

Both can change without a commit here, which is one reason the launch
matrix below exists.

## Where to start

| To…                      | Start in                                                    |
| ------------------------ | ----------------------------------------------------------- |
| Add a loader             | `crates/opys-forge`, the simplest one, and `packages/forge` |
| Add a mod source         | `crates/opys-modrinth`, `crates/opys-links`                 |
| Change how plugins merge | `assemble` in `crates/opys-dev/src/engine.rs`               |
| Change the install       | `crates/opys-runtime/src/phases`, one module per phase      |
| Change the format        | `crates/opys-core`, then `packages/core`                    |
| Change the command line  | `packages/cli`                                              |

A new crate or package also needs an entry in
`scripts/architecture/rules.mjs`. The check will tell you what you missed.

## Working in the repository

```sh
npm run build              # the addon and every package
npm test                   # JavaScript unit tests
cargo test --workspace     # Rust tests
npm run typecheck
npm run architecture       # the boundary check
node scripts/smoke-napi.mjs   # the addon loads
```

Three heavier checks are run by hand:

- **`npm run test:int`** talks to the real Mojang, Forge, Adoptium and
  CurseForge services. It needs a network and a `CURSEFORGE_TOKEN`.
- **`node docs/check-examples.mjs`** builds every config shown on this
  site.
- **The launch matrix** (`scripts/launch-matrix`) actually installs and
  starts the game for a list of versions, and passes when a window appears
  and stays up. A change to a loader, the runtime or horno is not verified
  until the cases it touches have been launched.

## Writing these pages

The site is in `docs/`, built with VitePress. `docs/CONTRIBUTING.md` has the
style notes. The short version: write for a person, lead with an example,
and say why.
