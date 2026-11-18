import { prepareRelease } from "@tools/package-release.ts";
import { copyWasmFixture } from "@tools/wasm-fixture.ts";

await Deno.mkdir(".artifacts/package-consumer", { recursive: true });
const directory = await Deno.makeTempDir({
  dir: ".artifacts/package-consumer",
  prefix: "prepared-",
});
try {
  await checkPrepared(directory);
} finally {
  await Deno.remove(directory, { recursive: true });
}

async function checkPrepared(destination: string): Promise<void> {
  await prepareRelease(destination);
  const config = JSON.parse(
    await Deno.readTextFile(destination + "/deno.json"),
  );
  const entrypoints = Object.values(config.exports) as string[];
  const checked = await new Deno.Command("deno", {
    cwd: destination,
    args: ["check", "--config", "deno.json", ...entrypoints],
  }).output();
  if (!checked.success) {
    throw new Error(new TextDecoder().decode(checked.stderr));
  }
  for (
    const [fixture, local] of [
      ["package-consumer", "consumer"],
      ["worker-consumer", "worker-consumer"],
      ["worker-registry", "worker-registry"],
      ["concurrency-consumer", "concurrency-consumer"],
    ]
  ) {
    const source = await Deno.readTextFile("test/fixtures/" + fixture + ".ts");
    await Deno.writeTextFile(
      destination + "/" + local + ".ts",
      source.replaceAll('"./package/', '"./src/'),
    );
  }
  await copyWasmFixture(destination, false);
  const report: { consumer: string; command: string; passed: boolean }[] = [];
  for (
    const consumer of [
      "consumer.ts",
      "worker-consumer.ts",
      "wasm-consumer.ts",
      "concurrency-consumer.ts",
    ]
  ) {
    for (const command of ["check", "run"]) {
      const result = await new Deno.Command("deno", {
        args: [
          command,
          ...(command === "run" && consumer === "wasm-consumer.ts"
            ? ["--allow-env=JCO_DEBUG", "--allow-read=" + destination]
            : []),
          ...(command === "run" && consumer === "worker-consumer.ts"
            ? [
              "--allow-read=" + destination + "/src," + destination +
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
        throw new Error(
          "Prepared consumer failed: " + consumer + " " + command,
        );
      }
    }
  }
  await Deno.writeTextFile(
    ".artifacts/package-consumer/report.json",
    JSON.stringify(
      {
        methodology:
          "All configured entrypoints checked and consumer fixtures run on the prepared publish sources with the packaged import map.",
        entrypoints,
        report,
      },
      null,
      2,
    ),
  );
  console.log(
    "Isolated core and real-worker consumers: type checks and runtime passed.",
  );
}
