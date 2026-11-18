include "../../verification/src/core/job-tree.dfy"

// Empty/Cons represent arrays, including empty arrays. A Leaf denotes one
// occurrence, even where a JavaScript descriptor object is reused.
datatype Tree<T> = Empty | Leaf(value: T) | Cons(first: Tree<T>, rest: Tree<T>)

function Size<T>(t: Tree<T>): nat {
  match t case Empty => 0 case Leaf(_) => 1 case Cons(a,b) => Size(a)+Size(b)
}
function Flatten<T>(t: Tree<T>): seq<T> {
  match t case Empty => [] case Leaf(x) => [x] case Cons(a,b) => Flatten(a)+Flatten(b)
}
ghost predicate SameShape<T,U>(t: Tree<T>, u: Tree<U>) {
  match t
  case Empty => u.Empty?
  case Leaf(_) => u.Leaf?
  case Cons(a,b) => u.Cons? && SameShape(a,u.first) && SameShape(b,u.rest)
}
ghost predicate InBounds(t: Tree<int>, n: nat) {
  match t case Empty => true case Leaf(i) => 0 <= i < n
  case Cons(a,b) => InBounds(a,n) && InBounds(b,n)
}
function NumberLeaves<T>(t: Tree<T>, offset: nat): Tree<int>
  requires offset + Size(t) <= 4294967295
{
  match t
  case Empty => Empty
  case Leaf(_) => Leaf(appendedIndex(offset+1))
  case Cons(a,b) => Cons(NumberLeaves(a,offset),NumberLeaves(b,offset+Size(a)))
}
function Join<T>(t: Tree<int>, outcomes: seq<T>): Tree<T>
  requires InBounds(t,|outcomes|)
{
  match t case Empty => Empty case Leaf(i) => Leaf(leafValue(outcomes,i))
  case Cons(a,b) => Cons(Join(a,outcomes),Join(b,outcomes))
}

lemma RoundTrip<T,U>(t: Tree<T>, outcomes: seq<U>, offset: nat)
  requires offset + Size(t) <= |outcomes| <= 4294967295
  ensures InBounds(NumberLeaves(t,offset),|outcomes|)
  ensures var result := Join(NumberLeaves(t,offset),outcomes);
    SameShape(t,result) && Flatten(result) == outcomes[offset..offset+Size(t)]
  decreases t
{
  match t {
    case Empty =>
    case Leaf(_) => assert outcomes[offset..offset+1] == [outcomes[offset]];
    case Cons(a,b) =>
      RoundTrip(a,outcomes,offset);
      RoundTrip(b,outcomes,offset+Size(a));
      assert outcomes[offset..offset+Size(t)] ==
        outcomes[offset..offset+Size(a)] + outcomes[offset+Size(a)..offset+Size(t)];
  }
}
