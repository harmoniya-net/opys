# Progress

This page covers what `@opys/runtime` reports while it installs: the phases an
install goes through, every event it emits, and how to turn those events into
a progress bar and an ETA. It is for a launcher developer who has already
called `install`, `prepare` or `launch` from [Install and launch](./embedding).

Every install is one callback. Pass `onProgress` in the options, and the
runtime calls it with an `InstallProgress` object for each step. There is no
event emitter to attach to and nothing to subscribe to separately.

```js
import { install } from '@opys/runtime';

await install(
  { bundle: 'game.opys' },
  {
    vars: { root: '/srv/minecraft' },
    onProgress(p) {
      console.log(p.phase);
    },
  },
);
```

`prepare` and `launch` take the same callback, inside their `install` option:

```js
import { launch } from '@opys/runtime';

const child = await launch(
  { bundle: 'game.opys' },
  {
    vars: { root: '/srv/minecraft' },
    install: { onProgress: (p) => console.log(p.phase) },
  },
);
```

`buildLaunch`, and any call with `install: false`, installs nothing and emits
nothing.

## Phases

An install runs six phases in this order. Five of them report with events.
`scan` reports nothing, and `fetch` is reported as the `download` events, not
as an event named `fetch`:

| Phase     | What happens                                                                                                             | Event                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| `resolve` | The source is opened, or downloaded whole, and its manifest read                                                         | `resolve`                              |
| `scan`    | Files already on disk are hashed; present and matching are kept                                                          | none                                   |
| `fetch`   | Missing or wrong files are downloaded, or copied out of the bundle if they are blobs, largest first                      | `download` and the `download:*` events |
| `verify`  | Each file fetched in this run is hashed against its pin                                                                  | `verify`                               |
| `extract` | Archives with an extract rule are unpacked                                                                               | `extract`                              |
| `sweep`   | Files matching the manifest's `restrict` patterns that it does not list, and empty directories beneath them, are removed | `sweep`                                |

`scan` emits nothing, so on a large installation that is already mostly
present there is a pause after `resolve` while the files are hashed. Expect
that pause before the first `download` event, not a stall.

`verify` runs only when integrity checking is on, which it is unless you pass
`verifyIntegrity: false`. It checks the files `fetch` just wrote; a file that
`scan` kept has already been hashed. The `verify` event is sent even when
nothing was fetched. `extract` runs only when the manifest has an archive to
unpack, and it unpacks every such archive on every install, whether or not it
was downloaded this time. `sweep` is sent only when something was removed.

## Events

Each event is an object whose `phase` names it. The fields below are the
whole of each event; read only the fields listed for the phase you are
handling.

| `phase`          | Fields                                               | Emitted                                                                    |
| ---------------- | ---------------------------------------------------- | -------------------------------------------------------------------------- |
| `resolve`        | none                                                 | Once, first, before the source is opened                                   |
| `download`       | `fetched`, `total`, `skipped`, `bytes`, `totalBytes` | Once after `scan` with `fetched: 0`, then once each time a file finishes   |
| `download:start` | `path`, `totalBytes`                                 | When a file's download begins                                              |
| `download:bytes` | `path`, `bytes`                                      | As data arrives for a file                                                 |
| `download:done`  | `path`                                               | When a file is in its final place                                          |
| `verify`         | none                                                 | Once, after every download has finished                                    |
| `extract`        | `count`                                              | Once, before the archives are unpacked; `count` is how many                |
| `sweep`          | `removed`                                            | Once, if anything was removed; `removed` is how many files and directories |

The types live in `InstallProgress`, exported from `@opys/runtime`.

In the three `download:*` events, `path` is the artifact's path as the
manifest spells it, so a variable such as `${root}` is not filled in. Use it
as a key to tell files apart. To show a name, take its last segment.

### `download`

This is the event to build a progress bar from. Its fields mean:

- `fetched` and `total` count files. `total` is the files that have to be
  downloaded this run. A file that is already present and matches its hash
  is not in `total`; it is counted in `skipped`.
- `bytes` is the sum of the declared sizes of the files that have finished.
  It is not a count of bytes read from the network.
- `totalBytes` is the sum of the declared sizes of the files in `total`. A
  file the manifest gives no size is in the count but adds nothing here, so
  `totalBytes` is short by the size of such files. When `totalBytes` is `0`,
  no file in the run has a size and you have to fall back to counting files.

`download` is emitted after `download:done` for the same file, so when you
see a `download` event, the file it is counting has already been reported as
done.

### `download:start`

Emitted once per file, when the runtime begins to download it. `totalBytes`
is the size the manifest declares for that file, or `0` when the manifest
gives none. It is not emitted again if the runtime retries the file after a
failure.

### `download:bytes`

Emitted as data arrives. `bytes` is the number of bytes of this file received
so far in the current attempt. It is not a running total across files.

Two things to know about it:

- The Node binding drops `download:bytes` events so that at most one is sent
  every 50 ms, across all files. You will see fewer of these than the number
  of chunks received, and the last one for a file may not arrive. Do not rely
  on it for the final number; `download:done` and the next `download` event
  are the reliable record.
- A file that fails and is retried starts again from zero. Its `bytes` go back
  down. Keep the latest value for each path rather than adding them up.

A blob, a file that is carried inside the bundle, is copied rather than
downloaded. Its `download:bytes` event, when it is not dropped by the limit
above, comes once and carries the full size.

### `download:done`

Emitted when a file is complete and in its final place. Clear the file from
whatever you show as in progress.

### `verify`, `extract`, `sweep`

These mark the later phases. `verify` has no fields. `extract` tells you how
many archives are about to be unpacked, which is the right number to show
("Extracting 3 archives"). `sweep` tells you how many stale files and empty
directories were removed.

## A progress bar and an ETA

The example below keeps a record of what is downloading and computes the
share of the install that is done and how long is left. It counts in bytes
when the manifest gives sizes and in files when it does not, which is the
same choice the CLI makes.

Create the tracker before the install starts, so its clock covers the whole
run:

```js
import { install } from '@opys/runtime';

export function trackProgress() {
  const t0 = Date.now();
  let last = null; // the latest `download` event
  const inFlight = new Map(); // path -> { bytes, total } for files that started

  function onProgress(p) {
    switch (p.phase) {
      case 'download':
        last = p;
        break;
      case 'download:start':
        inFlight.set(p.path, { bytes: 0, total: p.totalBytes });
        break;
      case 'download:bytes': {
        const f = inFlight.get(p.path);
        if (f) f.bytes = p.bytes;
        break;
      }
      case 'download:done':
        inFlight.delete(p.path);
        break;
    }
  }

  function snapshot() {
    if (last === null) return null;

    const sized = last.totalBytes > 0;
    // Only files with a declared size count toward bytes. A file with no size
    // is not in `totalBytes`, so adding its bytes would push the share past
    // what the denominator allows.
    let flying = 0;
    for (const f of inFlight.values()) {
      if (f.total > 0) flying += f.bytes;
    }
    const done = sized
      ? Math.min(last.bytes + flying, last.totalBytes)
      : last.fetched;
    const all = sized ? last.totalBytes : last.total;

    const pct = all === 0 ? 1 : done / all;
    const seconds = (Date.now() - t0) / 1000;
    const rate = seconds > 0 ? done / seconds : 0; // bytes/s, or files/s
    const etaSeconds = rate > 0 ? (all - done) / rate : null;

    return { pct, done, all, sized, etaSeconds };
  }

  return { onProgress, snapshot };
}
```

Then pass its callback to an install and poll the snapshot once a second:

```js
const progress = trackProgress();

const timer = setInterval(() => {
  const s = progress.snapshot();
  if (s === null) return;
  const unit = s.sized ? 'bytes' : 'files';
  const eta =
    s.etaSeconds === null ? 'unknown' : `${Math.round(s.etaSeconds)} s`;
  process.stderr.write(
    `\r${(s.pct * 100).toFixed(1)}%  ${s.done}/${s.all} ${unit}  eta ${eta}   `,
  );
}, 1000);

try {
  await install(
    { bundle: 'game.opys' },
    { vars: { root: '/srv/minecraft' }, onProgress: progress.onProgress },
  );
} finally {
  clearInterval(timer);
}
process.stderr.write('\n');
```

A few points about the arithmetic:

- `done` is the finished bytes from `download` plus the bytes of the files in
  flight. Adding the in-flight bytes is what keeps the bar moving during a
  large file, instead of sitting still until the file finishes.
- The rate is measured from the start of the run, so it includes the time
  spent resolving and scanning. Early on, the rate is lower than the download
  speed itself.
- Files already present are not in `all`, so the percentage is the share of
  the work this run has to do. The runtime does not report the sizes of
  skipped files, so the share of the whole installation is available only by
  count: `(fetched + skipped) / (total + skipped)`.
- The ETA is `(all - done) / rate`. It is unknown until something has been
  downloaded.

## How the CLI does it

The `opys` command draws this same bar from the same events, so it shows what
the example above computes in a terminal:

- It measures in bytes when `totalBytes` is greater than zero, and in files
  otherwise.
- It adds the bytes of in-flight files to the finished total, capped at
  `totalBytes`. Unlike the example, it adds every in-flight file, including
  ones with no declared size.
- It shows an ETA only while `fetched < total`, and drops the ETA when the
  remaining time is under one second.
- It redraws at most every 80 ms. On a terminal it redraws in place; when
  output is not a terminal it writes one line every 3 seconds.

It draws one line per file in flight from `download:start`, `download:bytes`
and `download:done`, and writes a line for each `download:done`, a
`Verifying...` line for `verify`, `Extracting N archives...` for `extract` and
`Swept N stale files` for `sweep`.

::: tip Keep the callback quick
The callback runs on the JavaScript thread while the install continues.
Record what you need and return. Redraw on a timer, as above, rather than on
every event; `download:bytes` in particular can arrive up to twenty times a
second.
:::

The resolved promise is the signal that an install has finished, not the last
event: events are delivered asynchronously and one may still arrive after it.

## When an install fails

A failed install rejects its promise, with a `RuntimeError` unless an argument
was refused up front, and the progress events stop at the point of failure.
What each error means and what to do about it is on [Errors](./errors).
