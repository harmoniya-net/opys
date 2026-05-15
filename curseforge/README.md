# @torba/curseforge

Resolve CurseForge file IDs into torba `Artifact`s. Calls the CurseForge v1
bulk API to look up each file and emits one artifact per entry with the
download URL, size, and sha1.

## Install

```sh
npm install @torba/curseforge @torba/core zod
```

## Usage

```ts
import { resolveCurseforge } from '@torba/curseforge';

const mods = await resolveCurseforge(
  {
    path: (info) => '${root}/mods/' + info.filename,
    token: process.env.CURSEFORGE_API_KEY!, // https://console.curseforge.com/#/api-keys
  },
  [
    6307712,
    'https://www.curseforge.com/minecraft/mc-mods/botania/files/2283837',
  ],
);

// mods is Artifact[] — drop it straight into your manifest.artifacts list
```

Files share a single install path per call — call `resolveCurseforge`
multiple times for different destinations (mods, resourcepacks,
shaderpacks, …) and concat the artifacts into your manifest.

The first argument accepts either raw numeric file IDs or the file's
CurseForge URL (anything containing `/files/<id>`). URLs are convenient
for self-documenting configs — paste the link from the mod's CurseForge
"Files" page and let torba parse the ID at build time.

The `path` callback receives:

```ts
interface CurseForgeFileInfo {
  filename: string; // original filename on CurseForge
  fileId: number;
  projectId: number;
  size: number; // bytes
}
```

Returned strings may include torba install-time vars (`${root}`,
`${library_directory}`, …) — they get interpolated during install, not here.
In a JS template literal you must escape `$` as `\$` to keep the placeholder
literal, so straight string concatenation (as above) is often easiest.

## From a CurseForge modpack zip

If you have an existing modpack with a `manifest.json` inside, use the parser
helper to bridge:

```ts
import { readFile } from 'node:fs/promises';
import { resolveCurseforge, parseCurseForgeManifest } from '@torba/curseforge';

const m = parseCurseForgeManifest(
  JSON.parse(await readFile('./manifest.json', 'utf-8')),
);
const mods = await resolveCurseforge(
  {
    path: (info) => '${root}/mods/' + info.filename,
    token: process.env.CURSEFORGE_API_KEY!,
  },
  m.files.map((f) => f.fileID),
);
```

## Notes

- File metadata is fetched in batches via `POST /v1/mods/files`.
- When CurseForge omits `downloadUrl` (third-party distribution disabled by
  the author), the URL falls back to `edge.forgecdn.net` using the file id and
  filename returned by the API.
- The API key is consumed only at build time. The artifact URLs are public CDN
  links, so end users running `torba launch` do not need a key.
