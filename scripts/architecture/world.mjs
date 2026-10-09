/**
 * Reads the tree into the plain snapshot the checks run against. This is the
 * only impure half: `cargo metadata` for the crate graph — Cargo's own
 * reading of every `Cargo.toml`, not a second parser of them — the
 * `package.json`s, and the TypeScript compiler's syntax tree for what each
 * source file imports and declares.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

const posix = (path) => path.split(sep).join('/');

function walk(dir, keep) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (entry === 'node_modules' || entry === 'dist') return [];
    return statSync(path).isDirectory()
      ? walk(path, keep)
      : keep(path)
        ? [path]
        : [];
  });
}

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

/** What one TypeScript file imports and declares, read off its syntax tree. */
export function readTypeScript(path, text, packageDir) {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const lineOf = (node) =>
    source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
  const imports = [];
  const classes = [];
  const doubleCasts = [];

  const unwrap = (node) =>
    ts.isParenthesizedExpression(node) ? unwrap(node.expression) : node;
  const add = (literal, node, typeOnly, names = []) => {
    if (literal && ts.isStringLiteralLike(literal))
      imports.push({
        specifier: literal.text,
        line: lineOf(node),
        typeOnly,
        names,
      });
  };
  /** What an import takes by name: `*` for all of it, nothing for a bare one. */
  const namesOf = (clause) => {
    const bound = clause?.namedBindings;
    if (!bound) return clause?.name ? ['default'] : [];
    return ts.isNamespaceImport(bound)
      ? ['*']
      : bound.elements.map((e) => (e.propertyName ?? e.name).text);
  };

  const visit = (node) => {
    if (ts.isImportDeclaration(node)) {
      add(
        node.moduleSpecifier,
        node,
        node.importClause?.isTypeOnly ?? false,
        namesOf(node.importClause),
      );
    } else if (ts.isExportDeclaration(node)) {
      add(node.moduleSpecifier, node, node.isTypeOnly);
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument)
    ) {
      add(node.argument.literal, node, true);
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === 'require'))
    ) {
      add(node.arguments[0], node, false);
    } else if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      const parent = node.heritageClauses
        ?.find((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword)
        ?.types[0]?.expression.getText(source);
      classes.push({
        name: node.name?.text ?? '(anonymous)',
        line: lineOf(node),
        extendsError: /Error$/.test(parent ?? ''),
      });
    } else if (ts.isAsExpression(node)) {
      const inner = unwrap(node.expression);
      if (
        ts.isAsExpression(inner) &&
        inner.type.kind === ts.SyntaxKind.UnknownKeyword
      )
        doubleCasts.push(lineOf(node));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  const escapes = imports
    .map((i) => i.specifier)
    .filter((s) => s.startsWith('.'))
    .filter((s) =>
      relative(packageDir, resolve(dirname(path), s)).startsWith('..'),
    );
  return { imports, classes, doubleCasts, escapes };
}

const SOURCE = /\.(ts|tsx|mts|cts|js|mjs|cjs)$/;

function readSources(root, packageDir, sub) {
  return walk(
    join(root, packageDir, sub),
    (p) => SOURCE.test(p) && !p.endsWith('.d.ts'),
  ).map((path) => ({
    path: posix(relative(root, path)),
    ...readTypeScript(path, readFileSync(path, 'utf8'), join(root, packageDir)),
  }));
}

function readPackages(root) {
  return readdirSync(join(root, 'packages'))
    .filter((entry) =>
      existsSync(join(root, 'packages', entry, 'package.json')),
    )
    .map((entry) => {
      const dir = `packages/${entry}`;
      const manifest = readJson(join(root, dir, 'package.json'));
      return {
        name: manifest.name,
        dir,
        dependencies: manifest.dependencies ?? {},
        peerDependencies: manifest.peerDependencies ?? {},
        devDependencies: manifest.devDependencies ?? {},
        lib: readSources(root, dir, 'lib'),
        tests: readSources(root, dir, 'tests'),
      };
    });
}

function readCrates(root) {
  const metadata = JSON.parse(
    execFileSync('cargo', ['metadata', '--no-deps', '--format-version', '1'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    }),
  );
  const members = new Set(metadata.packages.map((p) => p.name));
  return metadata.packages.map((pkg) => {
    const dir = posix(relative(root, dirname(pkg.manifest_path)));
    return {
      name: pkg.name,
      dir,
      // `publish = false` reads back as an empty registry list.
      publish: pkg.publish === null || pkg.publish.length > 0,
      cdylib: pkg.targets.some((t) => t.crate_types.includes('cdylib')),
      deps: pkg.dependencies
        .filter((d) => members.has(d.name))
        .map((d) => ({
          name: d.name,
          kind: d.kind ?? 'normal',
          defaultFeatures: d.uses_default_features,
        })),
      sources: walk(join(root, dir, 'src'), (p) => p.endsWith('.rs')).map(
        (path) => ({
          path: posix(relative(root, path)),
          text: readFileSync(path, 'utf8'),
        }),
      ),
    };
  });
}

/** A binding is a crate directory that also carries a `package.json`. */
function readBindings(root, crates) {
  return crates
    .filter((crate) => existsSync(join(root, crate.dir, 'package.json')))
    .map((crate) => ({
      name: readJson(join(root, crate.dir, 'package.json')).name,
      crate: crate.name,
      dir: crate.dir,
    }));
}

export function readWorld(root) {
  const crates = readCrates(root);
  const rootManifest = readJson(join(root, 'package.json'));
  return {
    crates,
    packages: readPackages(root),
    bindings: readBindings(root, crates),
    root: {
      workspaces: rootManifest.workspaces ?? [],
      devDependencies: rootManifest.devDependencies ?? {},
    },
    release: {
      workflow: readFileSync(
        join(root, '.github/workflows/release.yml'),
        'utf8',
      ),
      smoke: readFileSync(join(root, 'scripts/smoke-napi.mjs'), 'utf8'),
    },
  };
}
