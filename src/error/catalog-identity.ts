interface Identity {
  readonly code: string;
  readonly domain: string;
  readonly source?: string;
}

/** Test a branded error's complete catalog identity, in property access order. */
export function sameCatalog(actual: Identity, expected: Identity): boolean {
  //@ verify
  //@ ensures \result === (actual.code === expected.code && actual.domain === expected.domain && actual.source === expected.source)
  return actual.code === expected.code && actual.domain === expected.domain &&
    actual.source === expected.source;
}
