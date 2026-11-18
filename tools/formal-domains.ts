// Give each reviewed production contract an independent, reachable call. A new
// impossible precondition or a missing theorem must break this gate on CI.
const examples: Record<string, [string, string]> = {
  retainedValue: ["true,42", "Some(42)"],
  captureFields: ['"all"', "CaptureFields(true,true,true)"],
  fitsCapacity: ["3,2,5", "true"],
  admittedOccupancy: ["3,3,5", "-1"],
  nextRestart: ["2,2", "2"],
  firstEligible: ["[1,2,3],3,(x:int) => x>1", "-1"],
  mapChildren: ["[1,2],(x:int) => x+1", "[2,3]"],
  appendedIndex: ["1", "0"],
  leafValue: ["[2,5],1", "5"],
  branchAllowed: ["false,256", "true"],
  afterRelease: ["1", "0"],
  phaseAfterClose: ["true,true", "OwnerPhase.closed"],
  ownerAccepts: ["OwnerPhase.dormant,false", "true"],
  matchesPluginTarget: ['None,"s"', "true"],
  retain: ["[],(x:int) => x==1", "[]"],
  registrationsForRun: ["[1,2],[2,3]", "|result| == 4 && result[0] == 1"],
  copyArguments: ["[1,2]", "[1,2]"],
  singleArgument: ["2", "[2]"],
  sameCatalog: ['Identity("a","b",None),Identity("a","b",None)', "true"],
  diagnosticWidth: ["101", "100"],
  mayProject: ["1,7", "true"],
  remainingVisits: ["0", "0"],
  includesRegistration: ['None,"s",false', "false"],
  childConflicts: ['"p","s",true,false', "true"],
  orderedFailures: ["Some(1),[2,3]", "|result| == 3 && result[0] == 1"],
  completionDisposition: ["true,1", "Disposition.throw_finalization"],
  inputAction: ["false,1", "InputAction.wrap"],
  afterPhase: ["WorkPhase.run,true", "NextPhase.error"],
  hexByte: ["15", '"0f"'],
  canClassifyGuestFailure: ["false,false", "false"],
  afterHostWork: ["HostPhase.failed", "HostPhase.failed"],
  acceptsRequest: ["HostPhase.ready,RequestKind.run", "true"],
  replyBelongs: ['true,Some(JobId("job")),JobId("other")', "false"],
  mayDispatch: ["false,true,false,1", "true"],
  freshName: ['"x",{"x"}', 'result != "x" && result[0..1] == "x"'],
  sourceIntervals: ['"abc",[0,2,3]', '|result| == 4 && result[3] == ""'],
  insertSource: ['"abc",2,"x"', '"abxc"'],
  occupancy: ["0,2", "2"],
  dispatchCounts: ["1,2,1", "RunningCounts(3,2)"],
  settleCounts: ["2,1", "RunningCounts(1,0)"],
};
const checked = new Set<string>();
const modules: string[] = [];
const entries = (await Deno.readTextFile("LemmaScript-files.txt")).trim().split(
  /\s+/,
);
for (const [index, entry] of entries.entries()) {
  const proof = await Deno.readTextFile(
    "verification/" + entry.replace(/\.ts$/, ".dfy"),
  );
  const witnesses: string[] = [];
  for (
    const contract of proof.matchAll(
      /^(?:lemma (\w+)_ensures|method (\w+))\b[^\n]*\n((?: {2}[^\n]+\n)*)/gm,
    )
  ) {
    const name = contract[1] ?? contract[2];
    const example = examples[name];
    if (!example || checked.has(name) || !/^ {2}ensures /m.test(contract[3])) {
      throw new Error(
        "Missing, duplicate or unspecified production contract: " + name,
      );
    }
    checked.add(name);
    const [args, expected] = example;
    witnesses.push(`method Domain_${name}() {
      ${contract[1] ? name + "_ensures(" + args + ");" : ""}
      ${name === "hexByte" ? "reveal JSFloorDiv(); reveal JSRem();" : ""}
      var result := ${name}(${args});
      assert ${
      expected.includes("result") ? expected : "result == " + expected
    };
    }`);
  }
  modules.push(`module Proof${index} {\n${proof}\n${witnesses.join("\n")}\n}`);
}
for (const name of Object.keys(examples)) {
  if (!checked.has(name)) {
    throw new Error("Reviewed production contract disappeared: " + name);
  }
}
const path = await Deno.makeTempFile({ dir: ".artifacts", suffix: ".dfy" });
async function verifyWitnesses(source: string, filter: string) {
  await Deno.writeTextFile(path, source);
  const run = await new Deno.Command("dafny", {
    args: [
      "verify",
      "--unicode-char:false",
      "--allow-deprecation",
      "--default-function-opacity",
      "Opaque",
      "--filter-symbol",
      filter,
      path,
    ],
  }).output();
  return {
    success: run.success,
    output: new TextDecoder().decode(run.stdout) +
      new TextDecoder().decode(run.stderr),
  };
}
try {
  const source = modules.join("\n");
  const { success, output } = await verifyWitnesses(source, "Domain_");
  if (
    !success ||
    Number(/finished with (\d+) verified, 0 errors/.exec(output)?.[1]) !==
      checked.size
  ) throw new Error(output);
  console.log(
    checked.size +
      " reviewed production contracts have checked, reachable examples.",
  );
  if (Deno.args.includes("--faults")) {
    const faults: [string, string, string, string, RegExp][] = [
      [
        "missing success clause",
        "inputAction",
        "  ensures (!(isTuple) ==> (arity == 1) ==> inputAction(isTuple, arity).wrap?)",
        "",
        /assertion might not hold/,
      ],
      [
        "empty admission domain",
        "fitsCapacity",
        "function fitsCapacity(used: int, requested: int, limit: int): bool",
        "function fitsCapacity(used: int, requested: int, limit: int): bool\n  requires used < 0",
        /precondition could not be proved/,
      ],
    ];
    for (const [name, target, original, broken, diagnostic] of faults) {
      if (source.split(original).length !== 2) {
        throw new Error("Ambiguous contract fault: " + name);
      }
      const result = await verifyWitnesses(
        source.replace(original, broken),
        "Domain_" + target,
      );
      if (result.success || !diagnostic.test(result.output)) {
        throw new Error(name + ": " + result.output);
      }
      console.log("Rejected contract fault: " + name);
    }
  }
} finally {
  await Deno.remove(path);
}
