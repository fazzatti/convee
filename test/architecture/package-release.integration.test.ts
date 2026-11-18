import { assertEquals, assertThrows } from "@std/assert";
import { parse, sourceFiles, ts } from "@tools/source.ts";
import { describe, it } from "@std/testing/bdd";
import { stripProofComments } from "@tools/package-release.ts";

describe("Release source preparation", () => {
  it("removes only proof comments while preserving TSDoc, directives, literals and line breaks", () => {
    const source = [
      "//@ backend dafny",
      "/** The literal text //@ verify belongs to the API documentation. */",
      "export function example(n: number) {",
      "  //@ verify",
      "  //@ ensures true",
      "  // @ts-expect-error example",
      '  const a = "//@ assert keep";',
      "  const b = `start\n//@ invariant keep\n${a}\n//@ assert keep`;",
      "  while (n > 0) {",
      "    //@ invariant n >= 0",
      "    n--; //@ assert true",
      "  }",
      "  return b;",
      "}",
      "//@ option safe-slice true",
    ].join("\r\n");
    const expected = source.replaceAll("//@ backend dafny", "").replace(
      "  //@ verify",
      "  ",
    )
      .replace("//@ ensures true", "").replace("//@ invariant n >= 0", "")
      .replace("//@ assert true", "").replace("//@ option safe-slice true", "");
    assertEquals(stripProofComments("example.ts", source), expected);
  });
  it("includes every annotated production file in the proof manifest", async () => {
    const selected: string[] = [];
    for (const path of await sourceFiles()) {
      const input = await Deno.readTextFile(path);
      if (stripProofComments(path, input) !== input) selected.push(path);
    }
    const manifest = (await Deno.readTextFile("LemmaScript-files.txt")).trim()
      .split(/\r?\n/).map((line) => line.trim().split(/\s+/)[0]).sort();
    assertEquals(manifest, selected);
  });
  it("preserves the syntax tokens and public TSDoc of every prepared production module", async () => {
    const tokens = (path: string, text: string) => {
      const file = parse(path, text);
      const values: string[] = [];
      function visit(node: ts.Node): void {
        if (ts.isJSDoc(node) || ts.isToken(node)) {
          values.push(node.getText(file));
        } else node.getChildren(file).forEach(visit);
      }
      visit(file);
      return values;
    };
    for (const path of await sourceFiles()) {
      const input = await Deno.readTextFile(path);
      const output = stripProofComments(path, input);
      assertEquals(tokens(path, output), tokens(path, input), path);
      assertEquals(stripProofComments(path, output), output, path);
    }
  });
  it("rejects an unknown proof directive before preparing a release", () => {
    assertThrows(
      () => stripProofComments("bad.ts", "//@ unknown\nexport const n = 1;"),
      Error,
      "Unrecognized",
    );
  });
});
