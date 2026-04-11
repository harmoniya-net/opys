import { readFile, unlink, writeFile } from 'node:fs/promises';

export async function readTextFile(path: string): Promise<string> {
  return readFile(path, 'utf8');
}

/**
 * Import a user config file, rewriting any `@unifest/*` specifiers to the
 * CLI's own resolved paths so the config works without local installations.
 */
export async function importConfig(
  absConfigFile: string,
): Promise<Record<string, unknown>> {
  const source = await readTextFile(absConfigFile);

  // Replace '@unifest/x' / "@unifest/x" with the absolute path the CLI resolved.
  const transformed = source.replace(
    /(['"])(@unifest\/[^'"]+)\1/g,
    (match, quote, specifier) => {
      try {
        return `${quote}${import.meta.resolve(specifier)}${quote}`;
      } catch {
        return match; // leave unchanged if the CLI doesn't have it either
      }
    },
  );

  if (transformed === source) return import(absConfigFile);

  // Write next to the config so relative imports inside it still resolve.
  const tmpPath = `${absConfigFile}.tmp${process.pid}.mjs`;
  await writeFile(tmpPath, transformed, 'utf8');
  try {
    return await import(tmpPath);
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}
