import { parse, sourceFiles, ts } from "@tools/source.ts";

// Inspect only the trivia between parser-recognized tokens. This avoids treating
// text in multiline template literals, regexes, strings or TSDoc as annotations.
export function stripProofComments(path: string, text: string): string {
  const file = parse(path, text);
  let previousEnd = 0;
  let copied = 0;
  const chunks: string[] = [];
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false);

  function inspectGap(end: number): void {
    if (end <= previousEnd) return;
    scanner.setText(text, previousEnd, end - previousEnd);
    for (
      let kind = scanner.scan();
      kind !== ts.SyntaxKind.EndOfFileToken;
      kind = scanner.scan()
    ) {
      if (kind !== ts.SyntaxKind.SingleLineCommentTrivia) continue;
      const comment = scanner.getTokenText();
      if (!comment.startsWith("//@ ")) continue;
      if (
        !/^\/\/@ (?:verify|requires|ensures|contract|invariant|decreases|done_with|type|ghost|assert|assume|pure|havoc|declare-type|extern|impure|autohavoc|skip|backend|guarded|option|safe-slice)(?:\s|$)/
          .test(comment)
      ) {
        throw new Error(`Unrecognized //@ directive in ${path}: ${comment}`);
      }
      chunks.push(text.slice(copied, scanner.getTokenStart()));
      copied = scanner.getTokenEnd();
    }
  }
  function visit(node: ts.Node): void {
    if (ts.isJSDoc(node)) return;
    if (ts.isToken(node)) {
      inspectGap(node.getStart(file));
      previousEnd = node.end;
    } else {
      for (const child of node.getChildren(file)) visit(child);
    }
  }
  visit(file);
  chunks.push(text.slice(copied));
  return chunks.join("");
}

export async function prepareRelease(directory: string): Promise<void> {
  for (const name of ["deno.json", "deno.lock", "README.md", "LICENSE"]) {
    await Deno.copyFile(name, directory + "/" + name);
  }
  for (const path of await sourceFiles()) {
    const input = await Deno.readTextFile(path);
    const output = stripProofComments(path, input);
    const target = directory + "/" + path;
    await Deno.mkdir(target.slice(0, target.lastIndexOf("/")), {
      recursive: true,
    });
    await Deno.writeTextFile(target, output);
  }
}

async function publishCommand(
  directory: string,
  dryRun: boolean,
): Promise<void> {
  const result = await new Deno.Command("deno", {
    cwd: directory,
    args: ["publish", "--allow-dirty", ...(dryRun ? ["--dry-run"] : [])],
    stdout: "inherit",
    stderr: "inherit",
  }).spawn().status;
  if (!result.success) {
    throw new Error(`deno publish exited with ${result.code}`);
  }
}

if (import.meta.main) {
  const [mode] = Deno.args;
  if (!["--prepare", "--check", "--publish"].includes(mode)) {
    throw new Error("Expected --prepare, --check or --publish");
  }
  await Deno.mkdir(".artifacts", { recursive: true });
  const directory = await Deno.makeTempDir({
    dir: ".artifacts",
    prefix: "jsr-release-",
  });
  let retain = false;
  try {
    await prepareRelease(directory);
    if (mode === "--prepare") {
      retain = true;
      console.log(directory);
    } else {
      await publishCommand(directory, true);
      if (mode === "--publish") await publishCommand(directory, false);
    }
  } finally {
    if (!retain) await Deno.remove(directory, { recursive: true });
  }
}
