import { sourceFiles, ts } from "@tools/source.ts";
import { copyWasmFixture } from "@tools/wasm-fixture.ts";

const destination = ".artifacts/runtime-consumer";
await Deno.mkdir(destination + "/package", { recursive: true });
function relative(from: string, to: string): string {
  const parents = from.split("/").slice(0, -1), children = to.split("/");
  while (parents.length && children.length && parents[0] === children[0]) {
    parents.shift();
    children.shift();
  }
  const value = [...parents.map(() => ".."), ...children].join("/");
  return value.startsWith(".") ? value : "./" + value;
}
for (const path of await sourceFiles()) {
  const target = path.replace(/^src\//, "").replace(/\.ts$/, ".js");
  const output = destination + "/package/" + target;
  await Deno.mkdir(output.slice(0, output.lastIndexOf("/")), {
    recursive: true,
  });
  const source = (await Deno.readTextFile(path)).replace(
    /(["'])@\/([^"']+)\1/g,
    (_match, quote, imported) => quote + relative(target, imported) + quote,
  ).replace(/\.ts(["'])/g, ".js$1");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  });
  await Deno.writeTextFile(output, compiled.outputText);
}
for (const file of ["worker-registry", "worker-consumer"]) {
  const source = (await Deno.readTextFile(`test/fixtures/${file}.ts`)).replace(
    /\.ts(["'])/g,
    ".js$1",
  );
  await Deno.writeTextFile(
    `${destination}/${file}.js`,
    ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    }).outputText,
  );
}
await Deno.writeTextFile(
  destination + "/package.json",
  JSON.stringify({ type: "module", private: true }),
);
const runtimes = Deno.args.length ? Deno.args : ["node", "bun", "browsers"];
await copyWasmFixture(destination, true);
await Deno.writeTextFile(
  destination + "/run.js",
  'await import("./worker-consumer.js");\nawait import("./wasm-consumer.js");\n',
);
const report: unknown[] = [];
for (const runtime of runtimes) {
  if (runtime === "browsers") {
    const source = await Deno.readTextFile(destination + "/worker-registry.js");
    await Deno.writeTextFile(
      destination + "/browser.worker.js",
      source.replace('"./package/workers/index.js"', '"@convee/workers"'),
    );
    const consumer = await Deno.readTextFile(
      destination + "/worker-consumer.js",
    );
    await Deno.writeTextFile(
      destination + "/browser.js",
      consumer.replace('"./worker-registry.js"', '"./browser.worker.js"') +
        '\nawait import("./wasm-consumer.js");\n',
    );
    for (
      const name of ["wasm.worker", "wasm-abi.worker", "wasm-packet.worker"]
    ) {
      const wasmWorker = await Deno.readTextFile(
        destination + "/" + name + ".js",
      );
      await Deno.writeTextFile(
        destination + "/" + name + ".js",
        wasmWorker.replace('"./package/workers/index.js"', '"@convee/workers"'),
      );
    }
    await Deno.writeTextFile(
      destination + "/index.html",
      '<!doctype html><html><head><meta charset="utf-8"><title>Convee worker consumer</title></head><body><script type="module" src="/browser.js"></script></body></html>',
    );
  }
  const binary = runtime === "bun" ? "bun" : "node";
  const version = await new Deno.Command(binary, {
    args: ["--version"],
    stdout: "piped",
  }).output();
  const process = new Deno.Command(binary, {
    args: [
      runtime === "browsers"
        ? "test/runtime/browser-driver.mjs"
        : destination + "/run.js",
    ],
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  const timer = setTimeout(() => process.kill("SIGKILL"), 300000);
  const result = await process.output();
  clearTimeout(timer);
  const stdout = new TextDecoder().decode(result.stdout),
    stderr = new TextDecoder().decode(result.stderr);
  await Deno.writeTextFile(
    destination + "/" + runtime + ".log",
    stdout + stderr,
  );
  report.push({
    runtime,
    version: new TextDecoder().decode(version.stdout).trim(),
    success: result.success,
    exitCode: result.code,
    output: stdout,
  });
  console.log(
    `${runtime}: ${result.success ? "passed" : "failed"} (${result.code})`,
  );
  if (!result.success) {
    console.error(stderr);
    await Deno.writeTextFile(
      destination + "/report.json",
      JSON.stringify(report, null, 2),
    );
    Deno.exit(1);
  }
}
await Deno.writeTextFile(
  destination + "/report.json",
  JSON.stringify(report, null, 2),
);
