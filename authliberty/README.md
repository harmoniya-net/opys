# @torba/authliberty

[AuthLiberty](https://gitlab.com/harmoniya/authliberty) support for torba — runs Minecraft against a custom Yggdrasil-compatible backend by attaching AuthLiberty as a JVM `-javaagent`.

AuthLiberty is a Java agent that retargets Mojang's `authlib` at load time: it rewrites the auth/account/session/services hosts and disables the texture domain whitelist + property signature checks. Useful for self-hosted skin/auth servers (e.g. Ely.by, drasl, custom infrastructure) without redistributing a patched authlib.

## Install

```sh
npm install @torba/authliberty @torba/core zod
```

## Usage

Compose with any `@torba/{minecraft,forge,cleanroom,lwjgl3ify}` template. AuthLiberty has no main class and no classpath needs — it's purely additive JVM args + one agent jar.

```ts
import { resolveAuthliberty } from '@torba/authliberty';
import { resolveLwjgl3ify } from '@torba/lwjgl3ify';

const lw = await resolveLwjgl3ify({ version: '3.0.16' });
const al = await resolveAuthliberty({
  version: '0.3',
  hosts: {
    auth: 'https://auth.example.com',
    account: 'https://account.example.com',
    session: 'https://session.example.com',
    services: 'https://services.example.com',
  },
});

return {
  manifest: {
    artifacts: [lw.artifacts, al.artifacts],
    vars: lw.vars,
    launch: {
      ...lw.launch,
      // Interleave AuthLiberty's JVM args between the loader's JVM args and
      // the main class so the agent transforms authlib classes before any
      // loader code touches them.
      args: [...lw.jvmArgs, ...al.jvmArgs, lw.mainClass, ...lw.gameArgs],
    },
  },
};
```

### Version input

- **Exact version** — `'0.3'` (a tagged release).
- **`'latest'`** — the auto-updated `main` build. The current sha256 is captured at template-build time and frozen into the manifest; re-run torba to refresh.

### Hosts

`hosts` accepts either an object or a function `(server) => url | undefined`. Unset / empty / `undefined` results fall back to the original Mojang URL at runtime, so you only need to specify the servers you actually want to retarget.

```ts
// Object form
resolveAuthliberty({
  version: '0.3',
  hosts: {
    auth: 'https://auth.example.com',
    session: 'https://session.example.com',
  },
});

// Function form — handy when all four point at one base
const base = 'https://yggdrasil.example.com';
resolveAuthliberty({ version: '0.3', hosts: (server) => `${base}/${server}` });
```

| Server     | System property               | Mojang default                      |
| ---------- | ----------------------------- | ----------------------------------- |
| `auth`     | `minecraft.api.auth.host`     | `https://authserver.mojang.com`     |
| `account`  | `minecraft.api.account.host`  | `https://account.mojang.com`        |
| `session`  | `minecraft.api.session.host`  | `https://sessionserver.mojang.com`  |
| `services` | `minecraft.api.services.host` | `https://api.minecraftservices.com` |

### Options

```ts
resolveAuthliberty({
  version: string,
  project?: string,  // default: 'harmoniya/authliberty'
  gitlab?: string,   // default: 'https://gitlab.com'
  token?: string,    // optional GitLab PRIVATE-TOKEN
  hosts?: { auth?, account?, session?, services? }
        | ((server: 'auth' | 'account' | 'session' | 'services') => string | undefined),
});
```

## How it works

1. Resolves the requested `version` against GitLab's generic packages registry (`/api/v4/projects/<project>/packages?package_type=generic&package_name=authliberty`).
2. Picks the package's `.jar` file, reads its `file_sha256` and `size` from the API.
3. Emits one `Artifact` for `${library_directory}/net/harmoniya/authliberty/<v>/authliberty-<v>.jar` with the URL `<gitlab>/api/v4/projects/<project>/packages/generic/authliberty/<v>/<filename>` and sha256 integrity.
4. Builds a `Valset` of JVM args: `-javaagent:<path>` plus a `-Dminecraft.api.<auth|account|session|services>.host=<url>` for each host you configured.

The user merges that Valset into their loader's `launch.args` (place it among the JVM args, _before_ the main class, so the agent's `ClassFileTransformer` registers before authlib classes load).

## Notes

- AuthLiberty targets Mojang authlib's bytecode, not Yggdrasil-Connect or AuthlibInjector — it's a thinner shim. If you need AuthlibInjector's protocol (e.g. for Ely.by), pair AuthLiberty with a different agent.
- The `latest` channel auto-updates whenever AuthLiberty's CI publishes a new `main` build. Pin to a tagged version (`'0.3'`) for reproducible installs.
