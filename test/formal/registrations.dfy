include "../../verification/src/core/sequences.dfy"
include "../../verification/src/core/selection.dfy"

function Select<T(!new)>(xs: seq<T>, keep: T -> bool): seq<T>
  decreases |xs|
{
  if |xs| == 0 then [] else
    (if keep(xs[0]) then [xs[0]] else []) + Select(xs[1..],keep)
}

ghost predicate Matches<T(!new)>(xs:seq<T>, ys:seq<T>, pos:seq<int>, keep:T -> bool) {
  |pos| == |ys| &&
  (forall k :: 0 <= k < |pos| ==> 0 <= pos[k] < |xs| && ys[k] == xs[pos[k]]) &&
  (forall k :: 0 <= k && k+1 < |pos| ==> pos[k] < pos[k+1]) &&
  (forall j :: 0 <= j < |xs| ==> (j in pos) == keep(xs[j]))
}

lemma Increasing(pos:seq<int>, i:nat, j:nat)
  requires i <= j < |pos|
  requires forall k :: 0 <= k && k+1 < |pos| ==> pos[k] < pos[k+1]
  ensures i < j ==> pos[i] < pos[j]
  decreases j-i
{
  if i < j { Increasing(pos,i,j-1); }
}

lemma Canonical<T(!new)>(xs:seq<T>, ys:seq<T>, pos:seq<int>, keep:T -> bool)
  requires Matches(xs,ys,pos,keep)
  ensures ys == Select(xs,keep)
  decreases |xs|
{
  if |xs| == 0 {
    if |pos| > 0 { assert 0 <= pos[0] < |xs|; }
    return;
  }
  var skip := if keep(xs[0]) then 1 else 0;
  if skip == 1 {
    assert 0 in pos;
    var h :| 0 <= h < |pos| && pos[h] == 0;
    Increasing(pos,0,h);
    assert pos[0] == 0;
    assert ys[0] == xs[0];
  } else {
    assert 0 !in pos;
  }
  var rest := seq(|pos|-skip, k requires 0 <= k < |pos|-skip => pos[k+skip]-1);
  forall k | 0 <= k < |rest|
    ensures 0 <= rest[k] < |xs[1..]| && ys[skip..][k] == xs[1..][rest[k]]
  {
    if skip == 1 { Increasing(pos,0,k+skip); }
    assert pos[k+skip] != 0;
  }
  forall j | 0 <= j < |xs[1..]|
    ensures (j in rest) == keep(xs[1..][j])
  {
    if j+1 in pos {
      var h :| 0 <= h < |pos| && pos[h] == j+1;
      assert h >= skip;
      assert rest[h-skip] == j;
    } else if j in rest {
      var h :| 0 <= h < |rest| && rest[h] == j;
      assert pos[h+skip] == j+1;
    }
  }
  assert Matches(xs[1..],ys[skip..],rest,keep);
  Canonical(xs[1..],ys[skip..],rest,keep);
  assert ys == ys[..skip] + ys[skip..];
}

method Selected<T(!new)>(xs:seq<T>, keep:T -> bool) returns (ys:seq<T>)
  ensures ys == Select(xs,keep)
{
  ys := retain(xs,keep);
  ghost var pos: Positions :|
    |pos| == |ys| &&
    (forall k: int :: 0 <= k ==> k < |pos| ==> 0 <= pos[k] < |xs| && ys[k] == xs[pos[k]]) &&
    (forall k: int :: 0 <= k ==> k+1 < |pos| ==> pos[k] < pos[k+1]) &&
    (forall j: int :: 0 <= j ==> j < |xs| ==> (j in pos) == keep(xs[j]));
  assert Matches(xs,ys,pos,keep);
  Canonical(xs,ys,pos,keep);
}

lemma Concatenates<T(!new)>(left:seq<T>, right:seq<T>, keep:T -> bool)
  ensures Select(left+right,keep) == Select(left,keep) + Select(right,keep)
  decreases |left|
{
  if |left| > 0 {
    assert (left+right)[0] == left[0];
    assert (left+right)[1..] == left[1..]+right;
    Concatenates(left[1..],right,keep);
  } else { assert left + right == right; }
}

method RegistrationComposition<T(!new)>(persistent:seq<T>, temporary:seq<T>, keep:T -> bool)
  returns (all:seq<T>, left:seq<T>, right:seq<T>)
  ensures all == left + right
{
  all := Selected(registrationsForRun(persistent,temporary),keep);
  left := Selected(persistent,keep);
  right := Selected(temporary,keep);
  Concatenates(persistent,temporary,keep);
}
