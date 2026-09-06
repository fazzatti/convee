const directory = ".artifacts/type-depth";
await Deno.mkdir(directory, { recursive: true });
const declarations: string[] = [];
for (const size of [10, 25, 50, 100]) {
  for (const sync of [false, true]) {
    const nodes = Array.from(
      { length: size },
      () => "(value: number) => value + 1",
    ).join(",\n");
    declarations.push(
      `const graph${size}${sync} = pipe${
        sync ? ".sync" : ""
      }([${nodes}]);\nconst result${size}${sync}: ${
        sync ? "number" : "Promise<number>"
      } = graph${size}${sync}(1);\nvoid result${size}${sync};`,
    );
    const levels = Array.from(
      { length: size },
      (_, index) =>
        `const nested${size}${sync}_${index} = pipe${sync ? ".sync" : ""}([${
          index
            ? `nested${size}${sync}_${index - 1}`
            : "(value: number) => value"
        }]);`,
    ).join("\n");
    declarations.push(
      levels +
        `\nconst nestedResult${size}${sync}: ${
          sync ? "number" : "Promise<number>"
        } = nested${size}${sync}_${
          size - 1
        }(1); void nestedResult${size}${sync};`,
    );
  }
}
const path = `${directory}/consumer.ts`;
await Deno.writeTextFile(
  path,
  `import { pipe } from "../../src/index.ts";\n${declarations.join("\n")}\n`,
);
const start = performance.now();
const result = await new Deno.Command("deno", {
  args: ["check", path],
  stdout: "piped",
  stderr: "piped",
}).output();
const report = {
  passed: result.success,
  elapsedMs: performance.now() - start,
  sizes: [10, 25, 50, 100],
  shapes: ["flat", "nested"],
  modes: ["sync", "async"],
};
await Deno.writeTextFile(
  `${directory}/report.json`,
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report));
if (!result.success) {
  console.error(new TextDecoder().decode(result.stderr));
  Deno.exit(1);
}
