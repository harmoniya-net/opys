# Audit — `@opys/runtime`

Code-quality audit, refreshed post-Rust-port — open items only (resolved
findings removed; see git history).

The install pipeline (resolve → pointer → discovery → scan → fetch →
verify → extract → sweep) now lives in the `opys-runtime` Rust crate.
`runtime/lib/index.ts` is a thin shim: typed wrappers around the napi-rs
binding plus a Node `child_process.spawn` for `launch`, and a
message-parsing `translateError` that rewraps `napi::Error` reasons into
the legacy `NetworkError` / `IntegrityError` / `ExtractionError` classes.

## HIGH

None.

## MEDIUM

- **`lib/index.ts` — `translateError` parses error message strings.**
  Regexes match on `"HTTP N downloading URL"` / `"Integrity check
failed: …"` / `"Failed to extract X:"`. This is the compat shim until
  Q10's structured-errors land on the Rust side. Any change to the
  message format on either side silently breaks narrowing. The fix is
  to have the napi crates throw typed errors with a `code` field; once
  that's in, drop the regexes.

## LOW

- **`lib/index.ts` — `InstallProgress` is a hand-typed discriminated
  union over `phase`, but the Rust bridge codegen produces a flat
  `ProgressEvent` with all fields optional.** The TS-side cast in
  `install()` (`event as InstallProgress`) is the boundary marker.
  Mostly fine; worth a thought if the Rust side ever changes the phase
  vocabulary.

## Verdict

Small and predictable. Two follow-ups, both blocked on structured
errors from the Rust side (Q10 in `MIGRATION.md`).
