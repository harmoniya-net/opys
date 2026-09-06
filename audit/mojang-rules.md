# Audit — `opys-mojang-rules` / `@opys/mojang-rules`

Code-quality audit — open items only (resolved findings removed; see git
history).

The TypeScript implementation is gone: `@opys/mojang-rules` now ships types
only, and the format has a single implementation in
`crates/opys-mojang-rules`. Findings below track that crate.

## HIGH

None.

## MEDIUM

None. The former `satisfiesOs`-throws wart is resolved by construction: the
Rust `satisfies_os` returns `Result<bool, RuleError>`, so a malformed version
pattern is in the signature rather than an ambient exception.

## LOW

- **`src/os.rs:88` — `Regex` recompiled on every `satisfies_os` call.** Inside
  `satisfies_ruleset` over many artifacts this recompiles the same pattern
  repeatedly. Compiling at decode time (and carrying the compiled `Regex` on
  `OsConstraint`) would fix it, at the cost of making the struct non-`Eq`.
- **`src/os.rs:9-13` — `OsOptions.name`/`.arch` typed `String`, not
  `OsName`/`OsArch`.** A small lie that lets `satisfies_os` compare against an
  arbitrary string and silently never match. Tighten and validate at the
  platform-detection boundary.
- **`src/ruleset.rs:19,23` — `empty_ruleset()` and `allow_os_ruleset` have thin
  justification.** `empty_ruleset()` returns `Vec::new()`; a literal is as
  clear. `allow_os_ruleset` has real callers (5, in `minecraft-vanilla`), so
  only the former is questionable.
- **`src/rule.rs:26-36` — the bare `Plain { action }` arm is a structural
  subset of the constrained arms.** Untagged deserialisation still works
  because serde tries the arms in order, but the overlap is subtle and load-
  bearing; it deserves a comment at the `#[serde(untagged)]` attribute.

## Verdict

Healthy. Nothing above LOW. The package's main risk was structural rather than
local — a hand-written TS twin drifting from the Rust original — and that is
now removed rather than managed.
