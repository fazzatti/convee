export function readmeExamples(markdown: string): {
  source: string;
  line: number;
  file?: string;
}[] {
  return [...markdown.matchAll(
    /^```(?:ts|typescript)[ \t]*\r?\n([\s\S]*?)^```[ \t]*\r?$/gm,
  )].map((match) => ({
    source: match[1].replaceAll(
      /(["'])jsr:@fifo\/convee(\/(?:workers(?:\/vite)?|wasm(?:\/jco)?))?\1/g,
      (_match, _quote: string, entry: string | undefined) =>
        JSON.stringify("@convee" + (entry ?? "")),
    ),
    line: markdown.slice(0, match.index).split("\n").length + 1,
    ...(/^\/\/ ([a-z][a-z0-9.-]*\.ts)\r?\n/.test(match[1])
      ? { file: match[1].match(/^\/\/ ([a-z][a-z0-9.-]*\.ts)/)![1] }
      : {}),
  }));
}

export function exampleCompilerOptions(
  options: Record<string, unknown> = {},
): Record<string, unknown> {
  return { ...options, noUnusedLocals: false, noUnusedParameters: false };
}

async function checkExamples(): Promise<void> {
  const directory = ".artifacts/docs";
  const examples = readmeExamples(await Deno.readTextFile("README.md"));
  if (!examples.length) {
    throw new Error("No public README examples were checked.");
  }
  const project = JSON.parse(await Deno.readTextFile("deno.json"));
  await Deno.mkdir(directory, { recursive: true });
  const config = directory + "/deno.json";
  await Deno.writeTextFile(
    config,
    JSON.stringify({
      compilerOptions: exampleCompilerOptions(project.compilerOptions),
    }),
  );
  const paths = new Set<string>();
  for (const [index, example] of examples.entries()) {
    const path = directory + "/" + (example.file ?? "example-" + index + ".ts");
    if (paths.has(path)) {
      throw new Error("Duplicate README example file: " + path);
    }
    paths.add(path);
    await Deno.writeTextFile(path, example.source);
  }
  for (const [index, example] of examples.entries()) {
    const path = directory + "/" + (example.file ?? "example-" + index + ".ts");
    const result = await new Deno.Command("deno", {
      args: ["check", "--config", config, "--import-map", "deno.json", path],
      stdout: "piped",
      stderr: "piped",
    }).output();
    if (!result.success) {
      throw new Error(
        `README.md:${example.line}\n` +
          new TextDecoder().decode(result.stderr),
      );
    }
  }
  console.log(examples.length + " README examples type checked.");
}

if (import.meta.main) await checkExamples();
