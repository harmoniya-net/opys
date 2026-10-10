# The bundle file

A bundle is how a manifest is stored: a zip with a fixed layout. This page
is that layout, for anyone reading or writing one without opys.

For what a bundle is _for_, see [The bundle](/basics/bundle).

## Entries

| Entry            | Contains                                         |
| ---------------- | ------------------------------------------------ |
| `opys.json`      | The **head**: what the bundle says about itself. |
| `manifest.json`  | The [manifest](./), whole.                       |
| `blobs/<sha256>` | One entry per carried file.                      |

```sh
unzip -l game.opys
unzip -p game.opys opys.json
unzip -p game.opys manifest.json | jq '.launch'
```

**Why two JSON files:** they describe different things. The manifest
describes the installation, and is megabytes, one entry per installed file.
The head describes the bundle, and is small. It holds `format` and
`options`.

Find entries by name. Do not rely on their order.

## format

```json
{ "format": 1 }
```

The version of the format, in the head. It is `1`.

A reader must:

- Read `format` **first**.
- Refuse the bundle if it is not the integer `1`. Missing, `"1"` and `1.0`
  are all refused.
- Do so before reading `manifest.json`.

**Why first:** another format may spell the manifest differently. A reader
that guesses could install the wrong thing.

A reader ignores any other field of the head.

**Any other number is refused**, a lower one as much as a higher. opys reads
one format. There is no migration and no compatibility mode. When the
format changes, a bundle is rebuilt from its config with `opys build`.

For a launcher this means: update the runtime and republish the bundles
together.

## options

What whoever launches the bundle may choose. Optional, in the head.

```json
{
  "format": 1,
  "options": [
    {
      "slider": "xmx",
      "title": "RAM",
      "min": 1024,
      "max": 16384,
      "step": 512,
      "default": 4096,
      "unit": "MB"
    },
    {
      "feature": "custom_java",
      "title": "Custom Java",
      "options": [{ "directory": "java_home", "title": "Java folder" }]
    }
  ]
}
```

A manifest reads variables and tests features. `options` says which of them
are a player's to set, and how to ask for each. It is a schema only: the
installer does not read it, and what a player chose reaches an install as
plain `vars` and `features`.

An option is one of six kinds. The field that says the kind also holds the
name:

| Field       | The name is | The value is            |
| ----------- | ----------- | ----------------------- |
| `slider`    | a variable  | a number in a range     |
| `select`    | a variable  | one of a list           |
| `text`      | a variable  | a line of text          |
| `file`      | a variable  | the path of a file      |
| `directory` | a variable  | the path of a directory |
| `feature`   | a feature   | on or off               |

Every option has a `title` and may have a `subtitle`. The rest depends on
the kind:

| Kind      | Required                        | Optional                 |
| --------- | ------------------------------- | ------------------------ |
| `slider`  | `min`, `max`, `step`, `default` | `unit`                   |
| `select`  | `choices`, `default`            |                          |
| `text`    |                                 | `placeholder`, `default` |
| `feature` |                                 | `default`, `options`     |

- `default` is a number on a slider, a string on a select or a text, and a
  boolean on a feature. A feature with no `default` is off.
- `choices` is a list of `{ "value", "label" }`, in the order to show them.
- A feature's `options` are the options that only matter while it is on.
  They may be features themselves, to any depth.

A reader refuses a head whose options:

- name no kind, or more than one;
- carry a field of another kind, such as `min` on a select;
- name one variable twice, or one feature twice, anywhere in the tree;
- have a slider with `min` not below `max`, a `step` not above zero, or a
  `default` outside the range;
- have a select whose `default` is not the `value` of one of its choices.

**Why in the head:** a launcher shows the settings before it installs
anything, and the head is readable without the manifest.

## Blobs

A blob is a file carried in the bundle. An artifact names it by the sha256
of its content:

```json
{
  "path": "${game_directory}/config/pack.toml",
  "source": { "blob": "f727f7b2…" }
}
```

Its bytes are the entry `blobs/f727f7b2…`. The id is 64 lowercase hex
digits.

A reader must:

- Refuse a bundle that names a blob it does not contain, **before
  installing anything**.
- Check each blob against its name when installing it.

A writer must not store bytes under a name they do not hash to. The same
blob used by two artifacts is stored once.

## What opys writes

These are how the reference writer behaves. A reader should not depend on
them.

- `opys.json` first and uncompressed, so it can be read from the front of
  the file. The rest is deflated.
- Blobs in order of their id.
- Fixed timestamps, so the same manifest always gives the same entries.
- No other entries. A reader ignores any it does not know.

## Reading one

```text
open the zip
head = json(entry "opys.json")
if head.format != 1: refuse
manifest = json(entry "manifest.json")
for each artifact with source.blob:
    if no entry "blobs/" + id: refuse
```

Then, when installing an artifact with a blob: copy the entry to its
`path`, and refuse it if its sha256 is not the id.

## The file name

By convention `<name>.opys`. Nothing in the format depends on it.
