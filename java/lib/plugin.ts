import { definePlugin, type LankaPlugin } from '@lanka/dev';
import { resolveJava, type JavaOptions } from './template';

/**
 * Provision an OpenJDK runtime (Eclipse Temurin). Solely owns the
 * `java_home` / `java_bin` vars and exposes `bin` as a launch group, so a
 * config wires the launch command with `command: ({ java }) => java.bin`.
 */
export function java(
  version: string,
  opts: Omit<JavaOptions, 'version'> = {},
): LankaPlugin {
  return definePlugin({
    name: 'java',
    async build(ctx) {
      const t = await resolveJava({ version, ...opts });
      // The resolved build, e.g. `OpenJDK 21.0.13+11` / `OpenJDK 8u492-b09`.
      ctx.log('java', `OpenJDK ${t.release.releaseName.replace(/^jdk-?/, '')}`);
      return {
        artifacts: t.artifacts,
        vars: t.vars,
        launch: { bin: '${java_bin}' },
      };
    },
  });
}
