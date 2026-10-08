# Errors

This page covers the errors `@opys/runtime` throws, what each one tells you,
and what a launcher should do about it. It is for a launcher developer
handling the rejection of `install`, `prepare` or `launch`. For the progress
events that come before a failure, see [Progress](./progress).

Every failure the runtime names is a `RuntimeError`. Three kinds have fields
of their own, and they are subclasses. Branch on `code`, and read the fields
only after you have confirmed the kind.

::: warning Do not parse the message
The `message` is English text written for people reading a log. Its wording
can change in any release. Nothing should match on it, and nothing in
`@opys/runtime` does. Use `code`, the class, and the fields.
:::

## RuntimeError

```ts
class RuntimeError extends Error {
  readonly code: RuntimeErrorCode;
  // message, name ('RuntimeError'), and cause as for any Error
}

type RuntimeErrorCode =
  | 'network'
  | 'integrity'
  | 'extraction'
  | 'manifest'
  | 'io'
  | 'cancelled'
  | 'other';
```

The subclasses below extend `RuntimeError`, so `instanceof RuntimeError` is
true for each of them and `err.code` is always set.

## Subclasses

| Class             | `code`       | Fields                  |
| ----------------- | ------------ | ----------------------- |
| `NetworkError`    | `network`    | `url`, `status`, `body` |
| `IntegrityError`  | `integrity`  | `paths`                 |
| `ExtractionError` | `extraction` | `artifactPath`, `cause` |

- **`NetworkError`**: `url` is the address that was requested. `status` is
  the HTTP status the server returned, and `0` when there was no response at
  all, such as a refused connection or a transfer that broke off part way.
  `body` is what the server sent back, when it sent anything, and is an empty
  string otherwise. For a transfer that broke off, `body` holds the transport's
  description of the failure.
- **`IntegrityError`**: `paths` lists the files whose contents did not match
  the hash the manifest pins. The paths are the final paths on disk, with
  variables already filled in. Several files can fail in one install, and all
  of them are listed.
- **`ExtractionError`**: `artifactPath` is the archive that could not be
  unpacked, exactly as the manifest spells it, so variables such as
  `${root}` are not filled in. `cause` is an ordinary `Error` whose message
  says why, for example that the archive is not a valid zip or that the target
  is not a directory. Read `err.cause.message`; in TypeScript `cause` is typed
  `unknown`, so narrow it to an `Error` first.

Only these three carry fields of their own. The other codes are plain
`RuntimeError`s, including `io`; see the notes under the table below.

## Codes

| `code`       | Class             | Meaning                                                                                                                               | What the launcher should do                                                                                                                                                                                                                                                                                                                   |
| ------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `network`    | `NetworkError`    | A download failed: the server refused it, or the connection failed or broke off                                                       | **Retry later.** The runtime has already tried each file four times, waiting 0.5, 2 and 8 seconds between attempts, so the error arrives about ten seconds after the first failure. Wait longer before the next try. A `404` or `410` means the server no longer has the file the manifest names: **rebuild** the bundle instead of retrying. |
| `integrity`  | `IntegrityError`  | A file that was downloaded or copied does not match the hash the manifest pins                                                        | **Retry once**, since a damaged transfer will often succeed on a second try. If it fails again, the server is serving other bytes than the build pinned: **rebuild**.                                                                                                                                                                         |
| `extraction` | `ExtractionError` | An archive could not be unpacked                                                                                                      | **Read `cause`.** If the archive is damaged, **rebuild**. If the cause is the file system, such as no space or no permission, treat it like `io`.                                                                                                                                                                                             |
| `manifest`   | `RuntimeError`    | The manifest, or the bundle it came in, could not be read, or it names a blob that nothing holds                                      | **Rebuild**, or ask for a newer launcher if the bundle is in a format this one does not know. Retrying will not help.                                                                                                                                                                                                                         |
| `io`         | `RuntimeError`    | The file system refused something: no space, no permission, a bad path, a bundle file that is not there                               | **Tell the player**, with the reason from the message for them to read. Retry once they have fixed the cause.                                                                                                                                                                                                                                 |
| `cancelled`  | `RuntimeError`    | The install was cancelled                                                                                                             | **Stop**, without treating it as a failure. See the note below.                                                                                                                                                                                                                                                                               |
| `other`      | `RuntimeError`    | Anything the runtime does not classify, such as a circular variable reference, or a launch asked of a manifest with no `launch` block | **Log it and tell the player.** Do not retry automatically; a retry is unlikely to change the result.                                                                                                                                                                                                                                         |

::: tip Which action
"Retry" means the same request again, possibly after a wait. "Rebuild" means
the manifest itself is out of date or wrong, so retrying the same bundle
cannot succeed. A launcher that only retries will loop on a rebuild case, so
decide which of the two applies before you schedule anything.
:::

### Notes on the table

- **`io` has no fields.** The runtime's report carries the path that failed,
  but `@opys/runtime` does not pass it on, so the path is only in the message.
  Show the message as it is, and do not try to parse it for the path.
- **`cancelled` cannot happen through `@opys/runtime` today.** The runtime can
  be given a cancellation token, but the options `install`, `prepare` and
  `launch` accept do not include one, so these functions never produce this
  code. It is listed so that a launcher can handle it when cancellation is
  added.
- **`other` covers a circular variable reference.** A variable whose value
  refers back to itself, through other variables, arrives as `other`. The
  fix is in the manifest, so rebuild it. `prepare`, `buildLaunch` and `launch`
  also report `other` for a manifest that has no `launch` block, and `prepare`
  and `launch` do so before anything is installed.

## Errors that are not RuntimeError

Not every rejection is a `RuntimeError`. Two cases come through as ordinary
errors:

- **Bad arguments** are refused before the runtime runs, for example a source
  that is neither a bundle, a URL, nor a manifest, or an option of the wrong
  type. These arrive as a plain `Error` thrown by the binding. Its `code`
  property holds a binding code such as `InvalidArg`, not one of the codes
  above, so test `instanceof RuntimeError` and not the `code` alone.
- **A program that cannot be started** is not an install error. `launch`
  spawns the process after the install has finished, and Node reports a
  program that cannot be run, such as a Java binary that is not there, as an
  `error` event on the child rather than as a rejection. Listen for it, since
  Node throws an `error` event that nothing handles:

```js
child.on('error', (err) => {
  // Node's error for spawn, for example ENOENT. Not a RuntimeError.
});
```

## Handling a failure

This example handles an install and lets anything that is not a runtime
error through unchanged. It reads each subclass's fields only after an
`instanceof` check, which is what makes the fields safe to read.

```js
import {
  install,
  RuntimeError,
  NetworkError,
  IntegrityError,
  ExtractionError,
} from '@opys/runtime';

async function installOnce(source, options) {
  try {
    await install(source, options);
    return { ok: true };
  } catch (err) {
    if (!(err instanceof RuntimeError)) throw err; // not ours: rethrow

    switch (err.code) {
      case 'network':
        if (err instanceof NetworkError) {
          if (err.status === 404 || err.status === 410) {
            return { ok: false, action: 'rebuild', url: err.url };
          }
        }
        return { ok: false, action: 'retry-later' };

      case 'integrity':
        if (err instanceof IntegrityError) {
          return { ok: false, action: 'retry-once', paths: err.paths };
        }
        return { ok: false, action: 'retry-once' };

      case 'extraction':
        if (err instanceof ExtractionError) {
          console.error(`${err.artifactPath}: ${err.cause.message}`);
        }
        // A damaged archive is a rebuild. If the cause says the disk is full
        // or a directory is not writable, it is the player's to fix instead.
        return { ok: false, action: 'rebuild' };

      case 'manifest':
        return { ok: false, action: 'rebuild' };

      case 'io':
        return { ok: false, action: 'tell-player', message: err.message };

      case 'cancelled':
        return { ok: false, action: 'stop' };

      default:
        // 'other', and any code added later
        console.error(err);
        return { ok: false, action: 'tell-player', message: err.message };
    }
  }
}
```

The `default` branch matters. A code this page does not list, added in a later
release, falls through to it rather than being mistaken for a known case.

Under `launch`, the same rejections come from the call itself, since `launch`
installs before it spawns. Wrap the call in the same way.

## Related

- [Progress](./progress): the events an install reports before it fails.
- [Install and launch](./embedding): the calls these errors come from.
