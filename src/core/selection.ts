//@ declare-type Positions = number[]

/** Visit the original dense sequence once, retaining matching values in input order. */
export function retain<T>(
  items: readonly T[],
  keep: (item: T) => boolean,
): T[] {
  //@ verify
  //@ ensures \result.length <= items.length
  //@ ensures forall(x: T, (x in \result) === ((x in items) && keep(x)))
  //@ ensures exists(pos: Positions, pos.length === \result.length && forall(k, 0 <= k && k < pos.length ==> 0 <= pos[k] && pos[k] < items.length && \result[k] === items[pos[k]]) && forall(k, 0 <= k && k + 1 < pos.length ==> pos[k] < pos[k + 1]) && forall(j, 0 <= j && j < items.length ==> ((j in pos) === keep(items[j]))))
  const length = items.length;
  const kept: T[] = [];
  //@ ghost let pos: Positions = []
  let i = 0;
  while (i < length) {
    //@ invariant 0 <= i && i <= length && length === items.length
    //@ invariant kept.length <= i
    //@ invariant forall(x: T, (x in kept) === ((x in items.slice(0, i)) && keep(x)))
    //@ invariant pos.length === kept.length
    //@ invariant forall(k, 0 <= k && k < pos.length ==> 0 <= pos[k] && pos[k] < i && kept[k] === items[pos[k]])
    //@ invariant forall(k, 0 <= k && k + 1 < pos.length ==> pos[k] < pos[k + 1])
    //@ invariant forall(j, 0 <= j && j < i ==> ((j in pos) === keep(items[j])))
    //@ decreases length - i
    const item = items[i];
    if (keep(item)) {
      kept.push(item);
      //@ ghost pos = pos + [i]
    }
    i++;
  }
  return kept;
}
