import { parse, sourceFiles, ts } from "@tools/source.ts";

const coverage = new Map<
  string,
  {
    lines: Map<number, number>;
    branches: number;
    coveredBranches: number;
    functions: number;
    coveredFunctions: number;
  }
>();
let current: ReturnType<typeof coverage.get>;
for (const line of (await Deno.readTextFile("coverage.lcov")).split("\n")) {
  if (line.startsWith("SF:")) {
    const path = line.slice(3);
    const marker = path.lastIndexOf("/src/");
    const relative = marker >= 0 ? path.slice(marker + 1) : path;
    current = relative.startsWith("src/") && !relative.endsWith(".test.ts")
      ? {
        lines: new Map(),
        branches: 0,
        coveredBranches: 0,
        functions: 0,
        coveredFunctions: 0,
      }
      : undefined;
    if (current) coverage.set(relative, current);
  } else if (current && line.startsWith("DA:")) {
    const [position, count] = line.slice(3).split(",").map(Number);
    current.lines.set(position, count);
  } else if (current && line.startsWith("BRDA:")) {
    current.branches++;
    if (Number(line.split(",").at(-1)) > 0) current.coveredBranches++;
  } else if (current && line.startsWith("FNDA:")) {
    current.functions++;
    if (Number(line.slice(5).split(",")[0]) > 0) current.coveredFunctions++;
  }
}

const functions: {
  file: string;
  line: number;
  complexity: number;
  lineCoverage: number;
  crapLineProxy: number;
}[] = [];
for (const path of await sourceFiles()) {
  const file = parse(path, await Deno.readTextFile(path));
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionLike(node) && "body" in node && node.body) {
      if (!coverage.has(path)) {
        throw new Error(
          "Executable production module missing from coverage: " + path,
        );
      }
      const body = node.body as ts.Node;
      let complexity = 1;
      const inspect = (child: ts.Node): void => {
        if (child !== body && ts.isFunctionLike(child)) return;
        if (
          ts.isIfStatement(child) || ts.isConditionalExpression(child) ||
          ts.isForStatement(child) || ts.isForOfStatement(child) ||
          ts.isForInStatement(child) || ts.isWhileStatement(child) ||
          ts.isDoStatement(child) || ts.isCatchClause(child) ||
          ts.isCaseClause(child)
        ) complexity++;
        if (
          ts.isBinaryExpression(child) &&
          [
            ts.SyntaxKind.AmpersandAmpersandToken,
            ts.SyntaxKind.BarBarToken,
            ts.SyntaxKind.QuestionQuestionToken,
          ].includes(child.operatorToken.kind)
        ) complexity++;
        ts.forEachChild(child, inspect);
      };
      inspect(body);
      const first =
        file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
      const last = file.getLineAndCharacterOfPosition(node.end).line + 1;
      const lines = [...(coverage.get(path)?.lines ?? [])].filter(([line]) =>
        line >= first && line <= last
      );
      const covered = lines.length
        ? lines.filter(([, hits]) => hits > 0).length / lines.length
        : 0;
      functions.push({
        file: path,
        line: first,
        complexity,
        lineCoverage: covered,
        crapLineProxy: complexity ** 2 * (1 - covered) ** 3 + complexity,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
}
const rows = [...coverage].map(([file, data]) => ({
  file,
  lines: data.lines.size,
  covered: [...data.lines.values()].filter((hits) => hits > 0).length,
  branches: data.branches,
  coveredBranches: data.coveredBranches,
  functions: data.functions,
  coveredFunctions: data.coveredFunctions,
  missing: [...data.lines].filter(([, hits]) => !hits).map(([line]) => line),
}));
const totalLines = rows.reduce((sum, row) => sum + row.lines, 0);
const totalBranches = rows.reduce((sum, row) => sum + row.branches, 0);
const totalFunctions = rows.reduce((sum, row) => sum + row.functions, 0);
const linePercent = 100 * rows.reduce((sum, row) => sum + row.covered, 0) /
  totalLines;
const branchPercent = 100 *
  rows.reduce((sum, row) => sum + row.coveredBranches, 0) /
  totalBranches;
const functionPercent = 100 *
  rows.reduce((sum, row) => sum + row.coveredFunctions, 0) /
  totalFunctions;
const report = {
  methodology:
    "Syntactic cyclomatic approximation. CRAP uses executed source-line coverage, not basis-path coverage. A navigation metric, not proof of correctness.",
  linePercent,
  branchPercent,
  functionPercent,
  rows,
  functions: functions.sort((left, right) =>
    right.crapLineProxy - left.crapLineProxy
  ),
};
await Deno.mkdir(".artifacts", { recursive: true });
await Deno.writeTextFile(
  ".artifacts/quality.json",
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify({
    linePercent,
    branchPercent,
    functionPercent,
    instrumentedFunctions: totalFunctions,
    analyzedFunctions: functions.length,
    maxComplexity: Math.max(...functions.map((entry) => entry.complexity)),
  }),
);
if (
  !Number.isFinite(linePercent) || !Number.isFinite(branchPercent) ||
  !Number.isFinite(functionPercent) ||
  linePercent !== 100 || branchPercent !== 100 || functionPercent !== 100
) {
  console.error(
    "Coverage requires 100% lines, branches and functions. See .artifacts/quality.json.",
  );
  Deno.exit(1);
}
if (functions.some((entry) => entry.complexity > 20)) {
  console.error(
    "Syntactic function complexity exceeds 20. Split the behavior or review the explicit budget.",
  );
  Deno.exit(1);
}
