import { ts } from "@tools/source.ts";

/** Copy the real Rust build into an isolated consumer with no repository aliases. */
export async function copyWasmFixture(
  destination: string,
  compiled: boolean,
): Promise<void> {
  for (const name of ["rust-text", "rust-host", "rust-abi", "component-pair"]) {
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
  await Deno.copyFile(
    "test/fixtures/wasm-abi-profile.json",
    destination + "/wasm-abi-profile.json",
  );
  for (
    const name of [
      "wasm-bindings",
      "wasm.worker",
      "wasm-abi.worker",
      "wasm-packet.worker",
      "wasm-consumer",
      "wasm-abi-cases",
    ]
  ) {
    const path = name === "wasm-abi-cases"
      ? "test/wasm/abi-cases.ts"
      : "test/fixtures/" + name + ".ts";
    const source = (await Deno.readTextFile(path))
      .replaceAll('"@convee/wasm"', '"./package/wasm/index.ts"')
      .replaceAll(
        '"@example/rust-abi/generated/abi.d.ts"',
        '"./rust-abi/abi.d.ts"',
      )
      .replaceAll(
        '"@test/fixtures/wasm-abi-profile.json"',
        '"./wasm-abi-profile.json"',
      );
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
