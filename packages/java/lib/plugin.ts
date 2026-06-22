import {
  definePlugin,
  type BuildContext,
  type ChainablePlugin,
  type Contribution,
} from '@opys/dev';
import { resolveDgpuj } from '@opys/dgpuj';
import { resolveJava, type JavaOptions } from './template';

/**
 * Provision an OpenJDK runtime (Eclipse Temurin). Solely owns the
 * `java_home` / `java_bin` vars and exposes `bin` as a launch group, so a
 * config wires the launch command with `command: ({ java }) => java.bin`.
 *
 * Pass `{ dgpuj: true }` (or dgpuj options) to additionally provision the
 * [`dgpuj`](https://github.com/harmoniya-net/dgpuj) discrete-GPU launcher: the
 * `bin` group then points at dgpuj (it runs the JVM in-process after forcing
 * the dGPU), and a `home` group (`--dgpuj-home ${java_home}`) is exposed to
 * prepend to `args`. See {@link JavaOptions.dgpuj}.
 */
export function java(
  version: string,
  opts: Omit<JavaOptions, 'version'> = {},
): ChainablePlugin {
  return definePlugin({
    name: 'java',
    async build(ctx: BuildContext): Promise<Contribution> {
      const { dgpuj, ...javaOpts } = opts;
      const t = await resolveJava({ version, ...javaOpts });
      // The resolved build, e.g. `OpenJDK 21.0.13+11` / `OpenJDK 8u492-b09`.
      ctx.log('java', `OpenJDK ${t.release.releaseName.replace(/^jdk-?/, '')}`);

      if (!dgpuj) {
        return {
          artifacts: t.artifacts,
          vars: t.vars,
          launch: { bin: '${java_bin}' },
        };
      }

      // dgpuj wraps the launch: provision its binary, fold in its vars, and
      // repoint `bin` at it. `home` feeds the JVM location through to dgpuj.
      const d = await resolveDgpuj(dgpuj === true ? {} : dgpuj);
      ctx.log('java', `dgpuj ${d.release.tag_name} — forcing discrete GPU`);
      return {
        artifacts: [...t.artifacts, ...d.artifacts],
        vars: { ...t.vars, ...d.vars },
        launch: {
          bin: '${dgpuj_bin}',
          home: { rules: [], value: ['--dgpuj-home', '${java_home}'] },
        },
      };
    },
  });
}
