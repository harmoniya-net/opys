import { definePlugin, type ChainablePlugin } from '@opys/dev';
import { resolveAuthliberty, type AuthLibertyOptions } from './template';

/** AuthLiberty — an authlib-injector `-javaagent` auth redirector. */
export function authliberty(
  version: string,
  opts: Omit<AuthLibertyOptions, 'version'> = {},
): ChainablePlugin {
  return definePlugin({
    name: 'authliberty',
    async build(ctx) {
      const t = await resolveAuthliberty({ version, ...opts });
      ctx.log('authliberty', `resolved ${version}`);
      return { artifacts: t.artifacts, launch: { jvmArgs: t.jvmArgs } };
    },
  });
}
