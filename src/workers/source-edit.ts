/** Choose a binding that is absent from every identifier collected by the parser. */
export function freshName(base: string, identifiers: Set<string>): string {
  //@ verify
  //@ ensures !identifiers.has(\result)
  //@ ensures \result.startsWith(base)
  let binding = base;
  //@ ghost let remaining = identifiers
  while (identifiers.has(binding)) {
    //@ invariant binding.startsWith(base)
    //@ invariant forall(s: string, s.length >= binding.length ==> (identifiers.has(s) === remaining.has(s)))
    //@ decreases remaining.size
    //@ ghost remaining = remaining.delete(binding)
    binding += "_";
  }
  return binding;
}

/** Insert generated code at a parser-provided UTF-16 offset, preserving both source spans. */
export function insertSource(
  source: string,
  offset: number,
  insertion: string,
): string {
  //@ verify
  //@ requires 0 <= offset && offset <= source.length
  //@ ensures \result.length === source.length + insertion.length
  //@ ensures \result.slice(0, offset) === source.slice(0, offset)
  //@ ensures \result.slice(offset, offset + insertion.length) === insertion
  //@ ensures \result.slice(offset + insertion.length) === source.slice(offset)
  return source.slice(0, offset) + insertion + source.slice(offset);
}

/** Split on the original offsets so joining with an insertion preserves each source interval exactly. */
export function sourceIntervals(
  source: string,
  offsets: readonly number[],
): string[] {
  //@ verify
  //@ requires forall(k, 0 <= k && k < offsets.length ==> 0 <= offsets[k] && offsets[k] <= source.length)
  //@ requires forall(k, 0 < k && k < offsets.length ==> offsets[k - 1] < offsets[k])
  //@ ensures \result.length === offsets.length + 1
  //@ ensures forall(k, 0 <= k && k < offsets.length ==> \result[k] === source.slice(k === 0 ? 0 : offsets[k - 1], offsets[k]))
  //@ ensures \result[offsets.length] === source.slice(offsets.length === 0 ? 0 : offsets[offsets.length - 1])
  const parts: string[] = [];
  let start = 0;
  let i = 0;
  while (i < offsets.length) {
    //@ invariant 0 <= i && i <= offsets.length && parts.length === i
    //@ invariant start === (i === 0 ? 0 : offsets[i - 1])
    //@ invariant forall(k, 0 <= k && k < i ==> parts[k] === source.slice(k === 0 ? 0 : offsets[k - 1], offsets[k]))
    //@ decreases offsets.length - i
    const offset = offsets[i];
    parts.push(source.slice(start, offset));
    start = offset;
    i++;
  }
  parts.push(source.slice(start));
  return parts;
}
