# Unifest Format Specification

## Overview

A **Unifest** is a manifest that describes a set of artifacts to install (`unifacts`), variables to compute (`vars`), and an optional launch configuration (`launch`). The format is serialized as either **TOML** or **JSON** — parsers detect JSON by a leading `{` character and fall back to TOML otherwise.

---

## Top-level Structure

```toml
[vars]
# optional — variable definitions

[launch]
# optional — how to launch the application

[[unifacts]]
# zero or more artifact entries
```

| Field      | Type                  | Required | Default |
| ---------- | --------------------- | -------- | ------- |
| `vars`     | [ValDefs](#valdefs)   | no       | empty   |
| `launch`   | [Launch](#launch)     | no       | —       |
| `unifacts` | [Unifact](#unifact)[] | no       | `[]`    |

---

## Unifact

A **unifact** is a single artifact entry — a file to download, copy, or generate, with optional integrity checking and archive extraction.

```toml
[[unifacts]]
path    = "libs/server.jar"          # destination path (required)
source  = { url = "https://..." }    # where to get the file (required)
size    = { exact = 12345678 }       # optional expected size in bytes
rules   = ["allow.os.linux"]         # optional platform filter
integrity = { sha256 = "abc123..." } # optional checksum
metadata  = {}                       # optional arbitrary JSON
extract   = { into = "out/" }        # optional archive extraction rules
```

### `path`

**Required.** Destination path where the file will be written on disk. Relative paths are resolved from the installation root.

### `source`

**Required.** Describes where to obtain the file contents. See [Source](#source).

### `size`

**Optional.** Expected file size used for progress tracking. Does not block installation if mismatched. See [Size](#size).

### `rules`

**Optional.** A [RuleSet](#ruleset-brief) that determines whether this unifact applies to the current platform/feature set. When absent, the unifact applies unconditionally.

### `integrity`

**Optional.** Checksum to verify after download. If the file already exists on disk and its hash matches, the download is skipped entirely. See [Integrity](#integrity).

### `metadata`

**Optional.** Arbitrary JSON value. Not interpreted by the installer — available for consumers of the manifest.

### `extract`

**Optional.** Archive extraction rules applied after download. Supports ZIP and tar.gz (auto-detected by magic bytes). If absent or empty, no extraction is performed. See [Extract](#extract).

---

## Source

Describes how the artifact content is obtained.

All variants use **snake_case** keys in their tagged object form.

### `url`

Fetches the file over HTTP/HTTPS.

```toml
source = { url = "https://example.com/file.jar" }
```

```json
"source": { "url": "https://example.com/file.jar" }
```

### `file`

Copies from a path on the local filesystem.

```toml
source = { file = "/opt/assets/runtime.tar.gz" }
```

### `string`

Writes a literal string as the file content.

```toml
source = { string = "Hello, world!" }
```

Useful for generating small text files (configs, scripts) inline.

### `empty`

No content — creates nothing. Useful as a placeholder or when extraction from another step is the real goal.

```toml
source = "empty"
```

---

## Integrity

Checksum verified after the file is written. If the hash does not match, installation of that unifact fails.

All variants use **lowercase** keys.

### `sha1`

```toml
integrity = { sha1 = "da39a3ee5e6b4b0d3255bfef95601890afd80709" }
```

### `sha256`

```toml
integrity = { sha256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" }
```

### `skip` (default)

No integrity check. Written explicitly or omitted entirely.

```toml
integrity = "skip"
```

---

## Size

Used only for progress estimation. Does not validate or enforce actual file size.

All variants use **snake_case** keys.

### `exact`

```toml
size = { exact = 52428800 }  # exactly 50 MiB
```

The file is expected to be exactly this many bytes.

### `at_least`

```toml
size = { at_least = 1048576 }  # at least 1 MiB
```

The file is expected to be at least this many bytes.

### `unknown` (default)

```toml
size = "unknown"
```

No size information available. Omit the field to get the same result.

### Addition monoid

`UnifactSize` forms a commutative monoid under `+` with identity `Exact(0)`. The rules:

```
Exact(a)   + Exact(b)   = Exact(a + b)
AtLeast(a) + Exact(b)   = AtLeast(a + b)   -- certainty is lost
Exact(a)   + Unknown    = AtLeast(a)        -- unknown taints exact into at_least
AtLeast(a) + Unknown    = AtLeast(a)        -- unknown contributes 0, keeps at_least
Unknown    + Unknown    = AtLeast(0)        -- two unknowns produce at_least(0)
```

In short: `Exact` is only preserved when both operands are `Exact`. Any `Unknown` operand converts an `Exact` result to `AtLeast` (contributing 0 to the sum). An `AtLeast` operand always produces `AtLeast`. This means a collection's total size is `Exact` only when every unifact has a known exact size.

---

## Extract

Specifies how to unpack an archive after it is written to `path`. The archive format is auto-detected by magic bytes: `PK` (0x50 0x4B) for ZIP, `\x1F\x8B` for tar.gz. Any other format is an error.

`extract` can be either a **single rule object** or an **array of rule objects**. All matching rules are applied in order to each archive entry.

```
Extract = ExtractRule | ExtractRule[]

ExtractRule =
  | { file: string, into: path }                                              -- Pick
  | { matches: glob, into: path, strip?: string[], includes?: glob[], excludes?: glob[] }  -- Scan
  | { into: path, includes?: glob[], excludes?: glob[] }                      -- Dump
```

Disambiguation: a rule with `file` is `Pick`; a rule with `matches` is `Scan`; a rule with only `into` (and optional filters) is `Dump`.

```toml
# Single rule (shorthand)
extract = { into = "runtime/" }

# Multiple rules
[[unifacts]]
path = "bundle.zip"
source = { url = "..." }
[[unifacts.extract]]
file = "LICENSE"
into = "docs/LICENSE.txt"
[[unifacts.extract]]
into = "bundle/"
excludes = ["*.md"]
```

### Rule: `Dump`

Extracts all archive entries to a destination directory, preserving the full internal path.

| Field      | Type   | Required | Description                                                   |
| ---------- | ------ | -------- | ------------------------------------------------------------- |
| `into`     | path   | yes      | Destination directory for extracted files                     |
| `includes` | glob[] | no       | If non-empty, only entries matching any pattern are extracted |
| `excludes` | glob[] | no       | Entries matching any pattern are skipped                      |

```toml
extract = { into = "runtime/" }
extract = { into = "runtime/", excludes = ["*.txt", "docs/**"] }
extract = { into = "jre/", includes = ["bin/**", "lib/**"] }
```

`includes` and `excludes` are glob patterns matched against the full internal archive path (e.g. `jdk-21/bin/java`).

### Rule: `Scan`

Extracts entries whose path matches a glob pattern, with optional prefix stripping.

| Field      | Type     | Required | Description                                       |
| ---------- | -------- | -------- | ------------------------------------------------- |
| `matches`  | glob     | yes      | Glob matched against internal archive path        |
| `into`     | path     | yes      | Destination directory                             |
| `strip`    | string[] | no       | Path prefixes to strip before writing             |
| `includes` | glob[]   | no       | Additional include filter applied after `matches` |
| `excludes` | glob[]   | no       | Entries matching any pattern are skipped          |

```toml
# Extract everything under jdk-21/ into jre/, stripping the top-level dir
extract = { matches = "jdk-21/**", into = "jre/", strip = ["jdk-21/"] }
```

`strip` is applied sequentially: each prefix is tried in order, and the first matching one is stripped. If none match, the full path is kept.

```toml
# Produces: jre/bin/java  (not jre/jdk-21/bin/java)
extract = { matches = "jdk-21/**", into = "jre/", strip = ["jdk-21/"] }
```

### Rule: `Pick`

Extracts exactly one named file to an exact destination path.

| Field  | Type   | Required | Description                            |
| ------ | ------ | -------- | -------------------------------------- |
| `file` | string | yes      | Exact internal archive path to extract |
| `into` | path   | yes      | Exact destination file path            |

```toml
extract = { file = "META-INF/MANIFEST.MF", into = "meta/manifest.txt" }
```

Unlike `Dump` and `Scan`, `into` here is a **file path**, not a directory.

---

## Variables — ValDefs

`vars` is a dictionary of named variables. Each variable may be a plain string or a conditional value that activates only when its [RuleSet](#ruleset-brief) is satisfied.

```
ValDefs = { [key: string]: Val } | [string, Val][]

Val =
  | string                          -- literal, no condition
  | { value: string, rules: RuleSet }  -- conditional
```

The map form (`{ key: val }`) is order-independent (keys sorted alphabetically on parse). The sequence form (`[[key, val], ...]`) preserves insertion order and allows the same key to appear multiple times — which is required for accumulation patterns.

Variables support `${name}` interpolation. Resolution is two-pass: self-references (e.g. `path = "${path}:/extra"`) expand against the current accumulated value, then all forward references are resolved recursively. Circular dependencies are an error.

Escape a literal `${` with `\${` — it will be preserved as `${` in the resolved value.

### Forms

**Literal:**

```toml
[vars]
game_dir = "/home/user/.minecraft"
```

**Conditional (single):**

```toml
[vars]
java = { value = "/usr/bin/java", rules = "allow.os.linux" }
```

**Map form** (equivalent, order of keys is alphabetical when parsed):

```toml
[vars]
game_dir = "/home/user/.minecraft"
java     = { value = "C:\\Program Files\\Java\\bin\\java.exe", rules = "allow.os.windows" }
```

**Sequence form** (preserves definition order, allows the same key multiple times):

```toml
[vars]
vars = [
  ["classpath", "base.jar"],
  ["classpath", "${classpath}:extra.jar"],
]
```

Redefining a key appends a new entry. The last entry whose rule matches wins during final resolution.

### Self-reference accumulation

Defining the same key multiple times with `${key}` references itself lets you build up a value incrementally:

```toml
[vars]
classpath = "a.jar"
classpath = "${classpath}:b.jar"
classpath = "${classpath}:c.jar"
# resolves to "a.jar:b.jar:c.jar"
```

### Platform-specific override

```toml
[vars]
separator = ":"
separator = { value = ";", rules = "allow.os.windows" }
```

On Windows `separator` resolves to `;`; elsewhere to `:`.

---

## Variables — ValSet

A `ValSet` is an ordered list of string items, each optionally conditional. Used for `launch.args`.

```
ValSet = ValSetItem[]

ValSetItem =
  | string                                     -- literal, always included
  | { rules: RuleSet, value: string }          -- conditional single item
  | { rules: RuleSet, value: string[] }        -- conditional multi-item (all injected as separate args)
```

Only items whose `rules` are satisfied for the current OS/features are included in the resolved list. A multi-item entry injects each string as a separate element.

### Forms

**Literal item:**

```toml
args = ["-Xmx4G", "-jar", "server.jar"]
```

**Conditional single string:**

```toml
args = [
  { rules = "allow.os.linux",   value = "-XstartOnFirstThread" },
  { rules = "allow.os.windows", value = "-XX:HeapDumpPath=MojangTricksIntelDriversForPerformance_javaw.exe_minecraft.exe.heapdump" },
  "-jar",
  "server.jar",
]
```

**Conditional multi-string** (all values are included as separate items when the rule matches):

```toml
args = [
  { rules = "allow.os.linux", value = ["-Dos.name=Linux", "-Dos.version=10"] },
]
```

Only items whose rules are satisfied for the current OS/features are included in the resolved argument list.

---

## RuleSet (brief)

Rules appear in `unifact.rules`, `vars` entries, and `launch.args` / `launch.envs` entries. A RuleSet is satisfied when **all** its rules pass.

### Shorthand strings

```
"allow"                     — always passes
"disallow"                  — never passes
"allow.os.linux"            — Linux only
"allow.os.windows"          — Windows only
"allow.os.osx"              — macOS only
"disallow.os.linux"         — anything except Linux
"allow.features.is_demo"    — feature flag active
"disallow.features.is_demo" — feature flag not active
```

### Object form

```json
{ "action": "allow",    "os": { "name": "linux" } }
{ "action": "disallow", "os": { "name": "osx"   } }
{ "action": "allow",    "os": { "name": "windows", "version": "^10\\." } }
{ "action": "allow",    "features": { "is_demo_user": true } }
```

`version` is a **regex** matched against the OS version string.

### Array (AND semantics)

```json
[{ "action": "allow" }, { "action": "disallow", "os": { "name": "osx" } }]
```

All rules in the array must pass. The above means "allow everything except macOS".

---

## Launch

Describes the command to run after installation.

```toml
[launch]
command = "java"
workdir = "."
args    = ["-Xmx4G", "-jar", "server.jar"]

[launch.envs]
JAVA_HOME = "/usr/lib/jvm/java-21"
```

| Field     | Type                | Required | Description                               |
| --------- | ------------------- | -------- | ----------------------------------------- |
| `command` | string              | yes      | Executable name or absolute path          |
| `workdir` | path                | yes      | Working directory for the spawned process |
| `args`    | [ValSet](#valset)   | no       | Command-line arguments (default: empty)   |
| `envs`    | [ValDefs](#valdefs) | no       | Environment variables (default: empty)    |

`${var}` interpolation is applied to all fields after variables are resolved. `args` and `envs` support conditional entries via rules.

When multiple Unifests are merged, the `launch` section of the **last** manifest that defines one wins.

---

## Pack Config (`unifest.toml`)

A **pack config** is a higher-level file that composes one or more Unifests by importing them, then optionally overrides `vars` and `launch`. It is consumed by the CLI tool, not by the Unifest library directly.

```toml
[[import]]
from.path = "./extra.unifest.json"
exclude = ["**.sha1"]

[[import]]
from.url = "https://example.com/extra.unifest.json"

[vars]
game_dir = "/home/user/.minecraft"

[launch]
command = "java"
workdir = "${game_dir}"
args    = ["-Xmx4G", "-jar", "${game_dir}/server.jar"]
```

### `[[import]]`

Each entry imports a Unifest from an external source and merges it into the final manifest.

| Field     | Type              | Required | Description                                     |
| --------- | ----------------- | -------- | ----------------------------------------------- |
| `from`    | [Source](#source) | yes      | Where to fetch the Unifest (TOML or JSON)       |
| `exclude` | glob[]            | no       | Unifact `path` patterns to drop from the import |

Imports are merged in order. When the same variable key appears in multiple imports, later definitions take precedence (last-writer-wins for single values; all entries are kept for accumulation patterns). `launch` from the **last** import that defines one is used — the pack-level `[launch]` overrides it entirely if present. Pack-level `[vars]` are appended after all imported vars.

`exclude` uses glob patterns matched against each unifact's `path` value. Matching entries are removed from the imported Unifest before merging.

```toml
[[import]]
from.path = "./extra.unifest.json"
exclude = ["**.sha1", "META-INF/**"]
```

### `[vars]`

Same format as [ValDefs](#valdefs). Appended to the merged vars of all imports, so pack-level vars can reference or override imported ones.

### `[launch]`

Same format as [Launch](#launch). If present, completely replaces any `launch` section from the imported Unifests.

---

## Variable Interpolation

`${name}` is substituted wherever string values appear — in `vars`, `launch.command`, `launch.workdir`, `launch.args`, `launch.envs`, and across all `unifact` fields after compilation.

- Missing variables: left as-is (`${missing}` stays in the output with a warning).
- Variable names with spaces: not substituted, left as-is.
- Unclosed `${`: not substituted, left as-is.
- Escaped `\${`: becomes literal `${` in the final output.
- Circular references: compilation fails with an error naming the cycle.

---

## Serialization Notes

- Both **TOML** and **JSON** are accepted for Unifest. PackConfig (`unifest.toml`) is always TOML.
- Enum variants serialize as **snake_case** unless noted otherwise.
- `UnifactExtract` with a single rule serializes as a plain object (not an array) in JSON; deserialization accepts both.
- `ValDefs` serializes as an array of `[key, value]` pairs to preserve ordering and allow duplicate keys; it also deserializes from a plain `{ key: value }` map.
- `RuleSet` with a single rule serializes as that rule directly (not wrapped in an array).
