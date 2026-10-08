# Manifest

This page is the exact shape of a manifest: every field, its type, whether it is
optional, and what an installer does with it. It is for someone writing an
installer in a language other than TypeScript or Rust.

Two kinds of statement appear below. "A reader must" and "an installer must"
are requirements of the format. "The reference" describes what the Rust crates
`opys-core` (decoding) and `opys-runtime` (installing) do, which another
implementation may match or improve on. Where this page says a value is read a
certain way without saying "must", that is what those crates do.

The zip that carries a manifest is described in
[the bundle format](/reference/bundle-format). The variables a launcher must
supply are listed in [Variables](/launcher/vars).

## The principle

A manifest is fully resolved. Every artifact names one concrete source, and a
hash wherever one can be had. Nothing in it says "latest", and nothing asks a
server which file to fetch. An installer looks nothing up: it does not read a
version from a server, take a hash from a header or a sidecar file, or discover
a source at install time. Those decisions are made by the build, before the
manifest is written. See [Concepts](/guide/concepts).

So an installer makes no decisions of its own. The reference does this, in
order:

1. Works out the variables (see [Interpolation](#interpolation)).
2. Keeps the artifacts whose `rules` are satisfied.
3. Skips each artifact whose file is already at `path` and passes its
   integrity check, and fetches the rest.
4. Verifies what it fetched.
5. Extracts the artifacts that have an `extract`.
6. Sweeps the files `restrict` names.

## A minimal manifest

```json
{
  "vars": { "root": "/games/pack" },
  "artifacts": [
    {
      "path": "${root}/libraries/a/a-1.0.jar",
      "source": { "url": "https://example.com/a-1.0.jar" },
      "integrity": { "sha1": "da39a3ee5e6b4b0d3255bfef95601890afd80709" }
    }
  ],
  "launch": {
    "command": "/usr/bin/java",
    "workdir": "${root}",
    "args": ["-cp", "${root}/libraries/a/a-1.0.jar", "com.example.Main"]
  }
}
```

## Top-level fields

| Field       | Type             | Optional                  | Absent means   | Notes                                                                                                                                                             |
| ----------- | ---------------- | ------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `format`    | integer          | required in a bundle head | not applicable | Must be `1`. A bundle reader refuses any other value before it reads the rest. A bare manifest JSON does not carry it, and the reference reader ignores it there. |
| `vars`      | object           | yes                       | `{}`           | Map of name to [vars](#vars).                                                                                                                                     |
| `artifacts` | array            | yes                       | `[]`           | Array of [artifacts](#artifact). In a bundle this is `artifacts.json`.                                                                                            |
| `launch`    | object           | yes                       | no launch      | [Launch](#launch). Installing needs none; launching needs one.                                                                                                    |
| `restrict`  | array of strings | yes                       | no sweep       | Glob patterns. An empty array means the same as absent.                                                                                                           |

Unknown top-level keys are ignored by the reference reader. Do not rely on
that; they are not part of the format.

In a bundle, `opys.json` holds `format`, `vars`, `launch` and `restrict`.
`artifacts.json` holds the array of artifacts. The bundle format page covers
the container.

## Artifact

An artifact is one file: where it goes, where it comes from, and how it is
checked.

| Field       | Type                                          | Optional | Meaning                                                                                                                   |
| ----------- | --------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------- |
| `path`      | string                                        | no       | Destination. Interpolated before use.                                                                                     |
| `source`    | [Source](#source)                             | no       | Where the bytes come from.                                                                                                |
| `size`      | integer, 0 or more                            | yes      | Length in bytes. The reference uses it for progress reporting and to order downloads. It is not checked against the file. |
| `rules`     | [Ruleset](#rules)                             | yes      | When absent, the artifact always applies.                                                                                 |
| `integrity` | [Integrity](#integrity)                       | yes      | When absent, nothing is checked.                                                                                          |
| `extract`   | [Extract rule](#extract), or an array of them | yes      | Run after the file is verified.                                                                                           |
| `metadata`  | any JSON value                                | yes      | Not read by the reference installer. Free for the build's use.                                                            |

An artifact refuses any key not in this table, and so does a source; see
[Reading strictly](#reading-strictly).

The build removes artifacts that share a path, keeping the last. The reference
installer does not look for them. It fetches two artifacts at one path into the
same `.partial` file at once, and the install fails with an I/O error.

This is a native library for Linux, as the `minecraft` plugin writes it for
1.21.1. It is downloaded, checked, and unpacked into the natives directory:

```json
{
  "path": "${library_directory}/org/lwjgl/lwjgl-freetype/3.3.3/lwjgl-freetype-3.3.3-natives-linux.jar",
  "source": {
    "url": "https://libraries.minecraft.net/org/lwjgl/lwjgl-freetype/3.3.3/lwjgl-freetype-3.3.3-natives-linux.jar"
  },
  "size": 1245129,
  "rules": "allow.os.linux",
  "integrity": { "sha1": "149070a5480900347071b7074779531f25a6e3dc" },
  "extract": {
    "into": "${natives_directory}",
    "clean": true,
    "excludes": ["META-INF/"]
  }
}
```

## Source

A source is an object with exactly one of two keys. Which key is present
decides the kind. There is no tag.

- `{ "url": "…" }`: fetch the file over HTTP(S).
- `{ "blob": "<sha256>" }`: the file is the bundle entry `blobs/<sha256>`.

Giving both keys, or neither, is an error. A `blob` must be 64 lowercase hex
characters. Any other key is an error.

```json
{ "source": { "url": "https://example.com/a-1.0.jar" } }
```

```json
{
  "path": "${game_directory}/config/pack.toml",
  "source": {
    "blob": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"
  }
}
```

A `url` is interpolated (see [Interpolation](#interpolation)). A `blob` is not.

How the reference fetches a URL: a GET, with any 2xx status accepted. It
follows redirects and sends `User-Agent: opys/1.0`; some hosts refuse a request
that has none. The body streams into `<path>.partial`, which is renamed to
`<path>` only when the download finishes. A failure of any kind, including a
non-2xx status, is retried up to three times, waiting 0.5 s, 2 s and then 8 s
between tries. A blob is copied out of the bundle into `<path>.partial` and
renamed the same way, with no retry, since waiting does not help a local read.

### Blob artifacts carry no integrity of their own

A blob is named by the sha256 of its bytes, so that name is its integrity. A
reader that decodes such an artifact gives it `{ "sha256": "<the blob id>" }`
and then verifies it like any other artifact. A writer omits `integrity` on a
blob artifact.

If a blob artifact does carry `integrity`, the reference reader accepts it only
when it has a `sha256` entry equal to the blob id, compared as written. An
`integrity` that names only sha1, a different sha256, the same sha256 in
capitals, or no entries at all (`[]`) is refused. When it is accepted, the other
entries are dropped.

## Integrity

`integrity` says how to check the file at `path`. It is one object, or an array
of objects. Each object names one hash, under one of these keys:

| Key      | Hex length | Notes |
| -------- | ---------- | ----- |
| `sha1`   | 40         |       |
| `sha256` | 64         |       |
| `md5`    | 32         |       |

An object with none of these keys is an error. Hash values are compared
case-insensitively. The reader does not check their length; a value of the
wrong length never matches, so the check fails.

```json
{
  "integrity": {
    "sha256": "ce79869e1307ed8ee1e2baa86a412b1eb5b75d10a01006d788a6f968bcfaee94"
  }
}
```

```json
{
  "integrity": [
    { "sha1": "149070a5480900347071b7074779531f25a6e3dc" },
    { "md5": "d41d8cd98f00b204e9800998ecf8427e" }
  ]
}
```

What the reference does with it:

- **Verify.** Read the file at `path` and hash it with each algorithm named.
  The file passes if any one entry matches. An installer that requires every
  entry to match is stricter than the reference.
- **No entries.** When `integrity` is absent, or is an empty array, nothing is
  checked and the file passes.
- **Before download.** If a file already exists at `path`, it is verified and
  kept when it passes. A file that fails is downloaded again. An artifact with
  no `integrity` is never checked, so an existing file is kept without a look.
- **After download.** Every file that was fetched is verified, and the install
  fails with the list of those that did not pass. The reference runtime lets
  its caller turn this step off. That removes only the check of freshly written
  files; the check of files already on disk always runs.

::: warning
Write one hash per object. An object with two hash keys is not a form the
format defines. The reference reader keeps one of them, preferring `sha256`,
then `sha1`, then `md5`, and silently drops the others. It also ignores a key
it does not know when the object has a known hash beside it.
:::

## Extract

`extract` says what to do with the file once it is in place. It is one rule
object, an array of rule objects, or absent. An array runs in order.

The kind of a rule is decided by which key it has:

| Key present | Kind | Required fields   |
| ----------- | ---- | ----------------- |
| `file`      | pick | `file`, `into`    |
| `matches`   | scan | `matches`, `into` |
| neither     | dump | `into`            |

A rule with both `file` and `matches` is read as a pick, and `matches` is
dropped. Give each rule only the fields of its kind: a field that does not
belong to the kind (a `clean` on a scan, a `strip` on a dump) is dropped
without a word.

### Pick

Extracts one named file from the archive.

| Field  | Meaning                                                             |
| ------ | ------------------------------------------------------------------- |
| `file` | Entry name in the archive, matched exactly. Must be a regular file. |
| `into` | Destination file. Interpolated. Parent directories are created.     |

If the archive has no such file, the install fails.

### Scan

Extracts every entry that matches a pattern.

| Field      | Optional | Meaning                                                                                     |
| ---------- | -------- | ------------------------------------------------------------------------------------------- |
| `matches`  | no       | Pattern for entry names. Not interpolated.                                                  |
| `into`     | no       | Destination directory. Interpolated. Created if missing.                                    |
| `includes` | yes      | More patterns. An entry is extracted if it matches `matches` or any of these.               |
| `excludes` | yes      | Patterns for entries to skip. None by default.                                              |
| `strip`    | yes      | Prefixes to remove from each entry name, tried in order. The first that applies is removed. |

For `strip`, a plain string is a literal prefix. A string starting with `*`
removes everything up through the first occurrence of the rest. So `"*/"`
drops an archive's top-level directory whatever its name. An entry whose name is
empty after stripping is skipped. `matches`, `includes` and `excludes` are
tested against the name as it is stored in the archive, before `strip`.

This is how the `java` plugin unpacks every JDK archive. The top-level
directory of a JDK archive can carry a build number, so it is stripped by shape
rather than by name:

```json
{ "matches": "*", "into": "${java_runtime_dir}/jdk-21", "strip": ["*/"] }
```

### Dump

Extracts the whole archive, or the entries that pass a filter.

| Field      | Optional | Meaning                                                                                                                        |
| ---------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `into`     | no       | Destination directory. Interpolated. Created if missing.                                                                       |
| `clean`    | yes      | When `true`, the directory is removed before extraction. Done once per directory per install. Defaults to `false`.             |
| `includes` | yes      | When present, only entries matching one of these are extracted.                                                                |
| `excludes` | yes      | Entries matching one of these are skipped. When absent, the reference uses `["META-INF/"]`. An explicit `[]` excludes nothing. |

::: warning
`clean` removes the directory before the archive is read. An archive stored
inside its own `into` directory is deleted by it, and the extraction fails.
Keep an archive that is cleaned into somewhere else.
:::

### Pattern matching

Entry names are matched with this dialect, which is not the glob syntax used by
`restrict`:

- `a/` or `a/*`: starts with `a/`.
- `a*`: starts with `a`.
- `*a`: ends with `a`.
- Anything else: equal to the pattern.

The forms are tried in that order, so a pattern with `*` at both ends is read
by its trailing `*`. A bare `*` therefore matches every entry.

The archive kind comes from the artifact's `path`. `.tar`, `.tar.gz` and `.tgz`
are tar; everything else is read as zip.

### What gets written

The reference reads the whole archive into memory, then writes:

- Regular files. Directory entries are skipped, and directories are created as
  files need them, so an empty directory in an archive is not created.
- From a tar, symbolic links, on Unix. On Windows they are skipped.
- A tar entry that has any executable bit keeps its mode, on Unix. A zip entry
  never does: its mode is ignored, and the file gets the default.

An installer must not let an entry's name take it out of `into`. A name,
after `strip`, that is absolute or climbs with `..` must be refused, and so
must one that would be written through a symbolic link an earlier entry
created. The reference stops the install on the first such entry, with an
extraction error, and writes nothing where the name pointed. An archive is
somebody else's file, and its entry names are the only thing in it that say
where to write.

### Order of work

Extraction runs after every artifact has been fetched and verified. For each
applicable artifact that has `extract`, its rules run in order. Then the
installer writes an empty file at `<path>.opys-extracted`. Extraction runs on
every install; there is no skip for an archive already extracted. The sweep
never removes a `.opys-extracted` file.

```json
{
  "path": "${library_directory}/com/example/a/1.0/a-1.0-natives.jar",
  "source": { "url": "https://example.com/a-1.0-natives.jar" },
  "integrity": { "sha1": "149070a5480900347071b7074779531f25a6e3dc" },
  "extract": [
    { "matches": "lib/", "into": "${natives_directory}", "strip": ["lib/"] },
    { "file": "LICENSE", "into": "${game_directory}/LICENSE.txt" }
  ]
}
```

## Rules

A **ruleset** decides whether something applies on a given platform. It is one
rule or an array of rules. Where it is absent, the thing always applies.

Rulesets appear on artifacts (`rules`), on [Val](#val-and-valset) objects, and on
[vars](#vars) arms. Launch arguments and environment variables get their
conditions through those.

A **rule** is written one of two ways, and both mean the same thing. A reader
must accept both. A writer may use either; the reference writer uses the
shorthand where it can.

### Shorthand

A string of dot-separated parts:

```text
allow
disallow
allow.os.<name>
allow.os.<name>@<version pattern>
allow.arch.<arch>
allow.features.<feature>
```

`disallow` takes the same forms as `allow`. The names are `linux`, `windows` and
`osx`. The arches are `x86`, `x86_64`, `arm`, `aarch64` and `any`. The version
pattern is everything after `@`, dots included. A feature name is everything
after the second dot, so it may contain dots.

`any` is accepted but is not a wildcard. A rule compares an arch like any other
value, so `allow.arch.any` is satisfied only on a platform whose `arch` is the
string `any`, which the reference runtime never reports.

Anything else is an error, including an unknown action, an unknown name or arch,
and a missing name after `os`, `arch` or `features`.

### Expanded

An object:

```json
{
  "action": "allow",
  "os": { "name": "osx", "version": "^1[0-3]\\.", "arch": "x86_64" }
}
```

```json
{ "action": "disallow", "features": { "is_demo_user": true } }
```

- `action` is `allow` or `disallow`. Required.
- `os` is optional. Its fields are all optional: `name` (`linux`, `windows`,
  `osx`), `version` (a pattern), and `arch` (one of the arches above).
- `features` is optional. Each key is a feature name, and each value is `true`
  or `false`.

::: warning
Write `os` or `features`, never both. The reference reader keeps `os` and drops
`features`. Write only the three `os` names, the five arches, and boolean
feature values. The reference reader reads an expanded rule whose `os` or
`features` it cannot read, such as an unknown OS name or a feature value that is
not a boolean, as if that field were not there. That turns a conditional rule
into an unconditional one.
:::

### Evaluation

Given a platform (its `name`, `version` and `arch`) and a set of enabled
feature names:

1. Each rule has a **condition**.
   - `os`: every field present must match. `name` must equal the platform name.
     `arch` must equal the platform arch. `version` must match the platform
     version. The pattern is searched for, not required to match the whole
     string, so anchor it with `^` and `$` if you need that. A field that is
     absent is not tested, and `os: {}` always holds.
   - `features`: every named feature must be enabled when its value is `true`,
     and not enabled when its value is `false`. All of them must hold.
   - Neither: the condition always holds.
2. A rule is **satisfied** when its action is `allow` and its condition holds,
   or its action is `disallow` and its condition does not hold.
3. A ruleset is **satisfied** when every rule in it is. An empty ruleset is
   satisfied.

So a `disallow` with no condition is never satisfied, and an `allow` with no
condition always is.

```json
["allow.os.linux", "disallow.features.demo"]
```

This is satisfied on Linux when `demo` is not enabled.

The reference runtime's own platform reports `name` as `linux`, `windows` or
`osx` for the OS it runs on (any OS other than Windows and macOS is `linux`),
`arch` as `aarch64` on an ARM64 build and `x86_64` on any other, and `version`
as the empty string. A version pattern therefore matches there only if it
matches the empty string. A launcher that uses version patterns must supply the
real OS version itself. The enabled features are the list the launcher passes
in, which is empty by default.

Patterns use the Rust `regex` crate's syntax. A pattern that is not a valid
expression is not found when the manifest is read. It fails the install when a
rule is evaluated and its `name` and `arch`, if it has them, have matched.

## Val and Valset

A **Val** is one launch argument, or a group of them, with the rules that gate
it. It is a string, or an object:

```json
"-Xmx2G"
```

```json
{ "rules": "allow.os.osx", "value": ["-XstartOnFirstThread"] }
```

- A bare string is that one value, with no rules.
- An object has `value`, required: a string, or an array of strings. It has
  `rules`, optional, which is a [ruleset](#rules).

A **Valset** is an array of Vals. It is resolved in order: for each Val whose
rules are satisfied, its values are appended in order. Each resulting string is
one argument. `launch.args` is a Valset.

## vars

`vars` maps a name to a **ValDef**. A ValDef is either a string, used as it is
on every platform, or an array of **arms**. An arm is an object:

```json
{ "value": "${java_home}/bin/java.exe", "rules": ["allow.os.windows"] }
```

- `value` is a string. Required.
- `rules` is a ruleset. Optional. When absent, the arm always applies.

The arms are evaluated in order. The **last** arm whose rules are satisfied
wins. If no arm is satisfied, the name is not set at all, and a reference to it
stays as written. A flat string is not filtered by platform.

```json
{
  "java_bin": [
    { "value": "${java_home}/bin/java", "rules": "allow.os.linux" },
    { "value": "${java_home}/bin/java", "rules": "allow.os.osx" },
    { "value": "${java_home}\\bin\\java.exe", "rules": "allow.os.windows" }
  ],
  "launcher_name": "opys"
}
```

`launch.envs` is also a map of ValDefs. Its values are interpolated the same
way.

## Interpolation

A template may contain `${name}`. The name is one or more characters, none of
them `}` or whitespace. `\${` is the literal text `${`, with the backslash
removed. Text substituted in is not scanned again.

Resolution order:

1. **Select.** For each name in `vars`, choose its value: the flat string, or
   the last satisfied arm, with the platform and feature set in hand. A name
   with no satisfied arm is not set.
2. **Overlay.** The launcher's own values replace same-named entries and add the
   others. This is where the variables from [Variables](/launcher/vars) come in.
3. **Resolve references.** Each value's own `${…}` references are replaced by
   that value's resolution, recursively. This covers every value, the
   launcher's included, and every name, used or not. A cycle is an error. A
   reference to a name nothing defines is left as written.
4. **Interpolate.** Each template field below has its references replaced.

With `root` set to `/g` and `lib` set to `${root}/libraries`, a path of
`${lib}/a.jar` becomes `/g/libraries/a.jar`.

These fields are interpolated:

- `path` of an artifact.
- `url` of a source.
- `into` of any extract rule.
- Each entry of `restrict`.
- `command` and `workdir` of `launch`, each element of `launch.args`, and each
  value of `launch.envs`.

These are not: `blob`; a rule's `file`, `matches`, `includes`, `excludes` and
`strip`; `rules`; `metadata`.

## Launch

`launch` is an object. It says how to start the game once the files are in place.

| Field     | Type           | Optional | Meaning                                                     |
| --------- | -------------- | -------- | ----------------------------------------------------------- |
| `command` | string         | no       | Program to run. Interpolated.                               |
| `workdir` | string         | no       | Working directory. Interpolated. A launcher may replace it. |
| `args`    | Valset         | yes      | Arguments, in order. Default `[]`.                          |
| `envs`    | map of ValDefs | yes      | Environment variables to add. Default `{}`.                 |

Each resolved argument is interpolated on its own, and is one argument. A
variable cannot expand into several. The reference runtime starts the process with
`command`, `args` and `workdir`, and adds `envs` to the environment it inherits.
`envs` does not replace that environment.

## restrict and the sweep

`restrict` is a list of glob patterns for files that should not be there. It is
read after every artifact has been installed and extracted. An empty or absent
list means no sweep.

A glob is interpolated first, then matched against a file's whole path with
these rules:

- `*` matches any run of characters except `/`.
- `?` matches one character except `/`.
- `**` matches any run of characters, `/` included.
- A `**` that fills a whole path segment may also match no directory at all:
  `a/**/b` matches `a/b`, and `**/b` matches `b`.
- `/**` at the end matches the directory itself and everything under it.
- `{a,b}` matches either alternative. The alternatives are literal text, so a
  `*` in one matches a `*`, and they do not nest. A `{` with no `}` after it
  matches itself.
- Everything else, `[` and `]` included, matches itself.

Each glob's **base** is the text before its first `*`, `?`, `{` or `[`, cut back
to its last `/`, which is not part of it. The sweep works under each base, and
it only looks at files under a base that exists. A glob with no base, such as
`*.jar` or `**/x`, is skipped without an error.

Under each base, the sweep walks the tree. A regular file is removed when all of
these hold:

- its path matches one of the globs for that base;
- its path is not the final path of an artifact that applies on this platform;
- its name does not end in `.opys-extracted`.

Directories are walked, and symbolic links are neither followed nor removed.
Afterwards, every empty directory under the base is removed, deepest first,
whether or not a glob matched it. The base itself is kept. On Windows, paths
compare case-insensitively with `\` read as `/`.

Two consequences follow from the rules above.

- A file that extraction writes is not an artifact. A glob that covers an
  extraction target removes what was extracted, because the sweep runs after
  it.
- The reference compares an artifact's path with a file's path as strings, not
  as files. `${root}/mods/a.jar` and `${game_directory}/mods/a.jar` are
  different strings when `game_directory` is `${root}/`, as the `minecraft`
  plugin defines it, so a glob written one way sweeps an artifact written the
  other. Spell an artifact and the glob that covers it with the same
  variables.

```json
{ "restrict": ["${game_directory}/mods/*.jar", "${game_directory}/config/**"] }
```

## Canonical spelling

A reader must accept every spelling in this page. The format does not require a
writer to pick one, but a writer that wants its output to match the reference
byte for byte writes the canonical one, which the reference writer produces:

- A rule is written as shorthand when it has the shape of one: `allow` or
  `disallow` alone; an `os` with a name and an optional version; an `os` with an
  arch and no name; or `features` with one name. Anything else, such as an `os`
  with only a version, an empty `os`, or several features, is written expanded.
- A ruleset with one rule is written as that rule, bare. With several, it is an
  array. With none, `rules` is left out of an artifact and out of an arm. A Val
  with no rules writes `"rules": []`.
- A Val with one value and no rules is a bare string. Any other Val is an object:
  `value` is always an array, and `rules` is always written, as `[]` when there
  are none.
- An arm with no rules has no `rules` key.
- An `integrity` with one entry is an object, not an array. A blob artifact has
  no `integrity`.
- An `extract` with one rule is that rule, bare. With several, it is an array.
- `vars` and `artifacts` are always written, even when empty. `launch` is written
  whole, with `args` and `envs`, even when they are empty. `restrict` is written
  only when it has entries.

::: warning
The reference writer picks a shorthand by the shape of a rule and does not check
that it says the same thing. An `os` with a `name` is written `os.<name>`, so its
`arch` is lost. An `os` with an `arch` and no `name` is written `arch.<arch>`, so
its `version` is lost. A `features` with one entry is written `features.<name>`,
so a `false` becomes `true`. Do not rely on a round trip through it for those
rules.
:::

## Reading strictly

The reference reader refuses unknown keys in an artifact and in a source, and
refuses an integrity object that has none of `sha1`, `sha256` or `md5`. Those are
the places where a key the reader does not know could change how a file is
checked, and the format says so on purpose.

Everywhere else, the reference reader ignores keys it does not know. An
implementation may refuse them too, and should do so where a key could change
what is installed.
