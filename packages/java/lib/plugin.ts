import { definePlugin, type ChainablePlugin } from '@opys/dev';
import { resolveJava, type JavaOptions } from './template';

/**
 * Provision a JDK runtime. Solely owns the `java_home` / `java_bin` vars
 * and exposes `bin` as a launch group, so a config wires the launch
 * command with `command: ({ java }) => java.bin`. Defaults to Temurin
 * (Eclipse Adoptium); pass `vendor: 'zulu'` or `vendor: 'graalvm'` for an
 * alternate distribution.
 */
export function java(
  version: string,
  opts: Omit<JavaOptions, 'version'> = {},
): ChainablePlugin {
  return definePlugin({
    name: 'java',
    async build(ctx) {
      const t = await resolveJava({ version, ...opts });
      // e.g. `Temurin 21.0.13+11` / `Zulu 21.52.15 (JDK 21.0.12)` / `GraalVM CE 21.0.2`.
      ctx.log('java', t.release.label);
      return {
        artifacts: t.artifacts,
        vars: t.vars,
        launch: { bin: '${java_bin}' },
        // Export JAVA_HOME by default so tools spawned at launch (e.g. the
        // dgpuj launcher) locate the provisioned JDK with no extra wiring.
        envs: { JAVA_HOME: '${java_home}' },
      };
    },
  });
}
