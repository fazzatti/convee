import { sourceFiles } from "./source.ts";

const destination = ".artifacts/package-consumer";
await Deno.mkdir(destination + "/package", { recursive: true });
function relative(from: string, to: string): string {
  const parents = from.split("/").slice(0, -1), children = to.split("/");
  while (parents[0] === children[0] && parents.length && children.length) {
    parents.shift();
    children.shift();
  }
  const path = [...parents.map(() => ".."), ...children].join("/");
  return path.startsWith(".") ? path : "./" + path;
}
for (const path of await sourceFiles()) {
  const target = path.replace(/^src\//, "");
  const output = destination + "/package/" + target;
  await Deno.mkdir(output.slice(0, output.lastIndexOf("/")), {
    recursive: true,
  });
  const source = await Deno.readTextFile(path);
  const rewritten = source.replace(
    /(["'])@\/([^"']+)\1/g,
    (_match, quote: string, imported: string) =>
      quote + relative(target, imported) + quote,
  );
  await Deno.writeTextFile(output, rewritten);
}
await Deno.writeTextFile(
  destination + "/deno.json",
  JSON.stringify({
    compilerOptions: {
      strict: true,
      noUnusedLocals: true,
      noUnusedParameters: true,
    },
  }),
);
await Deno.copyFile(
  "test/fixtures/package-consumer.ts",
  destination + "/consumer.ts",
);
const report: { command: string; passed: boolean }[] = [];
for (const command of ["check", "run"]) {
  const result = await new Deno.Command("deno", {
    args: [
      command,
      "--config",
      destination + "/deno.json",
      destination + "/consumer.ts",
    ],
    stdout: "piped",
    stderr: "piped",
  }).output();
  report.push({ command, passed: result.success });
  if (!result.success) {
    console.error(new TextDecoder().decode(result.stderr));
    Deno.exit(1);
  }
}
await Deno.writeTextFile(
  destination + "/report.json",
  JSON.stringify(
    {
      methodology:
        "Standalone source-package smoke test with explicit relative imports, no repository import aliases. Complemented by the real JSR publish dry run.",
      report,
    },
    null,
    2,
  ),
);
console.log("Isolated package consumer: type check and runtime passed.");
