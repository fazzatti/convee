const directory = ".artifacts/docs";
await Deno.mkdir(directory, { recursive: true });
const source = await Deno.readTextFile("README.md");
const blocks = [...source.matchAll(/```ts\n([\s\S]*?)\n```/g)];
if (!blocks.length) throw new Error("No public README examples were checked.");
for (const [index, block] of blocks.entries()) {
  const path = directory + "/example-" + index + ".ts";
  await Deno.writeTextFile(
    path,
    block[1].replaceAll('"jsr:@fifo/convee"', '"../../src/index.ts"'),
  );
  const result = await new Deno.Command("deno", {
    args: ["check", path],
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!result.success) throw new Error(new TextDecoder().decode(result.stderr));
}
console.log(blocks.length + " README examples type checked.");
