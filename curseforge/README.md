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
import { curseforge } from '@torba/curseforge';

const cf = await curseforge({
  key: process.env.CURSEFORGE_API_KEY!, // https://console.curseforge.com/#/api-keys
  files: [
    { fileId: 6307712, path: (info) => '${root}/mods/' + info.filename },
    { fileId: 5678901, path: (info) => '${root}/mods/' + info.filename },
    {
      fileId: 1234567,
      path: (info) => '${root}/resourcepacks/' + info.filename,
    },
  ],
});

cf.artifacts; // Artifact[] — one per file, in input order
```

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
import { curseforge, parseCurseForgeManifest } from '@torba/curseforge';

const m = parseCurseForgeManifest(
  JSON.parse(await readFile('./manifest.json', 'utf-8')),
);
const cf = await curseforge({
  key: process.env.CURSEFORGE_API_KEY!,
  files: m.files.map((f) => ({
    fileId: f.fileID,
    path: (info) => '${root}/mods/' + info.filename,
  })),
});
```

## Notes

- File metadata is fetched in batches via `POST /v1/mods/files`.
- When CurseForge omits `downloadUrl` (third-party distribution disabled by
  the author), the URL falls back to `edge.forgecdn.net` using the file id and
  filename returned by the API.
- The API key is consumed only at build time. The artifact URLs are public CDN
  links, so end users running `torba launch` do not need a key.
