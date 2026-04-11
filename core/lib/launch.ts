import { z } from 'zod';
import { Valset } from '@unifest/rules';
import type { SatisfiesOsOptions } from '@unifest/rules';
import { ValDefs } from './valdefs';

const LaunchSchema = z.object({
  command: z.string(),
  workdir: z.string(),
  args: Valset.CODEC.default(new Valset([])),
  envs: ValDefs.CODEC.default(ValDefs.empty()),
});

export class Launch {
  constructor(
    public readonly command: string,
    public readonly workdir: string,
    public readonly args: Valset,
    public readonly envs: ValDefs,
  ) {}

  public static CODEC = z.codec(LaunchSchema, z.instanceof(Launch), {
    decode: ({ command, workdir, args, envs }) =>
      new Launch(command, workdir, args, envs),
    encode: (launch) => ({
      command: launch.command,
      workdir: launch.workdir,
      args: launch.args,
      envs: launch.envs,
    }),
  });

  public resolvedArgs(
    options: SatisfiesOsOptions,
    feats: string[] = [],
  ): string[] {
    return this.args.resolve(options, feats);
  }

  public resolvedEnvs(
    options: SatisfiesOsOptions,
    feats: string[] = [],
  ): Record<string, string> {
    return this.envs.resolve(options, feats);
  }

  public toJSON() {
    return {
      command: this.command,
      workdir: this.workdir,
      args: Valset.CODEC.encode(this.args),
      envs: ValDefs.CODEC.encode(this.envs),
    };
  }
}
