# Asset layouts

This page is for implementers, and for pack authors who want to know why a
manifest puts assets where it does. It covers the three places Minecraft has
kept its assets (sounds, language files, icons) and which one a given version
reads.

## Three layouts, chosen by the index

A version names an asset index, a JSON document listing every asset object. The
document says how the game looks files up. Nothing else in the version decides
it. Two flags in the document select the old layouts; an index with neither
uses the hashed store. If both are set, `map_to_resources` wins.

| Layout       | Versions        | Index flag               | Where files go                             | What the game is told                                                                                                                   |
| ------------ | --------------- | ------------------------ | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Hashed store | 1.7.3 and later | none                     | `${assets_root}/objects/<ab>/<hash>`       | `--assetsDir ${assets_root}` and `--assetIndex ${assets_index_name}`: the directory holding the store and the index, and the index's id |
| Virtual      | 1.6 to 1.7.2    | `virtual: true`          | `${assets_root}/virtual/<index id>/<name>` | `--assetsDir ${game_assets}`, which is `${assets_root}/virtual/<index id>`                                                              |
| Resources    | before 1.6      | `map_to_resources: true` | `${game_directory}/resources/<name>`       | `--assetsDir ${game_assets}`, which is `${game_directory}/resources`; the game also looks there without being asked                     |

`<ab>` is the first two characters of the hash, and `<name>` is the object's
name in the index, such as `sounds/step/grass1.ogg`. In the `minecraft` plugin
`${game_directory}` is `${root}/`. Mojang's ids for the two old indexes are
`legacy` and `pre-1.6`; the newer ones have ids such as `1.7.4` or `17`.

Every version defines `game_assets`, even ones that never read it. Modern
versions get `${assets_root}` there, so the variable is right for every
version.

## What goes wrong on the wrong layout

A game given the hashed store does not fail to read its assets. It reads
nothing and carries on: the game starts and runs with no sound. The old games
look files up by name, and the hashed names are not names they can find.

## One place per file, pinned in every layout

A file goes to one place. The official launcher keeps the hashed store and
copies files out of it for the old layouts. opys does not: a game on an old
layout never reads the store, so its files are downloaded straight to their
names, and no copy of the store is kept alongside them. Two names with the same
content are two files, each downloaded: the `legacy` index lists 1120 names for
596 distinct hashes.

Every object is pinned by the sha1 that names it, in all three layouts. The
download URL is the same too:
`https://resources.download.minecraft.net/<ab>/<hash>`. A path is only a name,
and nothing in the runtime reads a hash out of one. Without the pin, a
truncated download would be kept.

The asset index document is the same in every layout. It lands at
`${assets_root}/indexes/<index id>.json`, pinned by its own sha1.

## In a manifest

Each object becomes one artifact. Its `path` is the layout's path, with the
variables left in it for the launching machine to fill, and its `metadata`
keeps the object's name so the name is not lost once the file is hashed. A
hashed-store artifact, as the `minecraft` plugin writes it for 1.21.1:

```json
{
  "path": "${assets_root}/objects/22/227ab99bf7c6cf0b2002e0f7957d0ff7e5cb0c96",
  "source": {
    "url": "https://resources.download.minecraft.net/22/227ab99bf7c6cf0b2002e0f7957d0ff7e5cb0c96"
  },
  "size": 7126,
  "integrity": { "sha1": "227ab99bf7c6cf0b2002e0f7957d0ff7e5cb0c96" },
  "metadata": { "name": "minecraft/sounds/step/grass1.ogg" }
}
```

A virtual object has the same `source` and `integrity`, and a different
`path`: `${assets_root}/virtual/legacy/sounds/step/grass1.ogg`. A pre-1.6
object's path is `${game_directory}/resources/newsound/step/grass1.ogg`. The
artifact list is ordered by object name, so two builds of the same version
produce the same list.

In the hashed store, a path is made from the hash, so two names with the same
hash share a path. The build keeps one artifact for them, and the survivor's
`metadata.name` is the later name. The 1.21.1 index has 3911 names and 3888
distinct hashes, which is the 23 artifacts a build of it reports as
deduplicated.

## Where to look in the code

| What                                                 | Where                                                                                          |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| The three layouts and the flags that select them     | `crates/opys-mojang/src/assets.rs` (`AssetLayout`, `AssetManifest::layout`)                    |
| The artifact path for each layout                    | `crates/opys-minecraft-vanilla/src/mappers/assets.rs` (`asset_directory`, `map_asset_objects`) |
| The `game_assets`, `assets_root` and index variables | `crates/opys-minecraft-vanilla/src/vanilla.rs`                                                 |
| The tests that pin each layout                       | `crates/opys-minecraft-vanilla/tests/mappers.rs`                                               |
