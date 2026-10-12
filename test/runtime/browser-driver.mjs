import { fileURLToPath } from "node:url";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { build, createServer, preview } from "vite";
import { chromium, firefox, webkit } from "playwright";
const location = new URL("../../.artifacts/runtime-consumer/", import.meta.url);
const { conveeWorkers } = await import(
  new URL("./package/workers/vite.js", location).href
);
const root = fileURLToPath(location);
// Model an installed SDK that exposes native Convee steps. Vite must prebundle
// the SDK without embedding a second copy of Convee's private context registry.
const sdk = new URL("./node_modules/@convee-fixture/sdk/", location);
await mkdir(sdk, { recursive: true });
await writeFile(
  new URL("package.json", sdk),
  JSON.stringify({
    name: "@convee-fixture/sdk",
    version: "1.0.0",
    type: "module",
    exports: "./index.js",
  }),
);
await writeFile(
  new URL("index.js", sdk),
  'export { step } from "@fifo/convee";\n',
);
const registryPath = new URL("./browser.worker.js", location);
const registry = await readFile(registryPath, "utf8");
if (!registry.includes("pipe, plugin, step")) {
  throw new Error("Missing step import for the installed-SDK worker fixture");
}
await writeFile(
  registryPath,
  registry.replace("pipe, plugin, step", "pipe, plugin") +
    '\nimport { step } from "@convee-fixture/sdk";\n',
);
const config = {
  configFile: false,
  root,
  clearScreen: false,
  logLevel: "warn",
  plugins: [conveeWorkers()],
  optimizeDeps: { include: ["@convee-fixture/sdk"] },
  resolve: {
    alias: {
      "@fifo/convee": fileURLToPath(new URL("./package/index.js", location)),
      "@convee/workers": fileURLToPath(
        new URL("./package/workers/index.js", location),
      ),
    },
  },
  build: { outDir: "dist", target: "esnext", sourcemap: true },
  server: { host: "127.0.0.1", port: 0 },
  preview: { host: "127.0.0.1", port: 0 },
};
const report = [];
async function inspect(url, mode) {
  for (
    const [name, engine] of [["chromium", chromium], ["firefox", firefox], [
      "webkit",
      webkit,
    ]]
  ) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") {
          console.error("browser console: " + message.text());
        }
      });
      page.on(
        "requestfailed",
        (request) =>
          console.error(
            "request failed: " + request.url() + " " +
              request.failure()?.errorText,
          ),
      );
      await page.addInitScript(() => {
        globalThis.__conveeForeignSignal = () => {
          const frame = document.createElement("iframe");
          document.body.append(frame);
          try {
            return new frame.contentWindow.AbortController().signal;
          } finally {
            frame.remove();
          }
        };
        const Original = globalThis.Worker;
        const active = new Set();
        globalThis.__conveeWorkers = { active, started: 0 };
        globalThis.Worker = class extends Original {
          constructor(...args) {
            super(...args);
            active.add(this);
            globalThis.__conveeWorkers.started++;
          }
          terminate() {
            super.terminate();
            active.delete(this);
          }
        };
      });
      const response = await page.goto(url);
      console.log("Opened " + url + " status=" + response.status());
      try {
        await page.waitForFunction(
          () =>
            globalThis.__conveeReport?.passed &&
            globalThis.__conveeWasmReport?.passed &&
            globalThis.__conveeConcurrencyReport?.passed,
          null,
          { timeout: 30000, polling: 50 },
        );
      } catch (error) {
        const state = await page.evaluate(() => ({
          stage: globalThis.__conveeStage,
          report: globalThis.__conveeReport,
          started: globalThis.__conveeWorkers?.started,
          remaining: globalThis.__conveeWorkers?.active.size,
        }));
        throw new Error(
          JSON.stringify({ name, mode, errors, state, message: String(error) }),
        );
      }
      const evidence = await page.evaluate(() => ({
        report: globalThis.__conveeReport,
        wasm: globalThis.__conveeWasmReport,
        concurrency: globalThis.__conveeConcurrencyReport,
        started: globalThis.__conveeWorkers.started,
        remaining: globalThis.__conveeWorkers.active.size,
      }));
      if (evidence.remaining !== 0 || evidence.started < 10 || errors.length) {
        throw new Error(JSON.stringify({ name, mode, evidence, errors }));
      }
      report.push({
        engine: name,
        version: browser.version(),
        mode,
        ...evidence,
      });
      console.log(
        `${name} ${browser.version()} ${mode}: ${evidence.report.checks.length} checks, ${evidence.started} workers created, ${evidence.remaining} remaining`,
      );
    } finally {
      await browser.close();
    }
  }
}
const server = await createServer(config);
try {
  await server.listen();
  await inspect(server.resolvedUrls.local[0], "development");
} finally {
  await server.close();
}
await build(config);
const built = await preview(config);
try {
  await inspect(built.resolvedUrls.local[0], "production");
} finally {
  await new Promise((resolve, reject) =>
    built.httpServer.close((error) => error ? reject(error) : resolve())
  );
}
await writeFile(
  new URL("./browser-report.json", location),
  JSON.stringify(report, null, 2),
);
