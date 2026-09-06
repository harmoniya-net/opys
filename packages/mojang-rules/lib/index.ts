/**
 * `@opys/mojang-rules` — the Mojang-standard rule format: `os` / `features` /
 * `rule` / `ruleset`.
 *
 * Types and trivial factories only, with no dependencies and no native code,
 * so either side of the build/runtime wall can name the contract freely.
 *
 * Evaluation lives in Rust (`crates/opys-mojang-rules`) and reaches JS two
 * ways, with deliberately different contracts:
 *
 *   - `@opys/mojang` — strict Mojang format;
 *   - `@opys/core`   — additionally expands the opys shorthand.
 */
export * from './os';
export * from './features';
export * from './rule';
export * from './ruleset';
