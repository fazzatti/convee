import { sourceFiles } from "@tools/source.ts";
import { stripProofComments } from "@tools/package-release.ts";

// Production contracts must match their translations. Composition suites can
// import these files and add independently checked statements about their use.
const entries = (await Deno.readTextFile("LemmaScript-files.txt")).trim()
  .split(/\r?\n/).map((line) => line.trim().split(/\s+/)[0]);
const selected = new Set(entries);
for (const path of await sourceFiles()) {
  const input = await Deno.readTextFile(path);
  if ((stripProofComments(path, input) !== input) !== selected.has(path)) {
    throw new Error(
      "Proof manifest and production annotations disagree: " + path,
    );
  }
}
const expected = new Set<string>();
let contracts = 0;
for (const entry of entries) {
  const proof = "verification/" + entry.replace(/\.ts$/, ".dfy");
  if (expected.has(proof)) {
    throw new Error("Duplicate manifest entry: " + entry);
  }
  expected.add(proof);
  expected.add(proof + ".gen");
  const source = await Deno.readTextFile(proof);
  if (source !== await Deno.readTextFile(proof + ".gen")) {
    throw new Error(
      "Proved file differs from current production translation: " + proof,
    );
  }
  checkTrust(proof, source);
  const clauses = source.match(/^\s*ensures\s/gm);
  if (!clauses) throw new Error("No postconditions in " + proof);
  contracts += clauses.length;
}

function checkTrust(proof: string, source: string): void {
  if (
    /\bassume\b|\{:\s*(?:axiom|verify\s+false)\b|\bdecreases\s+\*/.test(source)
  ) {
    throw new Error("Unexpected trusted or unchecked proof in " + proof);
  }
}

async function checkDirectory(path: string): Promise<void> {
  for await (const entry of Deno.readDir(path)) {
    const child = path + "/" + entry.name;
    if (entry.isDirectory) await checkDirectory(child);
    else if (/\.dfy(?:\.gen)?$/.test(child) && !expected.has(child)) {
      throw new Error("Proof without a production manifest entry: " + child);
    }
  }
}
await checkDirectory("verification");
for await (const entry of Deno.readDir("test/formal")) {
  if (!entry.isFile || !entry.name.endsWith(".dfy")) {
    throw new Error("Unexpected composition suite: " + entry.name);
  }
  const path = "test/formal/" + entry.name;
  const source = await Deno.readTextFile(path);
  checkTrust(path, source);
  for (const directive of source.matchAll(/^\s*include\s+"([^"]+)"\s*$/gm)) {
    const ref = directive[1];
    if (
      !ref.startsWith("../../") || !expected.has(ref.slice(6)) ||
      !ref.endsWith(".dfy")
    ) {
      throw new Error("Composition suite imports an unaudited proof: " + ref);
    }
  }
}
console.log(
  entries.length + " production proof files, " + contracts +
    " generated postcondition clauses.",
);
