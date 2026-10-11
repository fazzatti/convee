import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { componentNew, transpile } from "@bytecodealliance/jco";

for (const name of ["text", "host"]) {
  const example = new URL("../rust-" + name + "/", import.meta.url);
  const root = fileURLToPath(example);
  execFileSync("cargo", [
    "build",
    "--locked",
    "--release",
    "--target",
    "wasm32-unknown-unknown",
  ], { cwd: root, stdio: "inherit" });
  const core = await readFile(
    new URL(
      "./target/wasm32-unknown-unknown/release/convee_rust_" + name + ".wasm",
      example,
    ),
  );
  const component = await componentNew(core);
  const output = await transpile(component, {
    name,
    instantiation: "async",
    base64Cutoff: 0,
    wasiShim: false,
    nodejsCompat: false,
    noComponentErrorWrapping: true,
  });
  if (name === "text" && output.imports.length) {
    throw new Error("The portable example must remain import-free.");
  }
  const destination = new URL("./generated/", example);
  await mkdir(destination, { recursive: true });
  for (const [name, bytes] of Object.entries(output.files)) {
    await writeFile(new URL(name, destination), bytes);
  }
  const entries = Object.entries(output.files).filter(([name]) =>
    name.endsWith(".wasm")
  );
  const manifest = entries.map(([name, bytes]) =>
    "  " + JSON.stringify(name) + ": { source: new URL(" +
    JSON.stringify("./" + name) +
    ", import.meta.url), sha256: " +
    JSON.stringify(createHash("sha256").update(bytes).digest("hex")) + " },"
  ).join("\n");
  await writeFile(
    new URL("modules.ts", destination),
    "/**\n * Generated asset manifest pairing this build's glue with its core modules.\n * Pass to jcoBindings; URLs resolve beside this file without starting execution.\n * SHA-256 mismatches reject preparation. Regenerate with npm run build.\n */\nexport const modules = {\n" +
      manifest + "\n};\n",
  );
  console.log(JSON.stringify(
    {
      rust: execFileSync("rustc", ["--version"], { encoding: "utf8" }).trim(),
      jco: "1.37.0",
      assets: Object.fromEntries(
        Object.entries(output.files).map((
          [name, bytes],
        ) => [name, bytes.length]),
      ),
    },
    null,
    2,
  ));
}
