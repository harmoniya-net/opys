/**
 * Variable interpolation for ${name} placeholders.
 *
 * Rules:
 * - \${ is an escaped literal ${
 * - ${name} with spaces or unclosed ${ are left as-is
 * - Missing variables are left as-is (placeholder preserved verbatim)
 * - Circular dependencies throw
 */

export type VarMap = Record<string, string>;

const PLACEHOLDER = /\\\$\{|\$\{([^}\s]+)\}/g;

/**
 * Replace ${name} placeholders in `template`, handling the `\${` escape.
 * `lookup` maps a variable name to its replacement.
 */
function replacePlaceholders(
  template: string,
  lookup: (name: string) => string,
): string {
  return template.replace(PLACEHOLDER, (match, name?: string) => {
    if (match === '\\${') return '${';
    if (!name) return match;
    return lookup(name);
  });
}

/**
 * Resolve all variables in `vars`, replacing ${name} references.
 * Returns a flat map of resolved key→value.
 */
export function resolveVars(vars: VarMap): VarMap {
  const resolved: VarMap = {};
  const resolving = new Set<string>();

  function resolve(key: string): string {
    if (Object.prototype.hasOwnProperty.call(resolved, key))
      return resolved[key]!;
    if (resolving.has(key))
      throw new Error(`Circular variable reference: ${key}`);

    const template = vars[key];
    if (template === undefined) return `\${${key}}`;

    resolving.add(key);
    const result = replacePlaceholders(template, resolve);
    resolving.delete(key);
    resolved[key] = result;
    return result;
  }

  for (const key of Object.keys(vars)) {
    resolve(key);
  }

  return resolved;
}

/**
 * Apply resolved vars to an arbitrary string.
 */
export function interpolate(template: string, vars: VarMap): string {
  return replacePlaceholders(template, (name) =>
    Object.prototype.hasOwnProperty.call(vars, name)
      ? (vars[name] ?? `\${${name}}`)
      : `\${${name}}`,
  );
}
