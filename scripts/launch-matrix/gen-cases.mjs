// Writes cases.json — the key set — cases.full.json, which adds every
// Minecraft version the Forge and NeoForge indexes publish, and
// cases.slice.json, the handful the workflow launches by default.
import fs from 'node:fs';
const idx = async (l) =>
  Object.keys(
    (
      await (
        await fetch(`https://harmoniya-net.github.io/metadata/${l}/index.json`)
      ).json()
    ).versions,
  );
const java = (mc) => {
  if (/^2\d[.w-]/.test(mc) && !mc.startsWith('25w')) return 25;
  if (mc.startsWith('25w')) return 21;
  const [, minor, patch = 0] = mc.split('.').map(Number);
  if (minor < 17) return 8;
  if (minor < 20 || (minor === 20 && patch < 5)) return 17;
  return 21;
};
const c = (loader, version, extra = {}) => ({
  loader,
  version,
  java: java(version),
  ...extra,
});
const first = [
  c('minecraft', '1.20.1'),
  c('minecraft', '1.12.2'),
  c('forge', '1.20.1'),
  c('neoforge', '1.21.1'),
  c('fabric', '1.21.4'),
  c('cleanroom', '1.12.2', { java: 25 }),
  c('lwjgl3ify', '1.7.10', { java: 25 }),
  c('forge', '1.7.10'),
  c('forge', '1.12.2'),
  c('forge', '1.4.7'),
  c('forge', '1.5.2'),
  c('forge', '1.6.4'),
  c('forge', '1.16.5'),
  c('forge', '1.18.2'),
  c('forge', '1.21.1'),
  c('forge', '26.3'),
  c('neoforge', '1.20.4'),
  c('neoforge', '26.3'),
  c('minecraft', '26.3'),
  c('minecraft', '1.21.11'),
  c('minecraft', '1.16.5'),
  c('minecraft', '1.8.9'),
  c('minecraft', '1.7.10'),
  c('minecraft', '1.6.4'),
  c('minecraft', '1.5.2'),
  c('minecraft', '1.2.5'),
  c('minecraft', '1.0'),
  c('minecraft', '1.13.2'),
  c('minecraft', '1.14.4'),
  c('minecraft', '1.17.1'),
  c('minecraft', '1.19.4'),
  c('fabric', '1.14.4'),
  c('fabric', '1.16.5'),
  c('fabric', '1.18.2'),
  c('fabric', '1.20.1'),
  c('fabric', '26.3'),
  c('minecraft', '1.20.1', { vendor: 'zulu' }),
  c('minecraft', '1.20.1', { vendor: 'graalvm' }),
  c('minecraft', '1.8.9', { vendor: 'zulu' }),
];
const rest = [
  ...(await idx('forge')).reverse().map((v) => c('forge', v)),
  ...(await idx('neoforge')).reverse().map((v) => c('neoforge', v)),
];
const unique = (list) => {
  const seen = new Set();
  return list.filter((x) => {
    const k = JSON.stringify(x);
    return seen.has(k) ? false : seen.add(k);
  });
};
// Builds that cannot start on a current Java 8, pinned to one they can: Forge
// 1.7.2 predates Java 8 altogether, and Forge for 1.16.4 reads
// a JDK internal that 8u321 changed. Both are upstream's, and both pass like this.
const pinned = (x) => {
  if (x.loader !== 'forge') return x;
  if (x.version === '1.7.2') return { ...x, java: 7, vendor: 'zulu' };
  if (x.version === '1.16.4') return { ...x, java: '8u312-b07' };
  return x;
};
const write = (name, list) =>
  fs.writeFileSync(
    new URL(name, import.meta.url),
    JSON.stringify(unique(list.map(pinned)), null, 1) + '\n',
  );
// What the workflow launches by default: the versions people actually play, on Forge,
// and whatever is newest on every loader. "Newest" is the last Minecraft
// version a loader's own index lists rather than Mojang's latest release — a
// loader is days behind a release, and a case that cannot resolve would fail
// the run for a reason that is nobody's fault.
const newest = async (l) => (await idx(l)).at(-1);
const fabricNewest = (
  await (await fetch('https://meta.fabricmc.net/v2/versions/game')).json()
).find((v) => v.stable).version;
const slice = [
  ...[
    '1.7.10',
    '1.12.2',
    '1.16.5',
    '1.20.1',
    '1.21.1',
    await newest('forge'),
  ].map((v) => c('forge', v)),
  // Two builds that each lean on a JDK internal no other does (horno's
  // README, "JDK internals"): they are the first to break on a new Java.
  c('forge', '1.20.2'),
  c('forge', '26.1'),
  c('neoforge', '1.21.1'),
  c('neoforge', await newest('neoforge')),
  c('fabric', fabricNewest),
  c('minecraft', fabricNewest),
];
write('./cases.slice.json', slice);
write('./cases.json', first);
write('./cases.full.json', [...first, ...rest]);
console.log(
  first.length,
  'key cases,',
  unique([...first, ...rest].map(pinned)).length,
  'in full',
);
