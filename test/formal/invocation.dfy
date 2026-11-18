// Exercise the same translated decisions the public step and pipe drivers call.
include "../../verification/src/runtime/outcome.dfy"
include "../../verification/src/core/eligibility.dfy"
include "../../verification/src/runtime/failures.dfy"

function Rank(p: WorkPhase): nat {
  match p case input => 4 case run => 3 case error => 2 case output => 1
}

function Trace(p: WorkPhase, i: bool, b: bool, r: bool, o: bool): seq<string>
  decreases Rank(p)
{
  var failure := match p case input => i case run => b case error => r case output => o;
  var next := afterPhase(p, failure);
  var here := match p case input => "input" case run => "run" case error => "error" case output => "output";
  [here] + (match next
    case finally => ["finally"]
    case run => Trace(WorkPhase.run, i, b, r, o)
    case error => Trace(WorkPhase.error, i, b, r, o)
    case output => Trace(WorkPhase.output, i, b, r, o))
}

lemma InvocationTrace(inputFails: bool, bodyFails: bool, recoveryFails: bool, outputFails: bool)
  ensures Trace(WorkPhase.input, inputFails, bodyFails, recoveryFails, outputFails) ==
    (if inputFails then ["input","finally"]
     else if !bodyFails then ["input","run","output","finally"]
     else if recoveryFails then ["input","run","error","finally"]
     else ["input","run","error","output","finally"])
{
  reveal Trace();
  if !inputFails {
    assert Trace(WorkPhase.output, inputFails, bodyFails, recoveryFails, outputFails) == ["output","finally"];
    if bodyFails {
      assert Trace(WorkPhase.error, inputFails, bodyFails, recoveryFails, outputFails) ==
        (if recoveryFails then ["error","finally"] else ["error","output","finally"]);
    }
  }
}

// The hooksFor iterator resumes at the previous index plus one even after a finalizer fails.
method VisitFinalizers<T>(plan: seq<T>, selected: T -> bool) returns (positions: seq<int>)
  ensures forall k :: 0 <= k < |positions| ==> 0 <= positions[k] < |plan| && selected(plan[positions[k]])
  ensures forall i, j :: 0 <= i < j < |positions| ==> positions[i] < positions[j]
  ensures forall j :: 0 <= j < |plan| ==> (j in positions) == selected(plan[j])
{
  positions := [];
  var start := 0;
  while start < |plan|
    invariant 0 <= start <= |plan|
    invariant forall k :: 0 <= k < |positions| ==> 0 <= positions[k] < start && selected(plan[positions[k]])
    invariant forall i, j :: 0 <= i < j < |positions| ==> positions[i] < positions[j]
    invariant forall j :: 0 <= j < start ==> (j in positions) == selected(plan[j])
    decreases |plan| - start
  {
    var index := firstEligible(plan, start, selected);
    if index == -1 { return; }
    positions := positions + [index];
    start := index + 1;
  }
}

lemma CleanupOutcomes<T>(earlier: Option<T>, failedFinalizers: seq<T>)
  ensures |failedFinalizers| > 0 ==> completionDisposition(earlier.Some?, |failedFinalizers|).throw_finalization?
  ensures orderedFailures(earlier, failedFinalizers) == (if earlier.Some? then [earlier.value] else []) + failedFinalizers
{}
