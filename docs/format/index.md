# The format

The format is what a bundle contains: the **manifest**. This section
describes every element of it, one page each.

You meet it in two places:

- **In a config.** `manifest.artifacts`, `manifest.vars`, `cleanup` and
  `rules` are written in exactly this format.
- **In a bundle.** If you write your own reader or installer, this is what
  you parse.

## A whole manifest

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
  },
  "cleanup": [{ "includes": ["${root}/mods/*.jar"] }]
}
```

## The elements

Two building blocks come first, because everything else uses them:

| Element   | What it is                                         | Page                     |
| --------- | -------------------------------------------------- | ------------------------ |
| Variables | Named values, and `${…}` inside almost any string. | [Variables](./variables) |
| Rules     | "Only on Windows", "only with this feature on".    | [Rules](./rules)         |

Then the parts of a manifest:

| Field       | What it is                       | Page                     |
| ----------- | -------------------------------- | ------------------------ |
| `artifacts` | The files to install.            | [Artifacts](./artifacts) |
| `launch`    | How to start the game.           | [Launch](./launch)       |
| `cleanup`   | What to delete after installing. | [Cleanup](./cleanup)     |

The pages are in reading order.

Every field is optional. A manifest with no `launch` can be installed but
not launched.

The format has a version, `1`. It is not a field of the manifest: the
[bundle](./bundle) says it, beside the manifest.

## The one rule

A manifest is **fully resolved**. Every file has one exact source and,
wherever one exists, a hash. Nothing says "latest".

So an installer decides nothing. If yours has to look something up, the
fault is in whatever built the manifest.

## What an installer does

In this order:

1. Works out the [variables](./variables) for this machine.
2. Checks the [cleanup](./cleanup) rules, and stops if one is unsafe.
3. Keeps the [artifacts](./artifacts) whose [rules](./rules) pass.
4. Skips files already on disk with the right hash. Downloads the rest.
5. Verifies what it downloaded.
6. Unpacks the artifacts that have `extract`.
7. Deletes what `cleanup` names.

## Stability

The format is the stable part of opys. Packages, plugin options and CLI
flags may change. The format changes only on purpose, and the `format`
number goes up when it does.

`@opys/core` is the reference implementation of the manifest
(`decodeManifest`), and `@opys/bundle` of the file it is stored in
(`readBundle`, `writeBundle`).
