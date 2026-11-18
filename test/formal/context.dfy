include "../../verification/src/context/capture.dfy"
include "../../verification/src/core/sequences.dfy"

datatype Snapshot<T> = Snapshot(input: Option<seq<T>>, output: Option<T>, error: Option<T>)
function Completed<T>(mode: string, xs: seq<T>, value: T, error: T): Snapshot<T> {
  var fields := captureFields(mode);
  Snapshot(if fields.input then Some(copyArguments(xs)) else None,
    retainedValue(fields.output,value), retainedValue(fields.error,error))
}

// The shared per-ID map and previous record are written on completion. Forked
// live stacks are local. Native Map and reference identity are checked at the API.
lemma Complete<T>(registry: map<string,Snapshot<T>>, id:string, other:string,
  mode:string, xs:seq<T>, value:T, error:T)
  requires other != id
  ensures var snapshot := Completed(mode,xs,value,error);
    var updated := registry[id := snapshot];
    updated[id] == snapshot && (other in updated <==> other in registry) &&
    (other in registry ==> updated[other] == registry[other])
  ensures mode == "all" ==> Completed(mode,xs,value,error) == Snapshot(Some(xs),Some(value),Some(error))
  ensures mode == "outputs" ==> Completed(mode,xs,value,error) == Snapshot(None,Some(value),None)
  ensures mode == "none" ==> Completed(mode,xs,value,error) == Snapshot(None,None,None)
{}

lemma ScopeExit<T>(frames: seq<T>, frame:T)
  ensures (frames + [frame])[..|frames|] == frames
  ensures (frames + [frame])[|frames|] == frame
{}
