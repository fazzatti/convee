interface CaptureFields {
  input: boolean;
  output: boolean;
  error: boolean;
}

/** Select every retained field on frame exit, so old values cannot leak across runs. */
export function captureFields(mode: string): CaptureFields {
  //@ verify
  //@ ensures \result.input === (mode === "all")
  //@ ensures \result.error === \result.input
  //@ ensures \result.output === (mode === "outputs" || mode === "all")
  const full = mode === "all";
  return { input: full, output: full || mode === "outputs", error: full };
}

/** Overwrite omitted fields on every completion, even when a previous run retained a value. */
export function retainedValue<T>(keep: boolean, value: T): T | undefined {
  //@ verify
  //@ ensures keep ==> \result === value
  //@ ensures !keep ==> \result === undefined
  return keep ? value : undefined;
}
