/** Match an untargeted registration or an exact invocation identifier. */
export function matchesPluginTarget(
  target: string | undefined,
  id: string,
): boolean {
  //@ verify
  //@ ensures target === undefined ==> \result
  //@ ensures target !== undefined ==> (\result === (target === id))
  return target === undefined || target === id;
}
