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
for (const file of ["worker-consumer.ts", "worker-registry.ts"]) {
  await Deno.copyFile("test/fixtures/" + file, destination + "/" + file);
}
const report: { consumer: string; command: string; passed: boolean }[] = [];
for (const consumer of ["consumer.ts", "worker-consumer.ts"]) {
  for (const command of ["check", "run"]) {
    const result = await new Deno.Command("deno", {
      args: [
        command,
        ...(command === "run" && consumer === "worker-consumer.ts"
          ? [
            "--allow-read=" + destination + "/package," + destination +
            "/worker-registry.ts",
          ]
          : []),
        "--config",
        destination + "/deno.json",
        destination + "/" + consumer,
      ],
      stdout: "piped",
      stderr: "piped",
    }).output();
    report.push({ consumer, command, passed: result.success });
    if (!result.success) {
      console.error(new TextDecoder().decode(result.stderr));
      Deno.exit(1);
    }
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
console.log(
  "Isolated core and real-worker consumers: type checks and runtime passed.",
);
