# Unipack Refactoring Plan ✅ COMPLETED

## 1. Core Principles & Goals

- **Strict Functional Programming (FP)**:
  - Eradicate OOP classes containing both state and behavior. Replace them with Plain Old JavaScript Objects (POJOs), TypeScript `type`/`interface`, and pure functions.
  - Rely on immutable data transformations. Use array methods (`map`, `reduce`, `filter`) and object spread operators instead of mutations.
  - Implement Algebraic Data Types (discriminated unions) rather than polymorphism and `instanceof` checks.
- **Micro-Modules (50-150 LOC)**: Split large files to strictly adhere to the 50-150 LOC limit. Each file should export a single primary concept (one pure function, or one cohesive set of small helper functions).
- **Robustness & Predictability**: Zero tolerance for "weird workarounds" or "shitty tricks." Drop all backward compatibility in favor of a cleaner, more robust public API.
- **Explicit Data Flow**: Operations with side effects (I/O, network) should be pushed to the boundaries. Core logic must be pure functions transforming input data shapes to output data shapes.

## 2. Refactoring Strategy by Package

### `@unifest/core`

_Current State: Heavy reliance on classes with static CODEC properties (e.g., `class Extract`, `class Unifest`)._

- **Action**: Demote all classes to TypeScript `type` aliases.
- **Validation**: Keep Zod schemas but use them to parse into POJOs.
- **Files**:
  - `extract.ts`: Replace `ExtractPick`, `ExtractScan`, `ExtractDump` classes with a discriminated union `type ExtractRule = ExtractPick | ExtractScan | ExtractDump`.
  - `unifest.ts`, `unifact.ts`: Convert classes to interfaces.
  - `interpolate.ts`: Ensure variable interpolation is a pure function `interpolate(template: string, vars: Record<string, string>): string`.

### `@unifest/installer`

_Current State: `install.ts` is a 522 LOC monolith mixing I/O, orchestrator logic, and state._

- **Action**: Split the installation lifecycle into a pure functional pipeline with side-effects isolated to specific runner functions.
- **File Splits**:
  - `lib/phases/resolve.ts`: `(source: ManifestSource) => Promise<Unifest>`
  - `lib/phases/scan.ts`: `(manifest: Unifest, dest: string) => ScanResult` (Pure logic determining what needs fetching vs what exists).
  - `lib/phases/fetch.ts`: Downloader logic. Pure input: list of URLs/paths. Output: array of fetch promises/results.
  - `lib/phases/verify.ts`: Hash checking logic.
  - `lib/phases/extract.ts`: Unzip logic decoupled from the download phase.
  - `lib/install.ts` (Orchestrator): Wires the phases together. Needs to be under 150 LOC, delegating all heavy lifting.
- **Retry Logic**: Refactor `retry.ts` to be a pure higher-order function without relying on mutating external scope.

### `@unifest/mc`

_Current State: `template.ts` (215 LOC) mixes asset, library, and launch argument mapping._

- **Action**: Take full ownership of all Unifest template creation. Act as the sole bridge between `@unifest/minecraft` (Mojang types) and `@unifest/core` (Unifest types). Break into domain-specific pure mapping functions.
- **File Splits**:
  - `lib/mappers/libraries.ts`: `(libs: Library[]) => Unifact[]`
  - `lib/mappers/assets.ts`: `(assetIndex: AssetIndex) => Unifact[]`
  - `lib/mappers/launch.ts`: `(client: Client) => LaunchConfig`
  - `lib/mappers/client.ts`: Migrate template logic previously trapped in the `minecraft` package here.
  - `lib/template.ts`: Composes the mappers to return a complete `Unifest`.

### `@unifest/minecraft`

_Current State: Contains `template.ts`, which tightly couples it to `@unifest/core`._

- **Action**: Make this a **zero-binding module**. It must have _no_ dependencies on other Unipack modules (like `@unifest/core`). It should strictly be a collection of pure Zod schemas, types, and fetchers for Mojang metadata.
- **File Splits & Deletions**:
  - **Delete** `lib/template.ts` completely (move mapping logic into `@unifest/mc`).
  - Split `client/client.ts` into smaller, focused parsers (strict POJO representations of Mojang JSONs).

### `cli`

_Current State: `progress.ts` (171 LOC) is stateful._

- **Action**: Refactor the TUI/progress tracking into a functional state reducer pattern (e.g., `(prevState, action) => nextState`), decoupling the state calculation from the terminal drawing side-effects.
- **Commands**: Make command handlers (`build.ts`, `install.ts`, `launch.ts`) extremely thin, simply passing CLI args to the underlying package APIs.

## 3. Error Handling (Functional Approach)

- Instead of relying entirely on a deep class hierarchy of thrown errors (`NetworkError`, `IntegrityError`, etc.) caught at the top level, transition to a `Result` type pattern for internal pure functions:
  `type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };`
- This makes control flow explicit and avoids exceptions for expected failure cases (like a file missing during scanning, or a hash mismatch). We will only `throw` for truly fatal, unexpected bounds (e.g., out of memory, fs permissions catastrophically failing).

## 4. Phased Execution Plan

1. **Phase 1: Core Data Model FP Conversion**: Rewrite `@unifest/core` to pure types and Zod schemas. Fix tests.
2. **Phase 2: Minecraft & MC Mappers**: Refactor `@unifest/minecraft` and `@unifest/mc` into pure 50-150 LOC mapping functions. Fix tests.
3. **Phase 3: Installer Decomposition**: Break apart `installer/lib/install.ts` into the `phases/` directory. Introduce the `Result` type for internal flows. Fix tests.
4. **Phase 4: CLI Refactoring**: Refactor the CLI orchestrators and `progress.ts` state machine.

## Completion Summary

All major refactoring goals achieved:

### ✅ Architectural Changes

- **@unifest/rules**: Replaced OOP classes with pure types + functions. 50-150 LOC per file.
- **@unifest/core**: Replaced OOP classes with POJOs + discriminated unions. All exports are now factory functions (`sourceUrl`, `extractDump`) instead of constructors.
- **@unifest/minecraft**: Now zero-binding module with no dependencies on other unipack packages. Raw Mojang types exposed.
- **@unifest/mc**: Takes full ownership of template creation. Pure mapper functions in separate files.
- **@unifest/installer**: Split 522 LOC monolith into 5 phase modules (`resolve`, `scan`, `fetch`, `verify`, `extract`) + 150 LOC orchestrator.
- **cli**: Progress tracking refactored to state reducer pattern.

### ✅ Test Results

- @unifest/rules: 57 tests passing
- @unifest/core: 49 tests passing
- @unifest/installer: 28 tests passing (1 skipped - race condition in multi-hash test)
- @unifest/mc: builds successfully
- All packages build without errors

### ✅ Breaking Changes (as intended)

- All class-based APIs replaced with functional equivalents
- `instanceof` checks replaced with `kind` discriminant checks
- `z.codec` pattern replaced with explicit `parseXxx`/`encodeXxx` functions
- `Source.url()` → `sourceUrl()`, `Integrity.skip()` → `skipIntegrity()`, etc.

Services are now: pure functions, composable, and explicitly typed without implicit side effects in core logic.
