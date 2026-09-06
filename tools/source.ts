import ts from "npm:typescript@5.9.2";

export { ts };
export async function sourceFiles(directory = "src"): Promise<string[]> {
  const paths: string[] = [];
  for await (const entry of Deno.readDir(directory)) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory) paths.push(...await sourceFiles(path));
    else if (path.endsWith(".ts") && !path.endsWith(".test.ts")) {
      paths.push(path);
    }
  }
  return paths.sort();
}

export function parse(path: string, text: string): ts.SourceFile {
  return ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
}

export function dependencies(
  file: ts.SourceFile,
): { specifier: string; runtime: boolean }[] {
  const results: { specifier: string; runtime: boolean }[] = [];
  function visit(node: ts.Node): void {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)
    ) {
      let runtime = true;
      if (ts.isImportDeclaration(node) && node.importClause) {
        const clause = node.importClause;
        runtime = !clause.isTypeOnly &&
          (Boolean(clause.name) || !clause.namedBindings ||
            !ts.isNamedImports(clause.namedBindings) ||
            clause.namedBindings.elements.some((item) => !item.isTypeOnly));
      } else if (ts.isExportDeclaration(node)) {
        runtime = !node.isTypeOnly &&
          (!node.exportClause || !ts.isNamedExports(node.exportClause) ||
            node.exportClause.elements.some((item) => !item.isTypeOnly));
      }
      results.push({ specifier: node.moduleSpecifier.text, runtime });
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      if (
        node.arguments.length !== 1 || !ts.isStringLiteral(node.arguments[0])
      ) throw new Error(`Non-static runtime import: ${file.fileName}`);
      results.push({
        specifier: (node.arguments[0] as ts.StringLiteral).text,
        runtime: true,
      });
    }
    if (
      ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    ) {
      results.push({ specifier: node.argument.literal.text, runtime: false });
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return results;
}

export function resolve(source: string, specifier: string): string {
  if (specifier.startsWith("@/")) return `src/${specifier.slice(2)}`;
  if (specifier.startsWith(".")) {
    return new URL(specifier, new URL(source, "https://repo.invalid/")).pathname
      .slice(1);
  }
  throw new Error(`External production dependency: ${source} -> ${specifier}`);
}

export function publicExports(
  file: ts.SourceFile,
): { name: string; typeOnly: boolean }[] {
  return file.statements.flatMap((node) =>
    ts.isExportDeclaration(node) && node.exportClause &&
      ts.isNamedExports(node.exportClause)
      ? node.exportClause.elements.map((entry) => ({
        name: entry.name.text,
        typeOnly: node.isTypeOnly || entry.isTypeOnly,
      }))
      : []
  );
}

export async function resolvedPublicExports(
  path = "src/index.ts",
  typeOnly = false,
  parents: string[] = [],
): Promise<{ name: string; typeOnly: boolean }[]> {
  if (parents.includes(path)) {
    throw new Error("Cyclic public re-export: " + path);
  }
  const file = parse(path, await Deno.readTextFile(path));
  const entries: { name: string; typeOnly: boolean }[] = [];
  for (const node of file.statements) {
    if (ts.isExportDeclaration(node)) {
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        entries.push(
          ...node.exportClause.elements.map((entry) => ({
            name: entry.name.text,
            typeOnly: typeOnly || node.isTypeOnly || entry.isTypeOnly,
          })),
        );
      } else if (
        !node.exportClause && node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        entries.push(
          ...await resolvedPublicExports(
            resolve(path, node.moduleSpecifier.text),
            typeOnly || node.isTypeOnly,
            [...parents, path],
          ),
        );
      }
    } else if (
      ts.canHaveModifiers(node) &&
      ts.getModifiers(node)?.some((modifier) =>
        modifier.kind === ts.SyntaxKind.ExportKeyword
      )
    ) {
      if (ts.isVariableStatement(node)) {
        for (const entry of node.declarationList.declarations) {
          if (!ts.isIdentifier(entry.name)) {
            throw new Error("Review destructured public export: " + path);
          }
          entries.push({ name: entry.name.text, typeOnly });
        }
      } else if (
        "name" in node && node.name && ts.isIdentifier(node.name as ts.Node)
      ) {
        entries.push({
          name: (node.name as ts.Identifier).text,
          typeOnly: typeOnly || ts.isInterfaceDeclaration(node) ||
            ts.isTypeAliasDeclaration(node),
        });
      }
    }
  }
  const unique = new Map<string, boolean>();
  for (const entry of entries) {
    unique.set(entry.name, (unique.get(entry.name) ?? true) && entry.typeOnly);
  }
  return [...unique].map(([name, typeOnly]) => ({ name, typeOnly })).sort((
    left,
    right,
  ) => left.name.localeCompare(right.name));
}
