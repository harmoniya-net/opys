# @opys/core

`@opys/core` is the manifest data model: the types a manifest is made of, the
functions that read and write one, and the bundle it is published as. Use it
when you read, write or check a manifest, or when a plugin builds artifacts.
The format itself is in [the manifest](/reference/manifest) and
[the bundle format](/reference/bundle-format). This page is the API.

```sh
npm install @opys/core
```

Core is the reference implementation of the format. Its functions are typed
wrappers over native code. Its types are plain data, so you build them as
ordinary objects.

The exports are grouped by what you use them for.

## Manifest

| Export           | Signature                                                                    | What it does                                                                                       |
| ---------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `decodeManifest` | `(wire: unknown) => Manifest`                                                | Decodes a manifest object from its wire form, normalising it as it goes.                           |
| `parseManifest`  | `(input: string) => Manifest`                                                | Parses a JSON string into a `Manifest`.                                                            |
| `encodeManifest` | `(domain: Manifest) => unknown`                                              | Encodes a `Manifest` back to its wire form.                                                        |
| `filterManifest` | `(manifest: Manifest, platform: OsOptions, features?: string[]) => Manifest` | Returns the manifest without the artifacts whose rules exclude them on a platform and feature set. |

`OsOptions` is `{ name, version, arch }`, all strings. A platform is written as
`{ name: 'linux', version: '', arch: 'x86_64' }`. The type is re-exported from
`@opys/mojang-rules`.

`filterManifest` filters artifacts only. `vars` and `launch` come back as they
went in, with their conditional arms still in place. To read a launch for a
platform, use `resolvedArgs` and `resolvedEnvs` under
[Vars and interpolation](#vars-and-interpolation).

| Type       | Shape                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------- |
| `Manifest` | `{ vars, launch?, artifacts, restrict? }`                                                |
| `Head`     | A `Manifest` without `artifacts`, plus `format: number`. This is a bundle's first entry. |
| `Launch`   | `{ command, workdir, args: Valset, envs: ValDefs }`                                      |

::: warning Encoding changes some rules
A manifest is encoded by `encodeManifest`, by `writeBundle`, and by the build
that produces the manifest `@opys/dev` returns. Each writes a rule in shorthand
wherever a shorthand exists, and two cases do not survive that. An `os` rule
that has both a `name` and an `arch` is written as `allow.os.<name>`, so the
`arch` is lost. A rule with a single feature set to `false` is written as
`allow.features.<name>`, which requires the feature to be on. Decoding is not
affected.
:::

## Artifacts and sources

| Export                 | Signature                                               | What it does                                                                                                 |
| ---------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `sourceUrl`            | `(url: string) => Source`                               | A source on the network.                                                                                     |
| `sourceBlob`           | `(blob: string) => Source`                              | A blob, named by its sha256 id.                                                                              |
| `extractPick`          | `(file: string, into: string) => ExtractPick`           | Extracts one file.                                                                                           |
| `extractScan`          | `(matches: string, into: string, opts?) => ExtractScan` | Extracts entries matching `matches`. `opts` takes `strip`, `includes` and `excludes`.                        |
| `extractDump`          | `(into: string, opts?) => ExtractDump`                  | Extracts the whole archive. `opts` takes `clean`, `includes` and `excludes`.                                 |
| `extractRules`         | `(artifact: Artifact) => readonly ExtractRule[]`        | An artifact's extract rules as a list, whether written as one or as several.                                 |
| `deduplicateArtifacts` | `(artifacts: Artifact[]) => Artifact[]`                 | Drops duplicates by normalised path. The later entry's content wins, and it keeps the position of the first. |

| Type          | Shape                                                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Artifact`    | `{ path, source, size?, rules?, integrity?, metadata?, extract? }`. Any other key is refused when the artifact is decoded; `metadata` is the place for extra data. |
| `Source`      | `{ url: string } \| { blob: string }`. Narrow with `'url' in source`.                                                                                              |
| `Integrity`   | A `HashEntry`, or a list of them. `HashEntry` is `{ sha1 }`, `{ sha256 }` or `{ md5 }`.                                                                            |
| `HashAlgo`    | `'sha1' \| 'sha256' \| 'md5'`                                                                                                                                      |
| `ExtractRule` | `ExtractPick \| ExtractScan \| ExtractDump`. Narrow by which field is present: `file` picks, `matches` scans, otherwise it dumps.                                  |

An artifact that names a blob needs no `integrity`. The name is the hash.

::: warning One object, one hash
Write several hashes as a list of single-hash objects: `[{ sha1 }, { sha256 }]`.
A single object with two hashes, such as `{ sha1, sha256 }`, is decoded with
only one of them.
:::

## Blobs

A blob is a file the manifest carries, named by the sha256 of its bytes. The
manifest holds only the id. A `Blobs` table says where the bytes are on the
build machine, until they are written into a bundle.

| Export         | Signature                                                 | What it does                                                      |
| -------------- | --------------------------------------------------------- | ----------------------------------------------------------------- |
| `blobId`       | `(bytes: Uint8Array) => string`                           | The id of the blob holding exactly those bytes: their hex sha256. |
| `hashBlobFile` | `(path: string) => Promise<{ id: string; size: number }>` | The id and size of the blob a file on disk would be.              |
| `blobFile`     | `(file: string) => BlobSource`                            | The bytes are in this file.                                       |
| `blobBytes`    | `(bytes: Uint8Array) => BlobSource`                       | The bytes are held in memory, stored as base64.                   |

| Type         | Shape                                                              |
| ------------ | ------------------------------------------------------------------ |
| `BlobSource` | `{ file: string } \| { bytes: string }`, where `bytes` is base64.  |
| `Blobs`      | `Record<string, BlobSource>`, from blob id to where its bytes are. |

```js
const { id, size } = await hashBlobFile('./server.jar');
const blobs = { [id]: blobFile('./server.jar') };
```

## The bundle

A bundle is a zip that holds a manifest and its blobs. The entries are
`opys.json` (the head), `artifacts.json` and `blobs/<sha256>`. `writeBundle`
writes to a temporary file beside `path` and moves it into place, so a failed
write leaves an existing bundle as it was.

| Export           | Signature                                                            | What it does                                                                                                                                                        |
| ---------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `writeBundle`    | `(path: string, manifest: Manifest, blobs?: Blobs) => Promise<void>` | Writes the bundle, with only the blobs the manifest names. Fails if the manifest names a blob that `blobs` does not hold, or one whose bytes do not hash to its id. |
| `readBundle`     | `(path: string) => Manifest`                                         | Reads the whole manifest of a bundle. Fails if the format is not one it reads, or if the manifest names a blob the bundle lacks.                                    |
| `readBundleHead` | `(path: string) => Head`                                             | Reads the head only. The artifact list is left unread.                                                                                                              |
| `BUNDLE_FORMAT`  | `number`                                                             | The bundle format this build reads and writes.                                                                                                                      |

```js
await writeBundle('server.opys', manifest, blobs);
const head = readBundleHead('server.opys'); // format, vars, launch, restrict
```

The layout is in [the bundle format](/reference/bundle-format).

## Vars and interpolation

| Export         | Signature                                                                              | What it does                                                                                                  |
| -------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `valValues`    | `(val: Val) => string[]`                                                               | The strings a `Val` contributes, whichever spelling it was written in. Use this rather than reading `.value`. |
| `resolveVars`  | `(vars: Record<string, string>) => Record<string, string>`                             | Resolves `${ref}` references between vars. Throws on a circular reference.                                    |
| `interpolate`  | `(template: string, vars: Record<string, string>) => string`                           | Substitutes vars into a template.                                                                             |
| `resolvedArgs` | `(launch: Launch, platform: OsOptions, features?: string[]) => string[]`               | A launch's arguments whose rules hold on a platform and feature set.                                          |
| `resolvedEnvs` | `(launch: Launch, platform: OsOptions, features?: string[]) => Record<string, string>` | A launch's environment for a platform and feature set.                                                        |

A `${name}` that is not in the map is left in the text as it was, in both
`resolveVars` and `interpolate`. `\${` writes a literal `${`. `resolvedArgs` and
`resolvedEnvs` apply rules only: the `${...}` references in what they return are
not substituted, so pass each string through `interpolate`. For `resolvedEnvs`,
a var with several arms takes the last one whose rules hold, and a var with no
such arm is left out.

`resolveVars` takes a flat map of strings. A manifest's `vars` may hold
conditional arms instead, and this package has no function that picks an arm
for a platform; the runtime does that when it installs.

| Type        | Shape                                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------- |
| `ValDefs`   | `Record<string, string \| ConditionalVal[]>`. A var is a string, or a list of `{ value, rules? }` arms. |
| `Val`       | `string \| ValObject`                                                                                   |
| `ValObject` | `{ rules?, value: string \| string[] }`                                                                 |
| `Valset`    | `Val[]`                                                                                                 |

## Rules

A rule can be written two ways in a manifest, and both are first-class. The
two names mark the difference.

| Name                           | Where it appears                              | Form                                                                                                       |
| ------------------------------ | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `Rule` / `Ruleset`             | In a manifest. This is how a rule is written. | Shorthand string, such as `'allow.os.linux'`, or the expanded object. A `Ruleset` is one rule or an array. |
| `MojangRule` / `MojangRuleset` | After parsing. The evaluator takes only this. | The expanded object. Re-exported from `@opys/mojang-rules`.                                                |

Shorthand is `allow` or `disallow`, then a dot and one of:

| Form                                 | Meaning                                                                                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `os.<name>` or `os.<name>@<version>` | `<name>` is `linux`, `windows` or `osx`. The text after `@` is the `version` pattern, a regular expression matched anywhere in the platform's version. |
| `features.<name>`                    | The rule requires the named feature to be on. There is no shorthand for off; use `disallow`.                                                           |
| `arch.<arch>`                        | `<arch>` is `x86`, `x86_64`, `arm`, `aarch64` or `any`.                                                                                                |

| Export              | Signature                                                               | What it does                                                                                                                                                                                            |
| ------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parseShortRuleset` | `(raw: Ruleset) => MojangRuleset`                                       | Expands either spelling into the canonical form. Throws on an unknown action or rule type, an unknown OS name or arch, or a missing OS name, feature or arch. An expanded rule passes through as it is. |
| `satisfiesRuleset`  | `(rules: Ruleset, platform: OsOptions, features?: string[]) => boolean` | Evaluates a ruleset. Accepts both spellings. It holds only if every rule in it does, and an empty ruleset holds.                                                                                        |
| `emptyRuleset`      | re-exported                                                             | From `@opys/mojang-rules`.                                                                                                                                                                              |
| `allowOsRuleset`    | re-exported                                                             | From `@opys/mojang-rules`.                                                                                                                                                                              |

`satisfiesRuleset` expands shorthand first, so it is wider than the strict
Mojang predicate. For the strict one, use `@opys/mojang`. The rules are
described in [@opys/mojang-rules](/plugins/mojang-rules).

::: warning Reading an expanded rule
An expanded rule is read as an `os` rule if it fits, then as a `features` rule,
then as a plain `allow` or `disallow`. A rule that has both `os` and `features`
keeps only `os`. A rule whose `os` it cannot read, such as an unknown `name`,
is read as a plain rule and then applies on every platform. Shorthand is not
affected: an unknown OS name in shorthand throws.
:::

```js
const rules = [
  'allow.os.linux',
  { action: 'disallow', features: { demo: true } },
];
satisfiesRuleset(rules, { name: 'linux', version: '', arch: 'x86_64' }); // true
```

## Globs

| Export              | Signature                  | What it does                                                                                                                                                 |
| ------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `globToRegex`       | `(glob: string) => RegExp` | Compiles a glob to a `RegExp` that must match the whole string.                                                                                              |
| `globToRegexSource` | `(glob: string) => string` | The source of that `RegExp`, as a string.                                                                                                                    |
| `globBase`          | `(glob: string) => string` | The longest directory prefix of a glob that has no wildcard in it, without a trailing `/`, or `''` when there is none. Use it as the place to start a sweep. |

The separator is `/`. In a glob:

| Pattern | Matches                                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------------------------ |
| `*`     | Any run of characters except `/`.                                                                                        |
| `?`     | One character except `/`.                                                                                                |
| `**`    | Any characters, `/` included. `**/` at the start, `/**/` in the middle and `/**` at the end also match zero directories. |
| `{a,b}` | Either alternative. The alternatives are literal text, not globs.                                                        |

Every other character, `.` and `[` included, matches itself.

## See also

- [The manifest](/reference/manifest) and [the bundle format](/reference/bundle-format),
  for the format these types describe.
- [@opys/dev](/plugins/dev), which builds these types from a config.
