import { writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { basename, resolve } from 'node:path';
import prompts from 'prompts';
import { cyan, dim, green, red } from 'kolorist';
import { parseArgs } from '../args';
import { UsageError } from '../errors';
import type { Logger } from '../logger';

interface TemplateInputs {
  name: string;
  version: string;
  forge: boolean;
}

function vanillaTemplate({ name, version }: TemplateInputs): string {
  return `import { defineConfig, minecraft, userDataDir } from '@torba/minecraft';

export default defineConfig(async () => {
  const mc = await minecraft({ version: '${version}' });

  return {
    output: 'torba.json',
    artifacts: [mc.artifacts],
    vars: mc.vars,
    command: mc.command,
    runClient: {
      vars: {
        root: userDataDir('${name}'),
        username: 'Player',
        uuid: '',
        token: '',
      },
    },
  };
});
`;
}

function forgeTemplate({ name, version }: TemplateInputs): string {
  return `import { defineConfig, userDataDir } from '@torba/minecraft';
import { forge } from '@torba/forge';

export default defineConfig(async () => {
  const fr = await forge({
    version: '${version}',
    manifest: './forge-manifest.json', // path to the forge version JSON on disk
  });

  return {
    output: 'torba.json',
    artifacts: [fr.artifacts],
    vars: fr.vars,
    command: fr.command,
    runClient: {
      vars: {
        root: userDataDir('${name}'),
        username: 'Player',
        uuid: '',
        token: '',
      },
    },
  };
});
`;
}

interface PackageManager {
  name: 'npm' | 'pnpm' | 'yarn' | 'bun';
  addCmd: string; // e.g. 'install' | 'add'
  devFlag: string; // '-D' or '-d'
}

function detectPackageManager(): PackageManager {
  const ua = process.env.npm_config_user_agent ?? '';
  const fromUA = ua.split('/')[0]?.toLowerCase();
  const name = ((): PackageManager['name'] => {
    if (fromUA === 'pnpm' || fromUA === 'yarn' || fromUA === 'bun')
      return fromUA;
    if (existsSync('pnpm-lock.yaml')) return 'pnpm';
    if (existsSync('yarn.lock')) return 'yarn';
    if (existsSync('bun.lockb') || existsSync('bun.lock')) return 'bun';
    return 'npm';
  })();

  switch (name) {
    case 'pnpm':
      return { name, addCmd: 'add', devFlag: '-D' };
    case 'yarn':
      return { name, addCmd: 'add', devFlag: '-D' };
    case 'bun':
      return { name, addCmd: 'add', devFlag: '-d' };
    default:
      return { name: 'npm', addCmd: 'install', devFlag: '-D' };
  }
}

function runInstall(pm: PackageManager, packages: string[]): Promise<boolean> {
  const args = [pm.addCmd, pm.devFlag, ...packages];
  // Windows resolves CLIs via `.cmd` shims; spawn requires the suffix.
  const cmd = process.platform === 'win32' ? `${pm.name}.cmd` : pm.name;
  process.stdout.write(`\n${dim('$')} ${pm.name} ${args.join(' ')}\n`);
  return new Promise((res) => {
    const child = spawn(cmd, args, { stdio: 'inherit' });
    child.on('exit', (code) => res(code === 0));
    child.on('error', () => res(false));
  });
}

function manualSteps(
  packages: string[],
  pm: PackageManager,
  forge: boolean,
): void {
  process.stdout.write(`${dim('Next steps:')}\n`);
  process.stdout.write(
    `  ${pm.name} ${pm.addCmd} ${pm.devFlag} ${packages.join(' ')}\n`,
  );
  if (forge) {
    process.stdout.write(
      `  ${dim('# place the forge version JSON at ./forge-manifest.json')}\n`,
    );
  }
  process.stdout.write(`  torba build\n`);
  process.stdout.write(
    `  torba launch --var username=YourName --var uuid=<uuid> --var token=<token>\n`,
  );
}

function onCancel(): never {
  process.stdout.write(`${red('✖')} Cancelled\n`);
  process.exit(1);
}

export async function cmdInit(argv: string[], _logger: Logger): Promise<void> {
  const args = parseArgs(argv, [
    { long: 'output', short: 'o', type: 'string' },
    { long: 'name', type: 'string' },
    { long: 'version', type: 'string' },
    { long: 'forge', type: 'boolean' },
    { long: 'force', type: 'boolean' },
    { long: 'install', type: 'boolean' },
    { long: 'no-install', type: 'boolean' },
  ]);

  const outputFile = args.getString('output') ?? 'torba.config.mjs';
  const cliName = args.getString('name');
  const cliVersion = args.getString('version');
  const cliForge = args.getBoolean('forge') ? true : undefined;
  const force = args.getBoolean('force');
  const cliInstall = args.getBoolean('install');
  const cliNoInstall = args.getBoolean('no-install');

  const absOut = resolve(outputFile);
  const exists = existsSync(absOut);
  const interactive =
    (process.stdout.isTTY ?? false) && (process.stdin.isTTY ?? false);

  if (exists && !force && !interactive) {
    throw new UsageError(
      `${outputFile} already exists. Pass --force to overwrite.`,
    );
  }

  const questions: prompts.PromptObject[] = [];

  if (exists && !force) {
    questions.push({
      type: 'confirm',
      name: 'overwrite',
      message: `${outputFile} exists. Overwrite?`,
      initial: false,
    });
  }

  if (cliName === undefined) {
    questions.push({
      type: 'text',
      name: 'name',
      message: 'App name',
      initial: basename(process.cwd()),
    });
  }

  if (cliVersion === undefined) {
    questions.push({
      type: 'text',
      name: 'version',
      message: 'Minecraft version',
      initial: '1.20.1',
    });
  }

  if (cliForge === undefined) {
    questions.push({
      type: 'select',
      name: 'forge',
      message: 'Loader',
      choices: [
        { title: 'vanilla', value: false },
        { title: 'forge', value: true },
      ],
      initial: 0,
    });
  }

  // Only prompt for install in interactive mode, when no flag was passed,
  // and there's actually a package.json to install into.
  const askInstall =
    interactive && !cliInstall && !cliNoInstall && existsSync('package.json');
  if (askInstall) {
    questions.push({
      type: 'confirm',
      name: 'install',
      message: 'Install dependencies?',
      initial: true,
    });
  }

  // In non-interactive mode, fall back to each question's default rather than
  // hanging on stdin. Select questions use the value at `initial` index.
  let answers: Record<string, unknown> = {};
  if (questions.length > 0) {
    if (interactive) {
      answers = await prompts(questions, { onCancel });
    } else {
      for (const q of questions) {
        if (q.type === 'select') {
          const choices = q.choices as Array<{ value: unknown }>;
          answers[q.name as string] =
            choices[(q.initial as number) ?? 0]?.value;
        } else {
          answers[q.name as string] = q.initial;
        }
      }
    }
  }

  if (questions.find((q) => q.name === 'overwrite') && !answers.overwrite) {
    process.stdout.write(`${red('✖')} Aborted\n`);
    return;
  }

  const inputs: TemplateInputs = {
    name: cliName ?? answers.name,
    version: cliVersion ?? answers.version,
    forge: cliForge ?? answers.forge,
  };

  const content = inputs.forge
    ? forgeTemplate(inputs)
    : vanillaTemplate(inputs);
  await writeFile(absOut, content, 'utf8');

  process.stdout.write(`\n${green('✓')} Wrote ${cyan(outputFile)}\n`);

  const packages = inputs.forge
    ? ['@torba/minecraft', '@torba/forge']
    : ['@torba/minecraft'];

  const wantsInstall = cliInstall
    ? true
    : cliNoInstall
      ? false
      : (answers.install ?? false);

  const pm = detectPackageManager();

  if (wantsInstall) {
    if (!existsSync('package.json')) {
      process.stdout.write(
        `\n${dim('No package.json found — skipping install.')}\n\n`,
      );
      manualSteps(packages, pm, inputs.forge);
      return;
    }
    const ok = await runInstall(pm, packages);
    if (!ok) {
      process.stdout.write(
        `\n${red('✖')} Install failed. Run it manually:\n\n`,
      );
      manualSteps(packages, pm, inputs.forge);
      return;
    }
    process.stdout.write(
      `\n${green('✓')} Installed ${packages.join(', ')}\n\n`,
    );
    process.stdout.write(`${dim('Next steps:')}\n`);
    if (inputs.forge) {
      process.stdout.write(
        `  ${dim('# place the forge version JSON at ./forge-manifest.json')}\n`,
      );
    }
    process.stdout.write(`  torba build\n`);
    process.stdout.write(
      `  torba launch --var username=YourName --var uuid=<uuid> --var token=<token>\n`,
    );
  } else {
    process.stdout.write('\n');
    manualSteps(packages, pm, inputs.forge);
  }
}
