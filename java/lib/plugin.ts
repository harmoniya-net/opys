import { definePlugin, type TorbaPlugin } from '@torba/dev';
import { resolveJava, type JavaOptions } from './template';

/**
 * Provision an OpenJDK runtime (Eclipse Temurin). Solely owns the
 * `java_home` / `java_bin` vars and exposes `bin` as a launch group, so a
 * config wires the launch command with `command: ({ java }) => java.bin`.
 */
export function java(
  version: string,
  opts: Omit<JavaOptions, 'version'> = {},
): TorbaPlugin {
  return definePlugin({
    name: 'java',
    async build(ctx) {
      const t = await resolveJava({ version, ...opts });
      ctx.log('java', `OpenJDK ${t.release.version}`);
      return {
        artifacts: t.artifacts,
        vars: t.vars,
        launch: { bin: '${java_bin}' },
      };
    },
  });
}
