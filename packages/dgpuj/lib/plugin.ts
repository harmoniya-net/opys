import { definePlugin, type ChainablePlugin } from '@opys/dev';
import { resolveDgpuj, type DgpujOptions } from './template';

/**
 * Provision the [`dgpuj`](https://github.com/harmoniya-net/dgpuj) launcher — it
 * forces the discrete GPU on hybrid-graphics systems, then runs the JVM
 * in-process. A near drop-in for `java`, usable as the launch `command` on
 * every platform (it forces the dGPU on Windows/Linux and is a harmless
 * passthrough on macOS).
 *
 * Solely owns `dgpuj_dir` / `dgpuj_bin`, and exposes two launch groups:
 *   - `bin`  — the launcher binary (the `command`).
 *   - `home` — `--dgpuj-home ${java_home}`, so it locates the JVM provisioned
 *     by `@opys/java`. Prepend it to `args` before the usual JVM args.
 *
 * ```js
 * import { dgpuj } from '@opys/dgpuj';
 * // plugins: [forge('1.20.1-best'), java('17'), dgpuj()]
 * command: ({ dgpuj }) => dgpuj.bin,
 * args: ({ dgpuj, forge }) => [
 *   dgpuj.home, forge.jvmArgs, forge.mainClass, forge.gameArgs,
 * ],
 * ```
 */
export function dgpuj(options: DgpujOptions = {}): ChainablePlugin {
  return definePlugin({
    name: 'dgpuj',
    async build(ctx) {
      const t = await resolveDgpuj(options);
      ctx.log(
        'dgpuj',
        `${t.release.tag_name} (${t.artifacts.length} target(s))`,
      );
      return {
        artifacts: t.artifacts,
        vars: t.vars,
        launch: {
          bin: '${dgpuj_bin}',
          // References the var owned by @opys/java; ignore this group if you
          // wire the JVM location yourself (--dgpuj-jvm / $JAVA_HOME).
          home: { rules: [], value: ['--dgpuj-home', '${java_home}'] },
        },
      };
    },
  });
}
