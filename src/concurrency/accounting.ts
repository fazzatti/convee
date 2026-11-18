interface RunningCounts {
  running: number;
  task: number;
}

/** Derive occupancy from the actual queue and in-flight count at each admission. */
export function occupancy(queued: number, running: number): number {
  //@ verify
  //@ requires 0 <= queued && 0 <= running && queued + running <= 9007199254740991
  //@ ensures \result === queued + running && 0 <= \result && \result <= 9007199254740991
  return queued + running;
}

/** Moving one queued job to its task preserves occupancy and every other task's count. */
export function dispatchCounts(
  _queued: number,
  running: number,
  task: number,
): RunningCounts {
  //@ verify
  //@ requires 0 < _queued && 0 <= task && task <= running && _queued + running <= 9007199254740991
  //@ ensures \result.running === running + 1 && \result.task === task + 1
  //@ ensures _queued - 1 + \result.running === _queued + running
  //@ ensures \result.running - \result.task === running - task
  return { running: running + 1, task: task + 1 };
}

/** A settled job releases exactly one global slot and exactly its own task slot. */
export function settleCounts(running: number, task: number): RunningCounts {
  //@ verify
  //@ requires 0 < task && task <= running && running <= 9007199254740991
  //@ ensures \result.running === running - 1 && \result.task === task - 1
  //@ ensures 0 <= \result.task && \result.task <= \result.running
  //@ ensures \result.running - \result.task === running - task
  return { running: running - 1, task: task - 1 };
}
