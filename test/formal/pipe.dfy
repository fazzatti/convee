include "../../verification/src/core/sequences.dfy"

// A callback that settles supplies one outcome. Its ordinary JS array/scalar
// classification and yield/throw behavior are checked by the public pipe tests.
datatype Outcome<T> = Failure | Scalar(value:T) | Tuple(args:seq<T>)
function Transport<T>(result: Outcome<T>): seq<T>
  requires !result.Failure?
{
  if result.Tuple? then copyArguments(result.args) else singleArgument(result.value)
}

ghost predicate Chained<T(!new)>(calls:seq<seq<T>>, results:seq<Outcome<T>>)
  decreases |calls|
{
  |calls| == |results| &&
    (|calls| <= 1 || (Chained(calls[..|calls|-1],results[..|results|-1]) &&
    !results[|results|-2].Failure? && calls[|calls|-1] == Transport(results[|results|-2])))
}

method RunChildren<T(!new)>(children:seq<seq<T> -> Outcome<T>>, input:seq<T>)
  returns (calls:seq<seq<T>>, results:seq<Outcome<T>>)
  ensures |calls| == |results| <= |children|
  ensures |children| > 0 ==> |calls| > 0 && calls[0] == input
  ensures forall i :: 0 <= i < |calls| ==> results[i] == children[i](calls[i])
  ensures Chained(calls,results)
  ensures |calls| < |children| ==> |calls| > 0 && results[|calls|-1].Failure?
{
  calls, results := [],[];
  var args := input;
  var i := 0;
  while i < |children|
    invariant |calls| == |results| == i <= |children|
    invariant i == 0 ==> args == input
    invariant i > 0 ==> calls[0] == input && !results[i-1].Failure? && args == Transport(results[i-1])
    invariant forall k :: 0 <= k < i ==> results[k] == children[k](calls[k])
    invariant Chained(calls,results)
    decreases |children|-i
  {
    var result := children[i](args);
    ghost var oldCalls, oldResults := calls, results;
    calls, results := calls + [args], results + [result];
    assert calls[..i] == oldCalls && results[..i] == oldResults;
    assert Chained(calls,results);
    if result.Failure? { return; }
    args := Transport(result);
    i := i+1;
  }
}
