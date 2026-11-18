include "../../verification/src/core/owner-phase.dfy"
include "../../verification/src/core/capacity.dfy"
include "../../verification/src/workers/host-phase.dfy"
include "../../verification/src/wasm/session-policy.dfy"

lemma CloseAndDrain(active: nat, terminal: bool, reopen: bool)
  requires 0 < active <= 9007199254740991
  ensures afterRelease(active) == 0 <==> active == 1
  ensures !ownerAccepts(OwnerPhase.closing,terminal)
  ensures ownerAccepts(phaseAfterClose(terminal,reopen),terminal) == (!terminal && reopen)
{}

lemma RestartBudget(used: nat, limit: nat, faults: nat)
  requires used <= limit <= 9007199254740991
  ensures ChargeFaults(used,limit,faults) == (if used+faults <= limit then used+faults else limit)
  decreases faults
{
  if faults > 0 { RestartBudget(nextRestart(used,limit), limit, faults-1); }
}

function ChargeFaults(used: nat, limit: nat, faults: nat): nat
  requires used <= limit <= 9007199254740991
  decreases faults
{
  if faults == 0 then used else ChargeFaults(nextRestart(used,limit),limit,faults-1)
}

lemma LateEvents(id: JobId, stale: JobId, queued: nat)
  requires stale.id != id.id
  ensures !replyBelongs(true,Some(id),stale)
  ensures !mayDispatch(true,true,false,queued) && !mayDispatch(false,true,true,queued)
  ensures !acceptsRequest(afterHostWork(HostPhase.failed),RequestKind.run)
  ensures !canClassifyGuestFailure(false,false) && !canClassifyGuestFailure(true,true)
{}
