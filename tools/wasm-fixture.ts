import { ts } from "@tools/source.ts";

/** Copy the real Rust build into an isolated consumer with no repository aliases. */
export async function copyWasmFixture(
  destination: string,
  compiled: boolean,
): Promise<void> {
  for (const name of ["rust-text", "rust-host"]) {
    await Deno.mkdir(destination + "/" + name, { recursive: true });
    for await (const entry of Deno.readDir("examples/" + name + "/generated")) {
      if (!entry.isFile) continue;
      const source = "examples/" + name + "/generated/" + entry.name;
      if (compiled && entry.name === "modules.ts") {
        await Deno.writeTextFile(
          destination + "/" + name + "/modules.js",
          ts.transpileModule(await Deno.readTextFile(source), {
            compilerOptions: {
              target: ts.ScriptTarget.ES2022,
              module: ts.ModuleKind.ESNext,
            },
          }).outputText,
        );
      } else {await Deno.copyFile(
          source,
          destination + "/" + name + "/" + entry.name,
        );}
    }
  }
  for (const name of ["wasm-bindings", "wasm.worker", "wasm-consumer"]) {
    const source = await Deno.readTextFile("test/fixtures/" + name + ".ts");
    await Deno.writeTextFile(
      destination + "/" + name + (compiled ? ".js" : ".ts"),
      compiled
        ? ts.transpileModule(source.replace(/\.ts(["'])/g, ".js$1"), {
          compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ESNext,
          },
        }).outputText
        : source,
    );
  }
}
