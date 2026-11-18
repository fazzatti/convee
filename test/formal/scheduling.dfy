include "../../verification/src/concurrency/accounting.dfy"
include "../../verification/src/core/capacity.dfy"

function Total(tasks: seq<nat>): nat {
  if |tasks| == 0 then 0 else tasks[0] + Total(tasks[1..])
}

lemma UpdateTotal(tasks: seq<nat>, k: nat, value: nat)
  requires k < |tasks|
  ensures Total(tasks[k := value]) == Total(tasks) - tasks[k] + value
  decreases k
{
  if k == 0 {
    assert tasks[k := value][1..] == tasks[1..];
  } else {
    assert tasks[k := value][1..] == tasks[1..][k-1 := value];
    UpdateTotal(tasks[1..], k-1, value);
  }
}

lemma MemberBound(tasks: seq<nat>, k: nat)
  requires k < |tasks|
  ensures tasks[k] <= Total(tasks)
  decreases k
{
  if k > 0 { MemberBound(tasks[1..], k-1); }
}

lemma StartAndSettle(queued: nat, counts: seq<nat>, k: nat, limit: nat, taskLimit: nat)
  requires k < |counts| && queued > 0 && counts[k] < taskLimit
  requires queued + Total(counts) <= limit <= 9007199254740991
  ensures counts[k] <= Total(counts)
  ensures var start := dispatchCounts(queued,Total(counts),counts[k]);
    var active := counts[k := start.task];
    start.task <= taskLimit && start.running == Total(active) &&
    occupancy(queued-1, start.running) == occupancy(queued, Total(counts))
  ensures var start := dispatchCounts(queued,Total(counts),counts[k]);
    var stop := settleCounts(start.running, start.task);
    stop.running == Total(counts) && stop.task == counts[k]
{
  MemberBound(counts, k);
  UpdateTotal(counts,k,counts[k]+1);
}

lemma SettleAny(queued: nat, counts: seq<nat>, k: nat, limit: nat)
  requires k < |counts| && counts[k] > 0
  requires queued + Total(counts) <= limit <= 9007199254740991
  ensures counts[k] <= Total(counts)
  ensures var stop := settleCounts(Total(counts), counts[k]);
    stop.running == Total(counts[k := stop.task]) &&
    occupancy(queued, stop.running) + 1 == occupancy(queued, Total(counts))
{
  MemberBound(counts,k);
  UpdateTotal(counts,k,counts[k]-1);
}

lemma AdmitOrCancel(queued: nat, running: nat, requested: nat, cancelled: nat, limit: nat)
  requires queued + running <= limit <= 9007199254740991 && requested <= 9007199254740991
  requires cancelled <= queued
  ensures admittedOccupancy(occupancy(queued,running), requested, limit) ==
    (if queued+running+requested <= limit then occupancy(queued+requested,running) else -1)
  ensures occupancy(queued-cancelled,running) + cancelled == occupancy(queued,running)
{}
