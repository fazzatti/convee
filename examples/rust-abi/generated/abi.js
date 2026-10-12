"use components";
export function instantiate(getCoreModule, imports, instantiateCore = WebAssembly.instantiate) {
  
  const i32ToF32I = new Int32Array(1);
  const i32ToF32F = new Float32Array(i32ToF32I.buffer);
  
  const i64ToF64I = new BigInt64Array(1);
  const i64ToF64F = new Float64Array(i64ToF64I.buffer);
  
  let dv = new DataView(new ArrayBuffer());
  const dataView = mem => dv.buffer === mem.buffer ? dv : dv = new DataView(mem.buffer);
  
  const f32ToI32 = f => (i32ToF32F[0] = f, i32ToF32I[0]);
  
  const f64ToI64 = f => (i64ToF64F[0] = f, i64ToF64I[0]);
  
  function toInt64(val) {
    const converted = BigInt(val)
    
    return BigInt.asIntN(64, converted);
  }
  
  
  function toUint64(val) {
    const converted = BigInt(val)
    
    return BigInt.asUintN(64, converted);
  }
  
  
  function toInt16(val) {
    
    val >>>= 0;
    val %= 2 ** 16;
    if (val >= 2 ** 15) {
      val -= 2 ** 16;
    }
    return val;
  }
  
  
  function toInt32(val) {
    
    return val >> 0;
  }
  
  
  function toInt8(val) {
    
    val >>>= 0;
    val %= 2 ** 8;
    if (val >= 2 ** 7) {
      val -= 2 ** 8;
    }
    return val;
  }
  
  
  function toUint16(val) {
    
    val >>>= 0;
    val %= 2 ** 16;
    return val;
  }
  
  
  function toUint32(val) {
    
    return val >>> 0;
  }
  
  
  function toUint8(val) {
    
    val >>>= 0;
    val %= 2 ** 8;
    return val;
  }
  
  
  function _isValidNumericPrimitive(ty, v) {
    if (v === undefined || v === null) { return false; }
    switch (ty) {
      case 'bool':
      return v === 0 || v === 1;
      break;
      case 'u8':
      return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 255;
      break;
      case 's8':
      return typeof v === 'number' && Number.isInteger(v) && v >= -128 && v <= 127;
      break;
      case 'u16':
      return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 65535;
      break;
      case 's16':
      return typeof v === 'number' && Number.isInteger(v) && v >= -32768 && v <= 32767;
      case 'u32':
      return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 4_294_967_295;
      case 's32':
      return typeof v === 'number' && Number.isInteger(v) && v >= -2_147_483_648 && v <= 2_147_483_647;
      case 'u64':
      return typeof v === 'bigint' && v >= 0 && v <= 18_446_744_073_709_551_615n;
      case 's64':
      return typeof v === 'bigint' && v >= -9223372036854775808n && v <= 9223372036854775807n;
      break;
      case 'f32':
      case 'f64': return typeof v === 'number';
      default:
      return false;
    }
    return true;
  }
  
  function _requireValidNumericPrimitive(ty, v) {
    if (v === undefined  || v === null || !_isValidNumericPrimitive(ty, v)) {
      throw new TypeError(`invalid ${ty} value [${v}]`);
    }
    return true;
  }
  const utf16Decoder = new TextDecoder('utf-16', { fatal: true, ignoreBOM: true });
  
  const isLE = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
  
  function _utf16AllocateAndEncode(str, realloc, memory) {
    if (typeof str !== 'string') {
      throw new TypeError('expected a string, received [' + typeof str + ']');
    }
    const len = str.length;
    const ptr = realloc(0, 0, 2, len * 2);
    const out = new Uint16Array(memory.buffer, ptr, len);
    const put = isLE
    ? (i, ch) => { out[i] = ch; }
    : (i, ch) => { out[i] = (ch & 0xff) << 8 | ch >>> 8; };
    for (let i = 0; i < len; i++) {
      let ch = str.charCodeAt(i);
      if ((ch & 0xf800) === 0xd800) {
        if (ch < 0xdc00 && i + 1 < len && (str.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
          put(i++, ch);
          ch = str.charCodeAt(i);
        } else {
          // Unpaired surrogates are replaced, as when converting to a `USVString`
          ch = 0xfffd;
        }
      }
      put(i, ch);
    }
    return { ptr, len, codepoints: [...str].length };
  }
  
  const TEXT_DECODER_UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  const TEXT_ENCODER_UTF8 = new TextEncoder();
  
  function _utf8AllocateAndEncode(s, realloc, memory) {
    if (typeof s !== 'string') {
      throw new TypeError('expected a string, received [' + typeof s + ']');
    }
    if (s.length === 0) { return { ptr: 1, len: 0 }; }
    // Compute the exact allocation size up front. Some older preview1
    // adapters only support an initial allocation, not a subsequent shrink.
    let len = 0;
    let codepoints = 0;
    for (let i = 0; i < s.length; i++) {
      const ch = s.charCodeAt(i);
      codepoints++;
      if (ch < 0x80) { len += 1; }
      else if (ch < 0x800) { len += 2; }
      else if (ch >= 0xd800 && ch <= 0xdbff &&
      i + 1 < s.length &&
      (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
        len += 4;
        i++;
      } else { len += 3; }
    }
    const ptr = realloc(0, 0, 1, len);
    const { read, written } = TEXT_ENCODER_UTF8.encodeInto(
    s,
    new Uint8Array(memory.buffer, ptr, len),
    );
    if (read !== s.length || written !== len) {
      throw new Error('failed to encode whole string');
    }
    const res = { ptr, len, codepoints };
    return res;
  }
  
  
  function validateGuestChar(i) {
    if ((i > 0x10ffff) || (i >= 0xd800 && i <= 0xdfff)) { throw new TypeError(`not a valid char`); }
    return String.fromCodePoint(i);
  }
  
  
  function validateHostChar(s) {
    if (typeof s !== 'string') { throw new TypeError(`must be a string`); }
    return s.codePointAt(0);
  }
  
  let RESOURCE_SCOPE_ID = 0;
  const RESOURCE_SCOPE_TASKS = new Map();
  const ASYNC_TASKS_BY_COMPONENT_IDX = new Map();
  const ASYNC_CURRENT_COMPONENT_IDXS = [];
  
  function getCurrentTask(componentIdx, taskID) {
    let usedGlobal = false;
    if (componentIdx === undefined || componentIdx === null) {
      throw new Error('missing component idx'); // TODO(fix)
      // componentIdx = ASYNC_CURRENT_COMPONENT_IDXS.at(-1);
      // usedGlobal = true;
    }
    
    const taskMetas = ASYNC_TASKS_BY_COMPONENT_IDX.get(componentIdx);
    if (taskMetas === undefined || taskMetas.length === 0) { return undefined; }
    
    if (taskID) {
      return taskMetas.find(meta => meta.task.id() === taskID);
    }
    
    const taskMeta = taskMetas[taskMetas.length - 1];
    if (!taskMeta || !taskMeta.task) { return undefined; }
    
    return taskMeta;
  }
  const ASYNC_CURRENT_TASK_IDS = [];
  
  const _debugLog = (...args) => {
    if (!globalThis?.process?.env?.JCO_DEBUG) { return; }
    console.debug(...args);
  };
  
  function clearCurrentTask(componentIdx, taskID) {
    _debugLog('[clearCurrentTask()] args', { componentIdx, taskID });
    
    if (componentIdx === undefined || componentIdx === null) {
      throw new Error('missing/invalid component instance index while ending current task');
    }
    
    const tasks = ASYNC_TASKS_BY_COMPONENT_IDX.get(componentIdx);
    if (!tasks || !Array.isArray(tasks)) {
      throw new Error('missing/invalid tasks for component instance while ending task');
    }
    if (tasks.length == 0) {
      throw new Error(`no current tasks for component instance [${componentIdx}] while ending task`);
    }
    
    const taskIdx = taskID === undefined
    ? tasks.length - 1
    : tasks.findIndex(meta => meta.id === taskID);
    if (taskIdx === -1) { return; }
    
    const taskMeta = tasks.splice(taskIdx, 1)[0];
    const globalTaskIdx = ASYNC_CURRENT_TASK_IDS.lastIndexOf(taskMeta.id);
    if (globalTaskIdx !== -1) {
      ASYNC_CURRENT_TASK_IDS.splice(globalTaskIdx, 1);
      ASYNC_CURRENT_COMPONENT_IDXS.splice(globalTaskIdx, 1);
    }
    return taskMeta.task;
  }
  const ASYNC_STATE = new Map();
  
  function promiseWithResolvers() {
    if (Promise.withResolvers) {
      return Promise.withResolvers();
    } else {
      let resolve;
      let reject;
      const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    }
  }
  
  class Waitable {
    #componentIdx;
    
    #pendingEventFn = null;
    
    #promise;
    #resolve;
    #reject;
    
    #waitableSet = null;
    
    #hasSyncWaiter = false;
    
    #idx = null; // to component-global waitables
    
    target;
    
    constructor(args) {
      const { componentIdx, target } = args;
      this.#componentIdx = componentIdx;
      this.target = args.target;
      this.#resetPromise();
    }
    
    componentIdx() { return this.#componentIdx; }
    isInSet() { return this.#waitableSet !== null; }
    
    idx() { return this.#idx; }
    setIdx(idx) {
      if (idx === 0) { throw new Error("waitable idx cannot be zero"); }
      this.#idx = idx;
    }
    
    setTarget(tgt) { this.target = tgt; }
    
    #resetPromise() {
      const { promise, resolve, reject } = promiseWithResolvers()
      this.#promise = promise;
      this.#resolve = resolve;
      this.#reject = reject;
    }
    
    resolve() { this.#resolve(); }
    reject(err) { this.#reject(err); }
    promise() { return this.#promise; }
    
    hasPendingEvent() {
      // _debugLog('[Waitable#hasPendingEvent()]', {
        //     componentIdx: this.#componentIdx,
        //     waitable: this,
        //     waitableSet: this.#waitableSet,
        //     hasPendingEvent: this.#pendingEventFn !== null,
        // });
        return this.#pendingEventFn !== null;
      }
      
      setPendingEvent(fn) {
        _debugLog('[Waitable#setPendingEvent()] args', {
          waitable: this,
          inSet: this.#waitableSet,
        });
        this.#pendingEventFn = fn;
      }
      
      getPendingEvent() {
        _debugLog('[Waitable#getPendingEvent()] args', {
          waitable: this,
          inSet: this.#waitableSet,
          hasPendingEvent: this.#pendingEventFn !== null,
        });
        if (this.#pendingEventFn === null) { return null; }
        const eventFn = this.#pendingEventFn;
        this.#pendingEventFn = null;
        const e = eventFn();
        this.#resetPromise();
        return e;
      }
      
      join(waitableSet) {
        _debugLog('[Waitable#join()] args', {
          waitable: this,
          waitableSet: waitableSet,
          isRemoval: waitableSet === null,
        });
        
        if (this.#waitableSet === undefined) {
          throw new TypeError('waitable set must be not be undefined');
        }
        
        if (this.#waitableSet) {
          this.#waitableSet.removeWaitable(this);
        }
        
        this.#waitableSet = waitableSet;
        
        if (waitableSet) {
          this.#waitableSet.addWaitable(this);
        }
      }
      
      drop() {
        _debugLog('[Waitable#drop()] args', {
          componentIdx: this.#componentIdx,
          waitable: this,
        });
        this.join(null);
      }
      
      async waitForPendingEvent(args) {
        const { cstate } = args;
        if (!cstate) { throw new TypeError('missing component state'); }
        
        if (this.#waitableSet !== null || this.#hasSyncWaiter) {
          throw new Error("waitable is already in a set/has a sync waiter");
        }
        this.#hasSyncWaiter = true;
        await cstate.waitUntil({
          cancellable: false,
          readyFn: () => this.hasPendingEvent(),
        });
        this.#hasSyncWaiter = false;
      }
      
    }
    const INSTANCE_FLAGS = new Map();
    const STORE_TRAP = { error: null };
    const STORE_ASYNC_STATE = { deadlockCheck: null, pendingHostOperations: 0 };
    const WebAssemblyRuntimeError = WebAssembly.RuntimeError;
    
    function _checkForDeadlock() {
      if (STORE_ASYNC_STATE.deadlockCheck !== null || STORE_TRAP.error !== null) { return; }
      STORE_ASYNC_STATE.deadlockCheck = setTimeout(() => {
        STORE_ASYNC_STATE.deadlockCheck = null;
        if (STORE_TRAP.error !== null || STORE_ASYNC_STATE.pendingHostOperations > 0) { return; }
        
        const suspendedTasks = new Set();
        for (const state of ASYNC_STATE.values()) {
          if (state.hasPendingSchedulerWork()) {
            state.runTickLoop();
            return;
          }
          for (const meta of state.suspendedTaskMetas()) {
            suspendedTasks.add(meta.task);
          }
        }
        
        const unresolvedRoots = new Set();
        for (const task of suspendedTasks) {
          const root = task.getRootTask();
          if (!root.isResolvedState()) { unresolvedRoots.add(root); }
        }
        if (unresolvedRoots.size === 0) { return; }
        
        const err = new WebAssemblyRuntimeError('wasm trap: deadlock detected: event loop cannot make further progress');
        // Which tasks were waiting, and on whose behalf. The message stays
        // exactly what the Canonical ABI calls for, so this rides alongside
        // it: a deadlock reported from a real program is otherwise a bare
        // sentence, and the state that produced it is gone by the time
        // anyone reads the failure.
        err.deadlockDetail = {
          pendingHostOperations: STORE_ASYNC_STATE.pendingHostOperations,
          suspendedTasks: [...suspendedTasks].map((task) => ({
            taskID: task.id(),
            componentIdx: task.componentIdx(),
            state: task.taskState(),
            rootTaskID: task.getRootTask().id(),
          })),
          unresolvedRootTaskIDs: [...unresolvedRoots].map((root) => root.id()),
        };
        STORE_TRAP.error = err;
        for (const root of unresolvedRoots) {
          root.setErrored(err);
          root.reject(err);
        }
        for (const task of suspendedTasks) {
          if (!task.isResolvedState() && unresolvedRoots.has(task.getRootTask())) {
            task.setErrored(err);
            task.reject(err);
          }
        }
        for (const state of ASYNC_STATE.values()) { state.runTickLoop(); }
      }, 0);
    }
    
    const CORE_TRAP_MESSAGES = new Map([
    ['unreachable', "wasm trap: wasm `unreachable` instruction executed"],
    ['memory access out of bounds', "wasm trap: out of bounds memory access"],
    ['divide by zero', "wasm trap: integer divide by zero"],
    ['remainder by zero', "wasm trap: integer divide by zero"],
    ['divide result unrepresentable', "wasm trap: integer overflow"],
    ['float unrepresentable in integer range', "wasm trap: invalid conversion to integer"],
    ['table index is out of bounds', "wasm trap: undefined element: out of bounds table access"],
    ['function signature mismatch', "wasm trap: indirect call type mismatch"],
    ['call stack exhausted', "wasm trap: call stack exhausted"],
    ]);
    function _normalizeCoreTrap(err) {
      if (!(err instanceof WebAssemblyRuntimeError)) { return err; }
      const message = CORE_TRAP_MESSAGES.get(err.message);
      if (message !== undefined) { err.message = message; }
      return err;
    }
    
    class RepTable {
      // Sentinel marking a freed slot; the freelist link for a freed slot
      // lives in the odd cell. This keeps get()/contains()/remove() on freed
      // reps well-defined (previously they returned/corrupted freelist links).
      static FREE = Symbol('RepTable.free');
      
      #data = [0, null];
      #size = 0;
      #target;
      
      constructor(args) {
        this.target = args?.target;
      }
      
      data() { return this.#data; }
      
      insert(val) {
        _debugLog('[RepTable#insert()] args', { val, target: this.target });
        const freeIdx = this.#data[0];
        if (freeIdx === 0) {
          this.#data.push(val);
          this.#data.push(null);
          const rep = (this.#data.length >> 1) - 1;
          _debugLog('[RepTable#insert()] inserted', { val, target: this.target, rep });
          this.#size += 1;
          return rep;
        }
        const placementIdx = freeIdx << 1;
        if (this.#data[placementIdx] !== RepTable.FREE) {
          throw new Error('corrupt rep table freelist: head does not point at a freed slot');
        }
        this.#data[0] = this.#data[placementIdx + 1];
        this.#data[placementIdx] = val;
        this.#data[placementIdx + 1] = null;
        _debugLog('[RepTable#insert()] inserted', { val, target: this.target, rep: freeIdx });
        this.#size += 1;
        return freeIdx;
      }
      
      get(rep) {
        _debugLog('[RepTable#get()] args', { rep, target: this.target });
        if (rep === 0) { throw new Error('invalid resource rep during get, (cannot be 0)'); }
        
        const baseIdx = rep << 1;
        const val = this.#data[baseIdx];
        if (val === RepTable.FREE) { return undefined; }
        return val;
      }
      
      contains(rep) {
        _debugLog('[RepTable#contains()] args', { rep, target: this.target });
        if (rep === 0) { throw new Error('invalid resource rep during contains, (cannot be 0)'); }
        
        const baseIdx = rep << 1;
        const val = this.#data[baseIdx];
        return val !== RepTable.FREE && !!val;
      }
      
      remove(rep) {
        _debugLog('[RepTable#remove()] args', { rep, target: this.target });
        if (rep === 0) { throw new Error('invalid resource rep during remove, (cannot be 0)'); }
        if (this.#data.length === 2) { throw new Error('invalid'); }
        
        const baseIdx = rep << 1;
        if (baseIdx >= this.#data.length) {
          throw new Error(`invalid rep [${rep}] during remove, out of range`);
        }
        const val = this.#data[baseIdx];
        if (val === RepTable.FREE) {
          throw new Error(`double removal of rep [${rep}] (already freed)`);
        }
        
        this.#data[baseIdx] = RepTable.FREE;
        this.#data[baseIdx + 1] = this.#data[0];
        this.#data[0] = rep;
        this.#size -= 1;
        
        return val;
      }
      
      size() { return this.#size; }
      
      clear() {
        _debugLog('[RepTable#clear()] args', { rep, target: this.target });
        this.#data = [0, null];
      }
    }
    
    class ComponentAsyncState {
      static EVENT_HANDLER_EVENTS = [ 'backpressure-change' ];
      
      static TickResult = {
        // no suspended tasks remain
        DONE: 'done',
        // a suspended task was resumed (more may be ready)
        RESUMED: 'resumed',
        // suspended tasks remain but none were ready
        IDLE: 'idle',
      };
      
      #componentIdx;
      #callingAsyncImport = false;
      #syncImportWait = promiseWithResolvers();
      #lockHolderTaskID = null;
      #lockWaiters = [];
      #lockHandoffScheduled = false;
      #pendingTaskStarts = 0;
      #parkedTasks = new Map();
      #suspendedTasksByTaskID = new Map();
      #suspendedTaskIDs = [];
      #errored = null;
      #trapped = false;
      #backpressure = 0;
      #backpressureWaiters = 0n;
      
      #handlerMap = new Map();
      #nextHandlerID = 0n;
      
      #tickLoop = null;
      #tickLoopInterval = null;
      
      #onExclusiveReleaseHandlers = [];
      
      #mayLeave = true;
      
      handles;
      subtasks;
      
      constructor(args) {
        this.#componentIdx = args.componentIdx;
        this.handles = new RepTable({ target: `component [${this.#componentIdx}] handles (waitable objects)` });
        this.subtasks = new RepTable({ target: `component [${this.#componentIdx}] subtasks` });
      };
      
      componentIdx() { return this.#componentIdx; }
      
      get mayLeave() {
        const flags = INSTANCE_FLAGS.get(this.#componentIdx);
        return flags === undefined ? this.#mayLeave : flags.value === 1;
      }
      set mayLeave(value) {
        if (typeof value !== 'boolean') { throw new TypeError('mayLeave must be a boolean'); }
        this.#mayLeave = value;
        const flags = INSTANCE_FLAGS.get(this.#componentIdx);
        if (flags !== undefined) { flags.value = value ? 1 : 0; }
      }
      
      errored() { return this.#errored !== null; }
      setErrored(err) {
        _debugLog('[ComponentAsyncState#setErrored()] component errored', { err, componentIdx: this.#componentIdx });
        if (this.#errored) { return; }
        if (!err) {
          err = new Error('error elswehere (see other component instance error)')
          err.componentIdx = this.#componentIdx;
        }
        this.#errored = err;
      }
      
      markTrapped(err) {
        if (!(err instanceof WebAssemblyRuntimeError)) {
          return false;
        }
        err = _normalizeCoreTrap(err);
        this.#trapped = true;
        _debugLog('[ComponentAsyncState#markTrapped()] component trapped', { err, componentIdx: this.#componentIdx });
        if (STORE_TRAP.error === null) { STORE_TRAP.error = err; }
        return true;
      }
      
      throwIfTrapped() {
        if (this.#trapped) {
          throw new WebAssemblyRuntimeError("wasm trap: cannot enter component instance");
        }
      }
      
      callingSyncImport(val) {
        if (val === undefined) { return this.#callingAsyncImport; }
        if (typeof val !== 'boolean') { throw new TypeError('invalid setting for async import'); }
        const prev = this.#callingAsyncImport;
        this.#callingAsyncImport = val;
        if (prev === true && this.#callingAsyncImport === false) {
          this.#notifySyncImportEnd();
        }
      }
      
      #notifySyncImportEnd() {
        const existing = this.#syncImportWait;
        this.#syncImportWait = promiseWithResolvers();
        existing.resolve();
      }
      
      async waitForSyncImportCallEnd() {
        await this.#syncImportWait.promise;
      }
      
      setBackpressure(v) {
        this.#backpressure = v;
        return this.#backpressure
      }
      getBackpressure() { return this.#backpressure; }
      
      incrementBackpressure() {
        const current = this.#backpressure;
        if (current < 0 || current > 2**16) {
          throw new Error(`invalid current backpressure value [${current}]`);
        }
        const newValue = this.getBackpressure() + 1;
        if (newValue >= 2**16) {
          throw new Error(`invalid new backpressure value [${newValue}], overflow`);
        }
        return this.setBackpressure(newValue);
      }
      
      decrementBackpressure() {
        const current = this.#backpressure;
        if (current < 0 || current > 2**16) {
          throw new Error(`invalid current backpressure value [${current}]`);
        }
        const newValue = Math.max(0, current - 1);
        if (newValue < 0) {
          throw new Error(`invalid new backpressure value [${newValue}], underflow`);
        }
        return this.setBackpressure(newValue);
      }
      hasBackpressure() { return this.#backpressure > 0; }
      
      waitForBackpressure() {
        let backpressureCleared = false;
        const cstate = this;
        cstate.addBackpressureWaiter();
        const handlerID = this.registerHandler({
          event: 'backpressure-change',
          fn: (bp) => {
            if (bp === 0) {
              cstate.removeHandler(handlerID);
              backpressureCleared = true;
            }
          }
        });
        return new Promise((resolve) => {
          const interval = setInterval(() => {
            if (backpressureCleared) { return; }
            clearInterval(interval);
            cstate.removeBackpressureWaiter();
            resolve(null);
          }, 0);
        });
      }
      
      registerHandler(args) {
        const { event, fn } = args;
        if (!event) { throw new Error("missing handler event"); }
        if (!fn) { throw new Error("missing handler fn"); }
        
        if (!ComponentAsyncState.EVENT_HANDLER_EVENTS.includes(event)) {
          throw new Error(`unrecognized event handler [${event}]`);
        }
        
        const handlerID = this.#nextHandlerID++;
        let handlers = this.#handlerMap.get(event);
        if (!handlers) {
          handlers = [];
          this.#handlerMap.set(event, handlers)
        }
        
        handlers.push({ id: handlerID, fn, event });
        return handlerID;
      }
      
      removeHandler(args) {
        const { event, handlerID } = args;
        const registeredHandlers = this.#handlerMap.get(event);
        if (!registeredHandlers) { return; }
        const found = registeredHandlers.find(h => h.id === handlerID);
        if (!found) { return; }
        this.#handlerMap.set(event, this.#handlerMap.get(event).filter(h => h.id !== handlerID));
      }
      
      getBackpressureWaiters() { return this.#backpressureWaiters; }
      addBackpressureWaiter() { this.#backpressureWaiters++; }
      removeBackpressureWaiter() {
        this.#backpressureWaiters--;
        if (this.#backpressureWaiters < 0) {
          throw new Error("unexepctedly negative number of backpressure waiters");
        }
      }
      
      // The per-slice mutual-exclusion lock for guest execution in this
      // component instance. Guest slices (callback invocations and
      // sync-lifted bodies) must be atomic per component even across the
      // JSPI suspensions jco introduces for host imports: wit-bindgen's
      // executors publish per-task state in single linear-memory cells
      // (the wasip3-task pointer, context-local storage discipline) that
      // an interleaved slice of the same component corrupts
      //
      // The lock is *owned*: acquisition records the holder task and
      // release is a no-op for anyone else, so a task exiting can no
      // longer drop a hold it does not own (blind acquire/release-any
      // was the previous discipline). Contended acquisition queues
      // FIFO; release hands the lock to the next waiter directly.
      isExclusivelyLocked() { return this.#lockHolderTaskID !== null; }
      exclusivelyLockedBy(taskID) { return this.#lockHolderTaskID === taskID; }
      
      exclusiveLock(taskID) {
        _debugLog('[ComponentAsyncState#exclusiveLock()]', {
          holder: this.#lockHolderTaskID,
          requester: taskID,
          componentIdx: this.#componentIdx,
        });
        if (taskID === undefined || taskID === null) {
          throw new Error('exclusive lock requires the acquiring task id');
        }
        if (this.#lockHolderTaskID !== null) {
          throw new Error(`component [${this.#componentIdx}] exclusive lock held by task [${this.#lockHolderTaskID}], requested by [${taskID}]`);
        }
        this.#lockHolderTaskID = taskID;
      }
      
      // Awaitable acquisition: takes the lock immediately when free,
      // otherwise queues FIFO behind the current holder and earlier
      // waiters. The resolved promise implies ownership.
      acquireExclusiveLock(taskID) {
        if (taskID === undefined || taskID === null) {
          throw new Error('exclusive lock requires the acquiring task id');
        }
        if (this.#lockHolderTaskID === null) {
          this.#lockHolderTaskID = taskID;
          _debugLog('[ComponentAsyncState#acquireExclusiveLock()] acquired', {
            holder: taskID,
            componentIdx: this.#componentIdx,
          });
          return;
        }
        if (this.#lockHolderTaskID === taskID) {
          throw new Error(`task [${taskID}] already holds the lock for component [${this.#componentIdx}]`);
        }
        _debugLog('[ComponentAsyncState#acquireExclusiveLock()] waiting', {
          holder: this.#lockHolderTaskID,
          requester: taskID,
          componentIdx: this.#componentIdx,
          queued: this.#lockWaiters.length,
        });
        return new Promise((resolve) => {
          this.#lockWaiters.push({ taskID, resolve });
        });
      }
      
      cancelExclusiveLockWaiter(taskID) {
        const idx = this.#lockWaiters.findIndex(waiter => waiter.taskID === taskID);
        if (idx === -1) { return false; }
        const [waiter] = this.#lockWaiters.splice(idx, 1);
        // Release the awaiting `enter()` continuation without granting
        // ownership. It observes the task's resolved cancellation state
        // before attempting to execute guest code.
        waiter.resolve();
        return true;
      }
      
      exclusiveRelease(taskID) {
        _debugLog('[ComponentAsyncState#exclusiveRelease()] args', {
          holder: this.#lockHolderTaskID,
          releaser: taskID,
          componentIdx: this.#componentIdx,
        });
        if (this.#lockHolderTaskID !== taskID) {
          // Ownerless releases were the historical behavior; a foreign
          // release now leaves the hold intact
          _debugLog('[ComponentAsyncState#exclusiveRelease()] ignoring foreign release', {
            holder: this.#lockHolderTaskID,
            releaser: taskID,
            componentIdx: this.#componentIdx,
          });
          return false;
        }
        
        // Make the release observable before handing the lock to the next
        // asynchronous guest slice.
        //
        // Release handlers may expose a lifted value whose consumer immediately
        // performs a synchronous call on the same component; that call must run
        // while the instance is genuinely unlocked, not via enterSync's
        // lock-free fallback code.
        this.#lockHolderTaskID = null;
        
        this.#onExclusiveReleaseHandlers = this.#onExclusiveReleaseHandlers.filter(v => !!v);
        for (const [idx, f] of this.#onExclusiveReleaseHandlers.entries()) {
          try {
            this.#onExclusiveReleaseHandlers[idx] = null;
            f();
          } catch (err) {
            _debugLog("error while executing handler for next exclusive release", err);
            throw err;
          }
        }
        this.#scheduleLockHandoff();
        return true;
      }
      
      #scheduleLockHandoff() {
        if (this.#lockHandoffScheduled || this.#lockWaiters.length === 0) { return; }
        this.#lockHandoffScheduled = true;
        queueMicrotask(() => {
          this.#lockHandoffScheduled = false;
          // A synchronous call triggered by a release handler gets the
          // first opportunity to use the unlocked component.
          //
          // Its release will leave this queued handoff in place.
          if (this.#lockHolderTaskID !== null) {
            this.#scheduleLockHandoff();
            return;
          }
          const next = this.#lockWaiters.shift();
          if (!next) { return; }
          this.#lockHolderTaskID = next.taskID;
          next.resolve();
        });
      }
      
      onNextExclusiveRelease(fn) {
        _debugLog('[ComponentAsyncState#()onNextExclusiveRelease] registering');
        this.#onExclusiveReleaseHandlers.push(fn);
      }
      
      async waitForExclusiveRelease() {
        while (this.isExclusivelyLocked()) {
          await new Promise(resolve => this.onNextExclusiveRelease(resolve));
        }
      }
      
      #getSuspendedTaskMeta(taskID) {
        return this.#suspendedTasksByTaskID.get(taskID);
      }
      
      #removeSuspendedTaskMeta(taskID) {
        _debugLog('[ComponentAsyncState#removeSuspendedTaskMeta()] removing suspended task', {
          taskID,
          componentIdx: this.#componentIdx,
        });
        const idx = this.#suspendedTaskIDs.findIndex(t => t === taskID);
        const meta = this.#suspendedTasksByTaskID.get(taskID);
        this.#suspendedTaskIDs[idx] = null;
        this.#suspendedTasksByTaskID.delete(taskID);
        return meta;
      }
      
      #addSuspendedTaskMeta(meta) {
        if (!meta) { throw new Error('missing task meta'); }
        const taskID = meta.taskID;
        this.#suspendedTasksByTaskID.set(taskID, meta);
        this.#suspendedTaskIDs.push(taskID);
        if (this.#suspendedTasksByTaskID.size < this.#suspendedTaskIDs.length - 10) {
          this.#suspendedTaskIDs = this.#suspendedTaskIDs.filter(t => t !== null);
        }
      }
      
      // TODO(threads): readyFn is normally on the thread
      suspendTask(args) {
        const { task, readyFn, cancellable, onResume } = args;
        const taskID = task.id();
        const componentIdx = task.componentIdx();
        _debugLog('[ComponentAsyncState#suspendTask()]', {
          taskID,
          componentIdx: this.#componentIdx,
          taskEntryFnName: task.entryFnName(),
          subtask: task.getParentSubtask(),
        });
        
        if (componentIdx !== this.#componentIdx) {
          throw new Error('assert: task component idx should match async state');
        }
        
        if (this.#getSuspendedTaskMeta(taskID)) {
          throw new Error(`task [${taskID}] already suspended`);
        }
        
        let promise;
        let resume;
        if (onResume) {
          resume = () => onResume(!task.isCancelled());
        } else {
          const resolvers = promiseWithResolvers();
          promise = resolvers.promise;
          resume = () => resolvers.resolve(!task.isCancelled());
        }
        this.#addSuspendedTaskMeta({
          task,
          taskID,
          cancellable,
          readyFn,
          resume: () => {
            _debugLog('[ComponentAsyncState] resuming suspended task', {
              taskID,
              componentIdx: this.#componentIdx,
            });
            // TODO(threads): it's thread cancellation we should be checking for below, not task
            resume();
          },
        });
        
        // A caller synchronously driving one task quantum (for
        // example, subtask.cancel) waits for the resumed task to
        // either resolve or suspend again.
        task.notifyProgress();
        
        this.runTickLoop();
        _checkForDeadlock();
        
        return promise;
      }
      
      resumeTaskByID(taskID) {
        const meta = this.#removeSuspendedTaskMeta(taskID);
        if (!meta) { return false; }
        if (meta.taskID !== taskID) { throw new Error('task ID does not match'); }
        meta.resume();
        return true;
      }
      
      suspendedTaskReady(taskID) {
        const meta = this.#getSuspendedTaskMeta(taskID);
        if (!meta) { return false; }
        if (!meta.readyFn) {
          throw new Error(`suspended task [${taskID}] is missing a readiness function`);
        }
        if (meta.task.isRejected()) { return true; }
        if (!meta.readyFn()) { return false; }
        return !meta.task.needsExclusiveLock()
        || !this.isExclusivelyLocked()
        || this.exclusivelyLockedBy(taskID);
      }
      
      suspendedTaskCancellable(taskID) {
        return !!this.#getSuspendedTaskMeta(taskID)?.cancellable;
      }
      
      isTaskSuspended(taskID) {
        return this.#suspendedTasksByTaskID.has(taskID);
      }
      
      suspendedTaskMetas() {
        return this.#suspendedTasksByTaskID.values();
      }
      
      addPendingTaskStart() { this.#pendingTaskStarts++; }
      removePendingTaskStart() { this.#pendingTaskStarts--; }
      
      hasPendingSchedulerWork() {
        if (this.#pendingTaskStarts > 0) { return true; }
        if (this.#lockHandoffScheduled) { return true; }
        for (const meta of this.#suspendedTasksByTaskID.values()) {
          if (meta.task.isRejected() || meta.readyFn()) { return true; }
        }
        return false;
      }
      
      async runTickLoop() {
        if (this.#tickLoop !== null) { return; }
        this.#tickLoop = 1;
        setTimeout(async () => {
          let result = this.tick();
          while (result !== ComponentAsyncState.TickResult.DONE) {
            if (result === ComponentAsyncState.TickResult.IDLE) {
              _checkForDeadlock();
            }
            // After resuming a task, re-tick as soon as the resumed
            // slice's microtask continuations have drained (timeout 0)
            // so queued sibling resumptions aren't charged the idle
            // polling interval; otherwise poll at the idle cadence.
            const delay = result === ComponentAsyncState.TickResult.RESUMED ? 0 : 10;
            await new Promise((resolve) => setTimeout(resolve, delay));
            result = this.tick();
          }
          this.#tickLoop = null;
        }, 10);
      }
      
      tick() {
        // _debugLog('[ComponentAsyncState#tick()]', { suspendedTaskIDs: this.#suspendedTaskIDs });
        
        const resumableTasks = this.#suspendedTaskIDs.filter(t => t !== null);
        for (const taskID of resumableTasks) {
          const meta = this.#suspendedTasksByTaskID.get(taskID);
          if (!meta || !meta.readyFn) {
            throw new Error(`missing/invalid task despite ID [${taskID}] being present`);
          }
          
          // If the task failed via any means, allow the task to resume because
          // it's been cancelled -- the callback should immediately exit as well
          if (meta.task.isRejected()) {
            _debugLog('[ComponentAsyncState#tick()] detected task rejection, leaving early', { meta });
            this.resumeTaskByID(taskID);
            return ComponentAsyncState.TickResult.RESUMED;
          }
          
          const isReady = this.suspendedTaskReady(taskID);
          if (!isReady) { continue; }
          
          _debugLog('[ComponentAsyncState#tick()] resuming task via tick', {
            taskID,
            componentIdx: this.#componentIdx,
          });
          this.resumeTaskByID(taskID);
          
          // NOTE: during single-flight resumption, we should resume at most one task per
          // tick so that the resumed slice (a microtask continuation)
          // runs -- and its current-task register window opens and
          // closes -- before any sibling task of this component is
          // resumed.
          //
          // Resuming multiple suspended tasks in one synchronous
          // cascade interleaves their register save/restore windows
          // ([restoreA, restoreB, resumeA, resumeB]), re-entering wasm
          // with the register naming the wrong task, and the
          // 'known residual' of the JSPI current-task register
          // fix); with concurrent task lifetimes per component this
          // corrupts guest context-local storage.
          return ComponentAsyncState.TickResult.RESUMED;
        }
        
        const idle = this.#suspendedTaskIDs.filter(t => t !== null).length > 0;
        return idle
        ? ComponentAsyncState.TickResult.IDLE
        : ComponentAsyncState.TickResult.DONE;
      }
      
      createWaitable(args) {
        return new Waitable({ target: args?.target, });
      }
    }
    
    function getOrCreateAsyncState(componentIdx, init) {
      if (!ASYNC_STATE.has(componentIdx)) {
        const newState = new ComponentAsyncState({ componentIdx });
        ASYNC_STATE.set(componentIdx, newState);
      }
      return ASYNC_STATE.get(componentIdx);
    }
    const symbolDispose = Symbol.dispose || Symbol.for('dispose');
    
    // Dispose of a host-provided value that a guest discarded, using `disposeFn`
    // if provided, otherwise the value's `Symbol.asyncDispose` or `Symbol.dispose`.
    //
    // Disposal runs in a microtask, so host code never runs inside a canonical
    // built-in (where it could re-enter the component), and errors are reported
    // rather than surfaced to the guest.
    function _disposeHostValue(value, disposeFn) {
      if (!disposeFn) {
        if (value === null || (typeof value !== 'object' && typeof value !== 'function')) { return; }
        if (typeof Symbol.asyncDispose === 'symbol' && typeof value[Symbol.asyncDispose] === 'function') {
          disposeFn = value[Symbol.asyncDispose];
        } else if (typeof value[symbolDispose] === 'function') {
          disposeFn = value[symbolDispose];
        } else {
          return;
        }
      }
      const reportErr = (err) => console.error('[jco] error while disposing discarded host value', err);
      queueMicrotask(() => {
        try {
          const res = disposeFn.call(value);
          if (res && typeof res.then === 'function') { res.then(undefined, reportErr); }
        } catch (err) {
          reportErr(err);
        }
      });
    }
    
    const GLOBAL_COMPONENT_MEMORY_MAP = new Map();
    
    function lookupMemoriesForComponent(args) {
      const { componentIdx } = args ?? {};
      if (args.componentIdx === undefined) { throw new TypeError("missing component idx"); }
      
      const metas = GLOBAL_COMPONENT_MEMORY_MAP.get(componentIdx);
      if (!metas) { return []; }
      
      if (args.memoryIdx === undefined) {
        return Object.values(metas);
      }
      
      const meta = metas[args.memoryIdx];
      return meta?.memory;
    }
    
    class AsyncSubtask {
      static _ID = 0n;
      
      static State = {
        STARTING: 0,
        STARTED: 1,
        RETURNED: 2,
        CANCELLED_BEFORE_STARTED: 3,
        CANCELLED_BEFORE_RETURNED: 4,
      };
      
      #id;
      #state = AsyncSubtask.State.STARTING;
      #componentIdx;
      
      #parentTask;
      #childTask = null;
      
      #dropped = false;
      #cancelRequested = false;
      
      #memoryIdx = null;
      #lenders = null;
      
      #waitable = null;
      
      #callbackFn = null;
      #callbackFnName = null;
      
      #postReturnFn = null;
      #onProgressFn = null;
      #pendingEventFn = null;
      
      #callMetadata = {};
      
      #resolved = false;
      
      #onResolveHandlers = [];
      #onStartHandlers = [];
      
      #result = null;
      #resultSet = false;
      
      // Pending value returned by a host implementation of this (async import)
      // subtask, held so it can be disposed if the guest discards the call
      #hostPendingResult = null;
      
      fnName;
      target;
      isAsync;
      isManualAsync;
      // One execution slice awaited by the conditional cancel trampoline.
      cancelProgress = null;
      
      constructor(args) {
        if (typeof args.componentIdx !== 'number') {
          throw new Error('invalid componentIdx for subtask creation');
        }
        this.#componentIdx = args.componentIdx;
        
        this.#id = ++AsyncSubtask._ID;
        this.fnName = args.fnName;
        
        if (!args.parentTask) { throw new Error('missing parent task during subtask creation'); }
        this.#parentTask = args.parentTask;
        
        if (args.childTask) { this.#childTask = args.childTask; }
        
        if (args.memoryIdx) { this.#memoryIdx = args.memoryIdx; }
        
        if (!args.waitable) { throw new Error("missing/invalid waitable"); }
        this.#waitable = args.waitable;
        
        if (args.callMetadata) { this.#callMetadata = args.callMetadata; }
        
        this.#lenders = [];
        this.target = args.target;
        this.isAsync = args.isAsync;
        this.isManualAsync = args.isManualAsync;
      }
      
      id() { return this.#id; }
      parentTaskID() { return this.#parentTask?.id(); }
      childTaskID() { return this.#childTask?.id(); }
      state() { return this.#state; }
      
      waitable() { return this.#waitable; }
      waitableRep() { return this.#waitable.idx(); }
      
      join() { return this.#waitable.join(...arguments); }
      getPendingEvent() { return this.#waitable.getPendingEvent(...arguments); }
      hasPendingEvent() { return this.#waitable.hasPendingEvent(...arguments); }
      setPendingEvent() { return this.#waitable.setPendingEvent(...arguments); }
      
      setTarget(tgt) { this.target = tgt; }
      
      getResult() {
        if (!this.#resultSet) { throw new Error("subtask result has not been set") }
        return this.#result;
      }
      setResult(v) {
        if (this.#resultSet) { throw new Error("subtask result has already been set"); }
        this.#result = v;
        this.#resultSet = true;
      }
      
      componentIdx() { return this.#componentIdx; }
      
      setChildTask(t) {
        if (!t) { throw new Error('cannot set missing/invalid child task on subtask'); }
        if (this.#childTask) { throw new Error('child task is already set on subtask'); }
        if (this.#parentTask === t) { throw new Error("parent cannot be child"); }
        this.#childTask = t;
      }
      getChildTask(t) { return this.#childTask; }
      
      getParentTask() { return this.#parentTask; }
      
      setCallbackFn(f, name) {
        if (!f) { return; }
        if (this.#callbackFn) { throw new Error('callback fn can only be set once'); }
        this.#callbackFn = f;
        this.#callbackFnName = name;
      }
      
      getCallbackFnName() {
        if (!this.#callbackFn) { return undefined; }
        return this.#callbackFn.name;
      }
      
      setPostReturnFn(f) {
        if (!f) { return; }
        if (this.#postReturnFn) { throw new Error('postReturn fn can only be set once'); }
        this.#postReturnFn = f;
      }
      
      setOnProgressFn(f) {
        if (this.#onProgressFn) { throw new Error('on progress fn can only be set once'); }
        this.#onProgressFn = f;
      }
      
      isNotStarted() {
        return this.#state == AsyncSubtask.State.STARTING;
      }
      
      cancellationRequested() { return this.#cancelRequested; }
      
      // Request cooperative cancellation of this subtask, on behalf of the
      // supertask (i.e. `canon subtask.cancel`).
      //
      // If the callee is another guest task, the request is delivered to it and
      // the callee confirms via `task.cancel` (or still resolves via `task.return`).
      //
      // If the callee is a host function, the pending call is treated as
      // immediately cancelled -- consistent with hosts being expected to resolve
      // cancellation promptly -- and any later host resolution is discarded
      // (see `AsyncTask#onResolve`). The host is notified of the discard by
      // disposing the pending value it returned (see `setHostPendingResult`).
      requestCancellation() {
        _debugLog('[AsyncSubtask#requestCancellation()] args', {
          componentIdx: this.#componentIdx,
          subtaskID: this.#id,
          state: this.#state,
          childTaskID: this.childTaskID(),
          fnName: this.fnName,
        });
        if (this.#cancelRequested) {
          throw new Error('cancellation has already been requested for this subtask');
        }
        this.#cancelRequested = true;
        
        if (this.#resolved) { return; }
        
        if (this.#childTask) {
          this.#childTask.requestCancellation();
          return;
        }
        
        this.onResolve(null);
        this.#disposeHostPendingResult();
      }
      
      // Record the value returned by the host implementation of this subtask.
      //
      // Host imports may return a thenable that implements `Symbol.asyncDispose`
      // or `Symbol.dispose`. If the guest cancels the call before its result is
      // delivered, the result is discarded and the thenable is disposed so the
      // host can stop pending work and release anything it produced.
      setHostPendingResult(v) {
        if (v === null || (typeof v !== 'object' && typeof v !== 'function') || typeof v.then !== 'function') {
          return;
        }
        this.#hostPendingResult = v;
        if (this.#resolved && this.#state !== AsyncSubtask.State.RETURNED) {
          this.#disposeHostPendingResult();
        }
      }
      
      #disposeHostPendingResult() {
        const pending = this.#hostPendingResult;
        if (!pending) { return; }
        this.#hostPendingResult = null;
        _disposeHostValue(pending);
      }
      
      registerOnStartHandler(f) {
        this.#onStartHandlers.push(f);
      }
      
      onStart(args) {
        _debugLog('[AsyncSubtask#onStart()] args', {
          componentIdx: this.#componentIdx,
          subtaskID: this.#id,
          parentTaskID: this.parentTaskID(),
          fnName: this.fnName,
          args,
        });
        
        if (this.#onProgressFn) { this.#onProgressFn(); }
        
        // Starting a nested operation is a task execution boundary.
        // In particular, a cancellation handler may synchronously
        // enter an import which then suspends in the host.  Wake a
        // supertask that is driving one cancellation slice so an
        // async `subtask.cancel` can report BLOCKED without waiting
        // for that nested operation to finish.
        this.#parentTask.notifyProgress();
        
        this.#state = AsyncSubtask.State.STARTED;
        
        let result;
        
        // If we have been provided a helper start function as a result of
        // component fusion performed by wasmtime tooling, then we can call that helper and lifts/lowers will
        // be performed for us.
        //
        // See also documentation on `HostIntrinsic::PrepareCall`
        //
        if (this.#callMetadata.startFn) {
          result = this.#callMetadata.startFn.apply(null, args?.startFnParams ?? []);
        }
        
        return result;
      }
      
      
      registerOnResolveHandler(f) {
        this.#onResolveHandlers.push(f);
      }
      
      reject(subtaskErr) {
        if (this.#resolved) { return; }
        
        if (this.#onProgressFn) { this.#onProgressFn(); }
        
        if (this.#state === AsyncSubtask.State.STARTING) {
          this.#state = AsyncSubtask.State.CANCELLED_BEFORE_STARTED;
        } else if (this.#state === AsyncSubtask.State.STARTED) {
          this.#state = AsyncSubtask.State.CANCELLED_BEFORE_RETURNED;
        } else {
          throw new Error('cannot reject a completed subtask');
        }
        
        this.#resolved = true;
        this.#hostPendingResult = null;
        this.#parentTask.removeSubtask(this);
        this.#parentTask.reject(subtaskErr);
      }
      
      onResolve(subtaskValue) {
        _debugLog('[AsyncSubtask#onResolve()] args', {
          componentIdx: this.#componentIdx,
          subtaskID: this.#id,
          isAsync: this.isAsync,
          childTaskID: this.childTaskID(),
          parentTaskID: this.parentTaskID(),
          parentTaskFnName: this.#parentTask?.entryFnName(),
          fnName: this.fnName,
        });
        
        if (this.#resolved) {
          throw new Error('subtask has already been resolved');
        }
        
        if (this.#onProgressFn) { this.#onProgressFn(); }
        
        if (subtaskValue === null && this.#cancelRequested) {
          if (this.#state === AsyncSubtask.State.STARTING) {
            this.#state = AsyncSubtask.State.CANCELLED_BEFORE_STARTED;
          } else {
            if (this.#state !== AsyncSubtask.State.STARTED) {
              throw new Error('resolved subtask must have been started before cancellation');
            }
            this.#state = AsyncSubtask.State.CANCELLED_BEFORE_RETURNED;
          }
        } else {
          if (this.#state !== AsyncSubtask.State.STARTED) {
            throw new Error('resolved subtask must have been started before completion');
          }
          this.#state = AsyncSubtask.State.RETURNED;
          // The host result is delivered to the guest, so it is no longer ours to dispose
          this.#hostPendingResult = null;
        }
        
        this.setResult(subtaskValue);
        
        for (const f of this.#onResolveHandlers) {
          try {
            f(subtaskValue);
          } catch (err) {
            console.error("error during subtask resolve handler", err);
            throw err;
          }
        }
        
        const callMetadata = this.getCallMetadata();
        
        // TODO(fix): we should be able to easily have the caller's meomry
        // to lower into here, but it's not present in PrepareCall
        const memory = callMetadata.memory ?? this.#parentTask?.getReturnMemory() ?? lookupMemoriesForComponent({ componentIdx: this.#parentTask?.componentIdx() })[0];
        // NOTE: cancelled resolutions carry no value, so nothing is lowered
        const returned = this.#state === AsyncSubtask.State.RETURNED;
        if (returned && callMetadata && !callMetadata.returnFn && (this.isAsync || callMetadata.funcTypeIsAsync) && callMetadata.resultPtr && memory) {
          const { resultPtr, realloc } = callMetadata;
          const lowers = callMetadata.lowers; // may have been updated in task.return of the child
          if (lowers && lowers.length > 0) {
            lowers[0]({
              componentIdx: this.#componentIdx,
              memory,
              realloc,
              vals: [subtaskValue],
              storagePtr: resultPtr,
              stringEncoding: callMetadata.stringEncoding,
            });
          }
        }
        
        this.#resolved = true;
        this.#parentTask.removeSubtask(this);
        
        if (!this.isAsync) {
          this.deliverResolve();
          const rep = this.waitableRep();
          if (rep) {
            try {
              const removed = this.#getComponentState().handles.remove(rep);
              if (removed !== this) {
                throw new Error("unexpectedly received non-self Subtask from handle removal");
              }
              this.drop();
            } catch (err) {
              _debugLog('[AsyncSubtask#onResolve()] failed to remove subtask after sync subtask completion', err);
            }
          }
        }
      }
      
      getStateNumber() { return this.#state; }
      isReturned() { return this.#state === AsyncSubtask.State.RETURNED; }
      
      getCallMetadata() { return this.#callMetadata; }
      
      isResolved() {
        if (this.#state === AsyncSubtask.State.STARTING
        || this.#state === AsyncSubtask.State.STARTED) {
          return false;
        }
        if (this.#state === AsyncSubtask.State.RETURNED
        || this.#state === AsyncSubtask.State.CANCELLED_BEFORE_STARTED
        || this.#state === AsyncSubtask.State.CANCELLED_BEFORE_RETURNED) {
          return true;
        }
        throw new Error('unrecognized internal Subtask state [' + this.#state + ']');
      }
      
      addLender(handle) {
        _debugLog('[AsyncSubtask#addLender()] args', { handle });
        if (!Number.isNumber(handle)) { throw new Error('missing/invalid lender handle [' + handle + ']'); }
        
        if (this.#lenders.length === 0 || this.isResolved()) {
          throw new Error('subtask has no lendors or has already been resolved');
        }
        
        handle.lends++;
        this.#lenders.push(handle);
      }
      
      deliverResolve() {
        _debugLog('[AsyncSubtask#deliverResolve()] args', {
          lenders: this.#lenders,
          parentTaskID: this.parentTaskID(),
          subtaskID: this.#id,
          childTaskID: this.childTaskID(),
          resolved: this.isResolved(),
          resolveDelivered: this.resolveDelivered(),
        });
        
        const cannotDeliverResolve = this.resolveDelivered() || !this.isResolved();
        if (cannotDeliverResolve) {
          throw new Error('subtask cannot deliver resolution twice, and the subtask must be resolved');
        }
        
        for (const lender of this.#lenders) {
          lender.lends--;
        }
        
        this.#lenders = null;
      }
      
      resolveDelivered() {
        _debugLog('[AsyncSubtask#resolveDelivered()] args', { });
        if (this.#lenders === null && !this.isResolved()) {
          throw new Error('invalid subtask state, lenders missing and subtask has not been resolved');
        }
        return this.#lenders === null;
      }
      
      drop() {
        _debugLog('[AsyncSubtask#drop()] args', {
          componentIdx: this.#componentIdx,
          parentTaskID: this.#parentTask?.id(),
          parentTaskFnName: this.#parentTask?.entryFnName(),
          childTaskID: this.#childTask?.id(),
          childTaskFnName: this.#childTask?.entryFnName(),
          subtaskFnName: this.fnName,
        });
        if (!this.#waitable) { throw new Error('missing/invalid inner waitable'); }
        if (!this.resolveDelivered()) {
          throw new Error('cannot drop a subtask which has not yet resolved');
        }
        if (this.#waitable) { this.#waitable.drop() }
        this.#dropped = true;
      }
      
      #getComponentState() {
        const state = getOrCreateAsyncState(this.#componentIdx);
        if (!state) {
          throw new Error('invalid/missing async state for component [' + componentIdx + ']');
        }
        return state;
      }
      
      getWaitableHandleIdx() {
        _debugLog('[AsyncSubtask#getWaitableHandleIdx()] args', { });
        if (!this.#waitable) { throw new Error('missing/invalid waitable'); }
        return this.waitableRep();
      }
    }
    
    class FutureValue {
      #start;
      #settled;
      #hideThen = 0;
      #thenFn;
      
      constructor(start) {
        if (typeof start !== 'function') {
          throw new TypeError('future start operation must be a function');
        }
        this.#start = start;
        this.#thenFn = this.#then.bind(this);
      }
      
      get then() {
        return this.#hideThen === 0 ? this.#thenFn : undefined;
      }
      
      #read() {
        if (!this.#settled) {
          // The start operation resolves to a non-thenable box so a
          // future-valued payload cannot be assimilated by this Promise.
          this.#settled = Promise.resolve().then(this.#start);
        }
        return this.#settled;
      }
      
      resolveAsValue(resolve) {
        this.#hideThen++;
        try {
          resolve(this);
        } finally {
          this.#hideThen--;
        }
      }
      
      #deliver(resolve, value) {
        if (value instanceof FutureValue) {
          // Promise resolution reads `then` synchronously. Hide it only
          // for that lookup so resolving this layer yields the inner
          // FutureValue instead of recursively awaiting it.
          value.resolveAsValue(resolve);
          return;
        }
        resolve(value);
      }
      
      #then(resolve, reject) {
        return this.#read().then(
        box => this.#deliver(resolve, box.value),
        reject,
        );
      }
    }
    const ASYNC_DETERMINISM = 'random';
    const _coinFlip = () => { return Math.random() > 0.5; };
    
    const ASYNC_EVENT_CODE = {
      NONE: 0,
      SUBTASK: 1,
      STREAM_READ: 2,
      STREAM_WRITE: 3,
      FUTURE_READ: 4,
      FUTURE_WRITE: 5,
      TASK_CANCELLED: 6,
    };
    const CURRENT_TASK_META = {};
    
    function _withGlobalCurrentTaskMeta(args) {
      _debugLog('[_withGlobalCurrentTaskMeta()] args', args);
      if (!args) { throw new TypeError('args missing'); }
      if (args.taskID === undefined) { throw new TypeError('missing task ID'); }
      if (args.componentIdx === undefined) { throw new TypeError('missing component idx'); }
      if (!args.fn) { throw new TypeError('missing fn'); }
      const { taskID, componentIdx, fn } = args;
      const previous = CURRENT_TASK_META[componentIdx] ?? null;
      const previousCurrent = CURRENT_TASK_META.current ?? null;
      
      try {
        CURRENT_TASK_META.current =
        CURRENT_TASK_META[componentIdx] = { taskID, componentIdx };
        return fn();
      } catch (err) {
        _debugLog("error while executing sync callee/callback", {
          ...args,
          err,
        });
        throw err;
      } finally {
        // Synchronous wrappers can nest without any intervening JS
        // scheduling. Restore the caller rather than clearing it so
        // helper core exports (for example fused return adapters) can
        // temporarily run under a different task of the same component.
        CURRENT_TASK_META[componentIdx] = previous;
        CURRENT_TASK_META.current = previousCurrent;
      }
    }
    
    async function _withGlobalCurrentTaskMetaAsync(args) {
      _debugLog('[_withGlobalCurrentTaskMetaAsync()] args', args);
      if (!args) { throw new TypeError('args missing'); }
      if (args.taskID === undefined) { throw new TypeError('missing task ID'); }
      if (args.componentIdx === undefined) { throw new TypeError('missing component idx'); }
      if (!args.fn) { throw new TypeError('missing fn'); }
      
      const { taskID, componentIdx, fn } = args;
      
      try {
        CURRENT_TASK_META.current =
        CURRENT_TASK_META[componentIdx] = { taskID, componentIdx };
        return await fn();
      } catch (err) {
        _debugLog("error while executing async callee/callback", {
          ...args,
          err,
        });
        throw err;
      } finally {
        CURRENT_TASK_META[componentIdx] = null;
        if (CURRENT_TASK_META.current?.taskID === taskID) {
          CURRENT_TASK_META.current = null;
        }
      }
    }
    
    class AsyncTask {
      static _ID = 0n;
      
      static State = {
        INITIAL: 'initial',
        CANCELLED: 'cancelled',
        CANCEL_PENDING: 'cancel-pending',
        CANCEL_DELIVERED: 'cancel-delivered',
        RESOLVED: 'resolved',
      }
      
      static BlockResult = {
        CANCELLED: 'block.cancelled',
        NOT_CANCELLED: 'block.not-cancelled',
      }
      
      #id;
      #componentIdx;
      #state;
      #isAsync;
      #isManualAsync;
      #callingWasmExport = true;
      #lockFreeEntry = false;
      #preserveFutureResult;
      #entryFnName = null;
      
      #onResolveHandlers = [];
      #progressWaiters = [];
      #completionPromise = null;
      #completionValue;
      #completionReady = false;
      #settleCompletionPromise;
      #rejected = false;
      
      #exitPromise = null;
      #onExitHandlers = [];
      
      #memoryIdx = null;
      #memory = null;
      
      #callbackFn = null;
      #callbackFnName = null;
      
      #postReturnFn = null;
      
      #getCalleeParamsFn = null;
      #calleeIsAsync = null;
      
      #stringEncoding = null;
      
      #parentSubtask = null;
      
      #errHandling;
      
      #backpressurePromise;
      #backpressureWaiters = 0n;
      
      #returnLowerFns = null;
      
      #resourceScopeId;
      #resourceBorrowCount = 0;
      #resourceLenders = [];
      #resourceScopeExited = false;
      
      #subtasks = [];
      
      #entered = false;
      #exited = false;
      #errored = null;
      
      cancelled = false;
      cancelRequested = false;
      alwaysTaskReturn = false;
      
      returnCalls =  0;
      storage = [0, 0];
      tmpRetI64HighBits = 0|0;
      
      constructor(opts) {
        this.#id = ++AsyncTask._ID;
        this.#resourceScopeId = ++RESOURCE_SCOPE_ID;
        RESOURCE_SCOPE_TASKS.set(this.#resourceScopeId, this);
        
        if (opts?.componentIdx === undefined) {
          throw new TypeError('missing component id during task creation');
        }
        this.#componentIdx = opts.componentIdx;
        
        this.#state = AsyncTask.State.INITIAL;
        this.#isAsync = opts?.isAsync ?? false;
        this.#isManualAsync = opts?.isManualAsync ?? false;
        this.#preserveFutureResult = opts?.preserveFutureResult ?? false;
        this.#entryFnName = opts.entryFnName;
        // Tasks that execute guest slices (export calls, fused
        // callees) default to true; import-handler tasks pass false
        // explicitly (they run host code nested inside the caller's
        // already-locked slice).
        this.#callingWasmExport = opts?.callingWasmExport !== false;
        
        const {
          promise: completionPromise,
          resolve: resolveCompletionPromise,
          reject: rejectCompletionPromise,
        } = promiseWithResolvers();
        this.#completionPromise = completionPromise;
        // A nested rejection can reach the root task while its Wasm
        // entrypoint is still suspended, before the export wrapper awaits
        // this promise. Mark it handled immediately while preserving the
        // original rejected promise for the eventual caller.
        completionPromise.catch(() => {});
        
        let completionSettled = false;
        const settleCompletionPromise = () => {
          if (completionSettled || !this.#completionReady) { return; }
          completionSettled = true;
          if (this.#errored !== null) {
            rejectCompletionPromise(this.#errored);
          } else if (this.#rejected) {
            rejectCompletionPromise(this.#completionValue);
          } else if (
          this.#preserveFutureResult
          && this.#completionValue instanceof FutureValue
          ) {
            this.#completionValue.resolveAsValue(resolveCompletionPromise);
          } else {
            resolveCompletionPromise(this.#completionValue);
          }
        };
        
        this.#settleCompletionPromise = settleCompletionPromise;
        this.#onResolveHandlers.push((results) => {
          if (this.#parentSubtask !== null) { return; }
          if (!this.#isAsync && !this.#isManualAsync) { return; }
          this.#completionValue = results;
          this.#completionReady = true;
          // Publish after the current guest slice returns, so a trap
          // in that slice can still reject the call. Do not wait for
          // task exit: detached work may require further host calls
          // or consumption of a returned resource's stream.
        });
        
        const {
          promise: exitPromise,
          resolve: resolveExitPromise,
          reject: rejectExitPromise,
        } = promiseWithResolvers();
        this.#exitPromise = exitPromise;
        
        this.#onExitHandlers.push(() => {
          if (this.#parentSubtask === null && (this.#isAsync || this.#isManualAsync)) {
            settleCompletionPromise();
          }
          resolveExitPromise();
        });
        
        if (opts.callbackFn) { this.#callbackFn = opts.callbackFn; }
        if (opts.callbackFnName) { this.#callbackFnName = opts.callbackFnName; }
        
        if (opts.getCalleeParamsFn) { this.#getCalleeParamsFn = opts.getCalleeParamsFn; }
        if (opts.stringEncoding) { this.#stringEncoding = opts.stringEncoding; }
        
        if (opts.parentSubtask) { this.#parentSubtask = opts.parentSubtask; }
        
        
        if (opts.errHandling) { this.#errHandling = opts.errHandling; }
      }
      
      taskState() { return this.#state; }
      id() { return this.#id; }
      componentIdx() { return this.#componentIdx; }
      entryFnName() { return this.#entryFnName; }
      
      resourceScopeId() { return this.#resourceScopeId; }
      
      addBorrowedHandle() {
        if (this.#resourceScopeExited) {
          throw new Error('cannot add a borrow to an exited resource scope');
        }
        this.#resourceBorrowCount++;
      }
      
      removeBorrowedHandle() {
        if (this.#resourceBorrowCount === 0) {
          throw new Error('resource borrow count underflow');
        }
        this.#resourceBorrowCount--;
      }
      
      addResourceLender(table, handle) {
        if (this.#resourceScopeExited) {
          throw new Error('cannot add a lender to an exited resource scope');
        }
        this.#resourceLenders.push({ table, handle });
      }
      
      validateResourceBorrowScope() {
        if (this.#resourceScopeExited) { return; }
        if (this.#resourceBorrowCount !== 0) {
          throw new WebAssemblyRuntimeError('borrow handles still remain at the end of the call');
        }
        for (const { table, handle } of this.#resourceLenders) {
          const idx = handle << 1;
          const lendCount = table[idx];
          if (!Number.isInteger(lendCount) || lendCount <= 0 || lendCount >= 2**30) {
            throw new Error('invalid resource lender state at scope exit');
          }
          table[idx] = lendCount - 1;
        }
        this.#resourceLenders = [];
        this.#resourceScopeExited = true;
        RESOURCE_SCOPE_TASKS.delete(this.#resourceScopeId);
      }
      
      completionPromise() { return this.#completionPromise; }
      settleCompletion() { this.#settleCompletionPromise(); }
      exitPromise() { return this.#exitPromise; }
      
      waitForProgress() {
        const { promise, resolve } = promiseWithResolvers();
        this.#progressWaiters.push(resolve);
        return promise;
      }
      
      notifyProgress() {
        const waiters = this.#progressWaiters;
        this.#progressWaiters = [];
        for (const resolve of waiters) { resolve(); }
      }
      
      isAsync() { return this.#isAsync; }
      isManualAsync() { return this.#isManualAsync; }
      isSync() { return !this.isAsync(); }
      
      getErrHandling() { return this.#errHandling; }
      
      hasCallback() { return this.#callbackFn !== null; }
      
      getReturnMemoryIdx() { return this.#memoryIdx; }
      setReturnMemoryIdx(idx) {
        if (idx === null) { return; }
        this.#memoryIdx = idx;
      }
      
      getReturnMemory() { return this.#memory; }
      setReturnMemory(m) {
        if (m === null) { return; }
        this.#memory = m;
      }
      
      setReturnLowerFns(fns) { this.#returnLowerFns = fns; }
      getReturnLowerFns() { return this.#returnLowerFns; }
      
      setCalleeIsAsync(value) {
        if (typeof value !== 'boolean') { throw new TypeError('callee async state must be a boolean'); }
        this.#calleeIsAsync = value;
      }
      
      setParentSubtask(subtask) {
        if (!subtask || !(subtask instanceof AsyncSubtask)) { return }
        if (this.#parentSubtask) { throw new Error('parent subtask can only be set once'); }
        this.#parentSubtask = subtask;
      }
      
      getParentSubtask() { return this.#parentSubtask; }
      
      // TODO(threads): this is very inefficient, we can pass along a root task,
      // and ideally do not need this once thread support is in place
      getRootTask() {
        let currentSubtask = this.getParentSubtask();
        let task = this;
        while (currentSubtask) {
          task = currentSubtask.getParentTask();
          currentSubtask = task.getParentSubtask();
        }
        return task;
      }
      
      setPostReturnFn(f) {
        if (!f) { return; }
        if (this.#postReturnFn) { throw new Error('postReturn fn can only be set once'); }
        this.#postReturnFn = f;
      }
      
      setCallbackFn(f, name) {
        if (!f) { return; }
        if (this.#callbackFn) { throw new Error('callback fn can only be set once'); }
        this.#callbackFn = f;
        this.#callbackFnName = name;
      }
      
      getCallbackFnName() {
        if (!this.#callbackFnName) { return undefined; }
        return this.#callbackFnName;
      }
      
      runCallbackFn(...args) {
        if (!this.#callbackFn) { throw new Error('no callback function has been set for task'); }
        if (this.#callbackFn._jcoMaySuspend === false) {
          return _withGlobalCurrentTaskMeta({
            taskID: this.#id,
            componentIdx: this.#componentIdx,
            fn: () => this.#callbackFn.apply(null, args),
          });
        }
        return _withGlobalCurrentTaskMetaAsync({
          taskID: this.#id,
          componentIdx: this.#componentIdx,
          fn: () => { return this.#callbackFn.apply(null, args); }
        });
      }
      
      getCalleeParams() {
        if (!this.#getCalleeParamsFn) { throw new Error('missing/invalid getCalleeParamsFn'); }
        return this.#getCalleeParamsFn();
      }
      
      // Legacy manually-async exports are sync-typed in the component
      // but use JSPI precisely so their guest stack may suspend.
      mayBlock() { return this.isAsync() || this.isManualAsync() || this.isResolvedState() }
      
      mayEnter(task) {
        const cstate = getOrCreateAsyncState(this.#componentIdx);
        if (cstate.hasBackpressure()) {
          _debugLog('[AsyncTask#mayEnter()] disallowed due to backpressure', { taskID: this.#id });
          return false;
        }
        if (!cstate.callingSyncImport()) {
          _debugLog('[AsyncTask#mayEnter()] disallowed due to sync import call', { taskID: this.#id });
          return false;
        }
        const callingSyncExportWithSyncPending = cstate.callingSyncExport && !task.isAsync;
        if (!callingSyncExportWithSyncPending) {
          _debugLog('[AsyncTask#mayEnter()] disallowed due to sync export w/ sync pending', { taskID: this.#id });
          return false;
        }
        return true;
      }
      
      enterSync() {
        if (this.needsExclusiveLock()) {
          const cstate = getOrCreateAsyncState(this.#componentIdx);
          if (!cstate.isExclusivelyLocked()) {
            cstate.exclusiveLock(this.#id);
          } else {
            // A host-called sync export arriving while another
            // task's slice holds the lock: synchronous entry
            // cannot wait, and historically this entry silently
            // stole the hold. Run without the lock instead --
            // the holder's bookkeeping stays intact and its
            // release still pairs
            this.#lockFreeEntry = true;
            _debugLog('[AsyncTask#enterSync()] entering without exclusive lock', {
              taskID: this.#id,
              componentIdx: this.#componentIdx,
            });
          }
        }
        return true;
      }
      
      tryEnter() {
        if (this.#entered) {
          throw new Error(`task with ID [${this.#id}] should not be entered twice`);
        }
        
        if (this.deliverPendingCancel({ cancellable: true })) {
          this.cancel();
          return false;
        }
        
        const cstate = getOrCreateAsyncState(this.#componentIdx);
        if (this.isSync()) {
          this.#entered = true;
          return true;
        }
        if (cstate.hasBackpressure()) { return null; }
        if (this.needsExclusiveLock()) {
          if (cstate.isExclusivelyLocked()) { return null; }
          cstate.exclusiveLock(this.#id);
        }
        
        if (this.deliverPendingCancel({ cancellable: true })) {
          cstate.exclusiveRelease(this.#id);
          this.cancel();
          return false;
        }
        
        this.#entered = true;
        return true;
      }
      
      async enter(opts) {
        _debugLog('[AsyncTask#enter()] args', {
          taskID: this.#id,
          componentIdx: this.#componentIdx,
          subtaskID: this.getParentSubtask()?.id(),
          args: opts,
          entryFnName: this.#entryFnName,
        });
        
        if (this.#entered) {
          throw new Error(`task with ID [${this.#id}] should not be entered twice`);
        }
        
        // If cancellation was requested before the task was entered, resolve
        // as cancelled without ever running guest code
        if (this.deliverPendingCancel({ cancellable: true })) {
          this.cancel();
          return false;
        }
        
        const cstate = getOrCreateAsyncState(this.#componentIdx);
        
        if (opts?.isHost) {
          this.#entered = true;
          // A guest task may be synchronously blocked in this
          // host entry. Propagate that boundary so an async
          // cancellation driver can yield BLOCKED while the host
          // operation is outstanding.
          const parentTask = this.#parentSubtask?.getParentTask();
          if (
          parentTask?.taskState() === AsyncTask.State.CANCEL_DELIVERED
          || (parentTask && !parentTask.hasCallback())
          ) {
            parentTask.notifyProgress();
          }
          return this.#entered;
        }
        
        // NOTE: concurrent task lifetimes within one component instance are
        // permitted by the Component Model: entry is governed by the
        // backpressure and exclusive-lock checks below (the lock is held per
        // execution slice, not for the task's lifetime).
        //
        // Serializing entire task lifetimes here (the former "execution slot" queue)
        // deadlocks pipelines where a parked long-lived task's progress depends on a
        // later entry into the same component.
        
        // If a task is synchronous then we can avoid component-relevant
        // tracking and immediately enter.
        if (this.isSync()) {
          this.#entered = true;
          
          // TODO(breaking): remove once manually-specifying async fns is removed
          // It is currently possible for an actually sync export to be specified
          // as async via JSPI
          if (this.#isManualAsync) {
            if (this.needsExclusiveLock()) { await cstate.acquireExclusiveLock(this.#id); }
          }
          
          return this.#entered;
        }
        
        // Perform intial backpressure check
        if (cstate.hasBackpressure()) {
          cstate.addBackpressureWaiter();
          
          const result = await this.waitUntil({
            readyFn: () => {
              return !cstate.hasBackpressure();
            },
            cancellable: true,
          });
          
          cstate.removeBackpressureWaiter();
          
          if (!result || this.isCancelled()) {
            if (!this.isResolvedState()) { this.cancel(); }
            return false;
          }
        }
        
        // Acquire the per-slice exclusive lock (FIFO-queued when
        // contended); the first slice runs under this hold and the
        // driver loop releases/re-acquires it per slice thereafter.
        if (this.needsExclusiveLock()) {
          await cstate.acquireExclusiveLock(this.#id);
        }
        
        // Cancellation-before-start may resolve this task while its
        // queued lock acquisition is still pending. Acquiring the lock
        // does not make the already-resolved task runnable again.
        if (this.isResolvedState() || this.isCancelled()) {
          cstate.exclusiveRelease(this.#id);
          return false;
        }
        
        // Cancellation can be requested while entry is waiting for
        // backpressure or its exclusive lock. Do not execute the guest
        // after acquiring a lock for a task that should no longer start.
        if (this.deliverPendingCancel({ cancellable: true })) {
          cstate.exclusiveRelease(this.#id);
          this.cancel();
          return false;
        }
        
        this.#entered = true;
        return this.#entered;
      }
      
      isRunningState() { return this.#state !== AsyncTask.State.RESOLVED; }
      isResolvedState() { return this.#state === AsyncTask.State.RESOLVED; }
      isResolved() { return this.#state === AsyncTask.State.RESOLVED; }
      isExited() { return this.#exited; }
      
      async waitUntil(opts) {
        const { readyFn, cancellable } = opts;
        _debugLog('[AsyncTask#waitUntil()] args', { taskID: this.#id, args: { cancellable } });
        
        // TODO(fix): check for cancel
        // TODO(fix): determinism
        // TODO(threads): add this thread to waiting list
        
        const keepGoing = await this.suspendUntil({
          readyFn,
          cancellable,
        });
        
        return keepGoing;
      }
      
      async yieldUntil(opts) {
        const { readyFn, cancellable } = opts;
        _debugLog('[AsyncTask#yieldUntil()]', {
          taskID: this.#id,
          args: {
            cancellable,
          },
          componentIdx: this.#componentIdx,
        });
        
        // A callback YIELD is an explicit request to let other work run.
        // Unlike waits whose condition is already ready, it must always
        // suspend for at least one scheduler turn.
        const keepGoing = await this.immediateSuspend({ readyFn, cancellable });
        if (keepGoing) {
          return {
            code: ASYNC_EVENT_CODE.NONE,
            payload0: 0,
            payload1: 0,
          };
        }
        
        return {
          code: ASYNC_EVENT_CODE.TASK_CANCELLED,
          payload0: 0,
          payload1: 0,
        };
      }
      
      async suspendUntil(opts) {
        const { cancellable, readyFn } = opts;
        _debugLog('[AsyncTask#suspendUntil()] args', {
          taskID: this.#id,
          args: {
            cancellable,
          },
          componentIdx: this.#componentIdx,
        });
        
        const pendingCancelled = this.deliverPendingCancel({ cancellable });
        if (pendingCancelled) { return false; }
        
        const completed = await this.immediateSuspendUntil({ readyFn, cancellable });
        return completed;
      }
      
      suspendUntilCallback(opts, onResume) {
        const { cancellable, readyFn } = opts;
        if (this.deliverPendingCancel({ cancellable })) {
          onResume(false);
          return;
        }
        
        const cstate = getOrCreateAsyncState(this.#componentIdx);
        cstate.suspendTask({
          task: this,
          cancellable,
          readyFn: () => {
            if (cancellable && this.#state === AsyncTask.State.CANCEL_PENDING) {
              return true;
            }
            return readyFn();
          },
          onResume: (keepGoing) => {
            if (keepGoing && this.deliverPendingCancel({ cancellable })) {
              keepGoing = false;
            }
            onResume(keepGoing);
          },
        });
      }
      
      // TODO(threads): equivalent to thread.suspend_until()
      async immediateSuspendUntil(opts) {
        const { cancellable, readyFn } = opts;
        _debugLog('[AsyncTask#immediateSuspendUntil()] args', {
          args: {
            cancellable,
            readyFn,
          },
          taskID: this.#id,
          componentIdx: this.#componentIdx,
        });
        
        const ready = readyFn();
        if (ready && ASYNC_DETERMINISM === 'random') {
          const coinFlip = _coinFlip();
          if (coinFlip) { return true }
        }
        
        const keepGoing = await this.immediateSuspend({ cancellable, readyFn });
        return keepGoing;
      }
      
      async immediateSuspend(opts) { // NOTE: equivalent to thread.suspend()
      // TODO(threads): store readyFn on the thread
      const { cancellable, readyFn } = opts;
      _debugLog('[AsyncTask#immediateSuspend()] args', { cancellable, readyFn });
      
      const pendingCancelled = this.deliverPendingCancel({ cancellable });
      if (pendingCancelled) { return false; }
      
      const cstate = getOrCreateAsyncState(this.#componentIdx);
      const keepGoing = await cstate.suspendTask({
        task: this,
        cancellable,
        readyFn: () => {
          // A pending cancellation request wakes cancellable waits
          if (cancellable && this.#state === AsyncTask.State.CANCEL_PENDING) {
            return true;
          }
          return readyFn();
        },
      });
      if (keepGoing && this.deliverPendingCancel({ cancellable })) { return false; }
      return keepGoing;
    }
    
    deliverPendingCancel(opts) {
      const { cancellable } = opts;
      _debugLog('[AsyncTask#deliverPendingCancel()]', {
        args: { cancellable },
        taskID: this.#id,
        componentIdx: this.#componentIdx,
      });
      
      if (cancellable && this.#state === AsyncTask.State.CANCEL_PENDING) {
        this.#state = AsyncTask.State.CANCEL_DELIVERED;
        return true;
      }
      
      return false;
    }
    
    isCancelled() { return this.cancelled }
    cancellationRequested() { return this.cancelRequested; }
    
    // Request cooperative cancellation of this task, called on behalf of a
    // supertask performing `subtask.cancel` on the subtask this task backs.
    //
    // The request is delivered at this task's next cancellable wait
    // (see suspendUntil/immediateSuspend), at which point the task is
    // expected to acknowledge via `task.cancel` or still resolve via
    // `task.return`.
    requestCancellation() {
      _debugLog('[AsyncTask#requestCancellation()] args', {
        taskID: this.#id,
        componentIdx: this.#componentIdx,
        state: this.#state,
      });
      if (this.isResolvedState() || this.cancelRequested) { return; }
      this.cancelRequested = true;
      if (this.#state === AsyncTask.State.INITIAL) {
        this.#state = AsyncTask.State.CANCEL_PENDING;
        // A task still waiting for backpressure or its
        // initial instance lock has no guest thread to
        // resume. Cancellation is therefore delivered
        // and acknowledged eagerly as
        // CANCELLED_BEFORE_STARTED.
        if (!this.#entered) {
          this.deliverPendingCancel({ cancellable: true });
          this.cancel();
          
          const cstate = getOrCreateAsyncState(this.#componentIdx);
          // `enter()` may already be parked either in the scheduler's
          // explicit-backpressure wait or in the exclusive-lock FIFO.
          // Wake/remove that entry work now so it cannot retain a timer,
          // waiter count, or lock-queue slot after cancellation.
          cstate.resumeTaskByID(this.#id);
          cstate.cancelExclusiveLockWaiter(this.#id);
          
          // No guest thread was registered, so no driver loop will call
          // `exit()`. Retire the task's JS bookkeeping explicitly.
          this.exit({ skipExclusiveLockCheck: true });
          return;
        }
      }
      // Nudge the component's tick loop so that any suspended cancellable
      // wait observes the pending cancellation promptly
      getOrCreateAsyncState(this.#componentIdx).runTickLoop();
    }
    
    cancel(args) {
      _debugLog('[AsyncTask#cancel()] args', { });
      if (this.taskState() !== AsyncTask.State.CANCEL_DELIVERED) {
        throw new Error('`task.cancel` called by task which has not been cancelled');
      }
      this.validateResourceBorrowScope();
      this.cancelled = true;
      // Cancelled tasks resolve with no value (spec: `Task.cancel` calls
      // `on_resolve(None)`); an explicit error is only present on the
      // host-driven rejection path (see `reject()`).
      this.onResolve(args?.error ?? null);
      this.#state = AsyncTask.State.RESOLVED;
      // A task cancelled before entry has no driver loop that can
      // report its exit. Entered tasks notify after releasing their
      // component slice in `exit()`.
      if (!this.#entered) { this.notifyProgress(); }
    }
    
    onResolve(taskValue) {
      const handlers = this.#onResolveHandlers;
      this.#onResolveHandlers = [];
      for (const f of handlers) {
        try {
          f(taskValue);
        } catch (err) {
          _debugLog("[AsyncTask#onResolve] error during task resolve handler", err);
          throw err;
        }
      }
      
      // Rejections are control-flow failures, not canonical ABI results.
      // Propagate them through the subtask chain without running return
      // lowering or post-return hooks for a successful result.
      if (this.#rejected) {
        this.#parentSubtask?.reject(taskValue);
        return;
      }
      
      // NOTE: if the parent subtask has already been resolved (e.g. it was
      // cancelled via `subtask.cancel` while this task was still pending),
      // this task's resolution must be discarded rather than delivered.
      const parentSubtaskPending = this.#parentSubtask && !this.#parentSubtask.isResolved();
      const taskReturned = !this.isCancelled();
      
      if (parentSubtaskPending && taskReturned) {
        const meta = this.#parentSubtask.getCallMetadata();
        // Run the rturn fn if it has not already been called -- this *should* have happened in
        // `task.return`, but some paths do not go through task.return (e.g. async lower of sync fn
        // which goes through prepare + async-start-call)
        if (meta.returnFn && !meta.returnFnCalled) {
          _debugLog('[AsyncTask#onResolve()] running returnFn', {
            componentIdx: this.#componentIdx,
            taskID: this.#id,
            subtaskID: this.#parentSubtask.id(),
          });
          const callerTask = this.#parentSubtask.getParentTask();
          _withGlobalCurrentTaskMeta({
            taskID: callerTask.id(),
            componentIdx: callerTask.componentIdx(),
            fn: () => meta.returnFn.apply(null, [taskValue, meta.resultPtr]),
          });
          meta.returnFnCalled = true;
        }
      }
      
      if (this.#postReturnFn && taskReturned) {
        _debugLog('[AsyncTask#onResolve()] running post return ', {
          componentIdx: this.#componentIdx,
          taskID: this.#id,
        });
        try {
          _withGlobalCurrentTaskMeta({
            taskID: this.#id,
            componentIdx: this.#componentIdx,
            fn: () => this.#postReturnFn(taskValue),
          });
        } catch (err) {
          _debugLog("[AsyncTask#onResolve] error during task resolve handler", err);
          throw err;
        }
      }
      
      if (parentSubtaskPending) {
        this.#parentSubtask.onResolve(taskValue);
      }
    }
    
    registerOnResolveHandler(f) {
      this.#onResolveHandlers.push(f);
    }
    
    isRejected() { return this.#rejected; }
    
    isErrored() { return this.#errored; }
    setErrored(err) {
      // Preserve the originating trap when unwinding through
      // additional guest frames produces secondary traps (often
      // an `unreachable` after a call which was expected to trap).
      if (this.#errored === null) { this.#errored = err; }
    }
    
    reject(taskErr) {
      _debugLog('[AsyncTask#reject()] args', {
        componentIdx: this.#componentIdx,
        taskID: this.#id,
        parentSubtask: this.#parentSubtask,
        parentSubtaskID: this.#parentSubtask?.id(),
        entryFnName: this.entryFnName(),
        callbackFnName: this.#callbackFnName,
        errMsg: taskErr.message,
      });
      
      this.setErrored(taskErr);
      if (this.#rejected) { return; }
      
      // A task may call `task.return` before its callback exits.
      // A trap in cleanup or spawned work must still reject the
      // host call and poison the enclosing task chain.
      if (this.isResolvedState()) {
        this.#rejected = true;
        this.#errored = taskErr;
        const parentTask = this.#parentSubtask?.getParentTask();
        if (parentTask) { parentTask.reject(taskErr); }
        return;
      }
      
      this.#rejected = true;
      this.cancelRequested = true;
      this.#state = AsyncTask.State.CANCEL_PENDING;
      const cancelled = this.deliverPendingCancel({ cancellable: true });
      
      // TODO: do cleanup here to reset the machinery so we can run again?
      
      this.cancel({ error: taskErr });
    }
    
    resolve(results) {
      _debugLog('[AsyncTask#resolve()] args', {
        componentIdx: this.#componentIdx,
        taskID: this.#id,
        entryFnName: this.entryFnName(),
        callbackFnName: this.#callbackFnName,
      });
      
      if (this.#state === AsyncTask.State.RESOLVED) {
        if (this.#errored !== null) { throw this.#errored; }
        throw new Error(`(component [${this.#componentIdx}]) task [${this.#id}]  is already resolved (did you forget to wait for an import?)`);
      }
      
      this.validateResourceBorrowScope();
      
      this.#state = AsyncTask.State.RESOLVED;
      
      switch (results.length) {
        case 0:
        this.onResolve(undefined);
        break;
        case 1:
        this.onResolve(results[0]);
        break;
        default:
        _debugLog('[AsyncTask#resolve()] unexpected number of results', {
          componentIdx: this.#componentIdx,
          results,
          taskID: this.#id,
          subtaskID: this.#parentSubtask?.id(),
          entryFnName: this.#entryFnName,
          callbackFnName: this.#callbackFnName,
        });
        throw new Error('unexpected number of results');
      }
    }
    
    exit(args) {
      _debugLog('[AsyncTask#exit()]', {
        componentIdx: this.#componentIdx,
        taskID: this.#id,
      });
      
      if (this.#exited)  { throw new Error("task has already exited"); }
      
      if (this.#state !== AsyncTask.State.RESOLVED) {
        throw new Error(`(component [${this.#componentIdx}]) task [${this.#id}] exited without resolution`);
      }
      
      this.validateResourceBorrowScope();
      
      const state = getOrCreateAsyncState(this.#componentIdx);
      if (!state) { throw new Error('missing async state for component [' + this.#componentIdx + ']'); }
      
      // Exempt the host from exclusive lock check
      if (this.#componentIdx !== -1 && !args?.skipExclusiveLockCheck && !this.#lockFreeEntry) {
        if (this.needsExclusiveLock() && !state.exclusivelyLockedBy(this.#id)) {
          throw new Error(`task [${this.#id}] exit: component [${this.#componentIdx}] should have been exclusively locked by it`);
        }
      }
      
      // Ownership-checked: releases only this task's own hold (a
      // task exiting while another task's slice holds the lock no
      // longer clears the foreign hold).
      state.exclusiveRelease(this.#id);
      this.notifyProgress();
      
      for (const f of this.#onExitHandlers) {
        try {
          f();
        } catch (err) {
          console.error("error during task exit handler", err);
          throw err;
        }
      }
      
      this.#exited = true;
      clearCurrentTask(this.#componentIdx, this.id());
    }
    
    needsExclusiveLock() {
      // Host (-1) tasks model host-side import handling: there is no
      // guest linear memory or executor state to protect, and host
      // calls from unrelated guest components would contend spuriously.
      if (this.#componentIdx === -1) { return false; }
      // Import-handler tasks (CallInterface) run host code nested
      // inside the calling guest slice, which already holds the
      // lock; only tasks that execute guest slices need it.
      if (!this.#callingWasmExport) { return false; }
      // A sync-lifted callee cannot be reentered until the whole
      // stackful call returns. This is the Component Model's
      // automatic-backpressure rule for async-lowered calls.
      return !this.#isAsync || this.hasCallback() || this.#calleeIsAsync === false;
    }
    
    createSubtask(args) {
      _debugLog('[AsyncTask#createSubtask()] args', args);
      const { componentIdx, childTask, callMetadata, fnName, isAsync, isManualAsync } = args;
      
      const cstate = getOrCreateAsyncState(this.#componentIdx);
      if (!cstate) {
        throw new Error(`invalid/missing async state for component idx [${componentIdx}]`);
      }
      
      const waitable = new Waitable({
        componentIdx: this.#componentIdx,
        target: `subtask (internal ID [${this.#id}])`,
      });
      
      const newSubtask = new AsyncSubtask({
        componentIdx,
        childTask,
        parentTask: this,
        callMetadata,
        isAsync,
        isManualAsync,
        fnName,
        waitable,
      });
      this.#subtasks.push(newSubtask);
      newSubtask.setTarget(`subtask (internal ID [${newSubtask.id()}], waitable [${waitable.idx()}], component [${componentIdx}])`);
      waitable.setIdx(cstate.handles.insert(newSubtask));
      waitable.setTarget(`waitable for subtask (waitable id [${waitable.idx()}], subtask internal ID [${newSubtask.id()}])`);
      return newSubtask;
    }
    
    getLatestSubtask() {
      return this.#subtasks.at(-1);
    }
    
    getSubtaskByWaitableRep(rep) {
      if (rep === undefined) { throw new TypeError('missing rep'); }
      return this.#subtasks.find(s => s.waitableRep() === rep);
    }
    
    currentSubtask() {
      _debugLog('[AsyncTask#currentSubtask()]');
      if (this.#subtasks.length === 0) { return undefined; }
      return this.#subtasks.at(-1);
    }
    
    removeSubtask(subtask) {
      if (this.#subtasks.length === 0) {
        throw new Error('cannot end current subtask: no current subtask');
      }
      this.#subtasks = this.#subtasks.filter(t => t !== subtask);
      return subtask;
    }
  }
  
  function createNewCurrentTask(args) {
    _debugLog('[createNewCurrentTask()] args', args);
    const {
      componentIdx,
      isAsync,
      isManualAsync,
      preserveFutureResult,
      entryFnName,
      parentSubtaskID,
      callbackFnName,
      getCallbackFn,
      getParamsFn,
      stringEncoding,
      errHandling,
      getCalleeParamsFn,
      resultPtr,
      callingWasmExport,
    } = args;
    if (componentIdx === undefined || componentIdx === null) {
      throw new Error('missing/invalid component instance index while starting task');
    }
    let taskMetas = ASYNC_TASKS_BY_COMPONENT_IDX.get(componentIdx);
    const callbackFn = getCallbackFn ? getCallbackFn() : null;
    
    const newTask = new AsyncTask({
      componentIdx,
      isAsync,
      isManualAsync,
      preserveFutureResult,
      entryFnName,
      callbackFn,
      callbackFnName,
      stringEncoding,
      getCalleeParamsFn,
      resultPtr,
      errHandling,
      callingWasmExport,
    });
    
    const newTaskID = newTask.id();
    const newTaskMeta = { id: newTaskID, componentIdx, task: newTask };
    
    // NOTE: do not track host tasks
    ASYNC_CURRENT_TASK_IDS.push(newTaskID);
    ASYNC_CURRENT_COMPONENT_IDXS.push(componentIdx);
    
    if (!taskMetas) {
      taskMetas = [newTaskMeta];
      ASYNC_TASKS_BY_COMPONENT_IDX.set(componentIdx, [newTaskMeta]);
    } else {
      taskMetas.push(newTaskMeta);
    }
    
    return [newTask, newTaskID];
  }
  
  function _checkMayLeave(componentIdx) {
    if (INSTANCE_FLAGS.get(componentIdx)?.value !== 1) {
      throw new WebAssemblyRuntimeError('cannot leave component instance');
    }
  }
  
  function _getGlobalCurrentTaskMeta(componentIdx) {
    const v = componentIdx === undefined || componentIdx === null
    ? CURRENT_TASK_META.current
    : CURRENT_TASK_META[componentIdx];
    if (v === undefined || v === null) {
      return undefined;
    }
    return { ...v };
  }
  
  
  function _setGlobalCurrentTaskMeta(args) {
    if (!args) { throw new TypeError('args missing'); }
    if (args.taskID === undefined) { throw new TypeError('missing task ID'); }
    if (args.componentIdx === undefined) { throw new TypeError('missing component idx'); }
    const { taskID, componentIdx } = args;
    return CURRENT_TASK_META.current =
    CURRENT_TASK_META[componentIdx] = { taskID, componentIdx };
  }
  
  
  async function _clearCurrentTask(args) {
    _debugLog('[_clearCurrentTask()] args', args);
    if (!args) { throw new TypeError('args missing'); }
    if (args.taskID === undefined) { throw new TypeError('missing task ID'); }
    if (args.componentIdx === undefined) { throw new TypeError('missing component idx'); }
    const { taskID, componentIdx } = args;
    
    const meta = CURRENT_TASK_META[componentIdx];
    if (!meta) { throw new Error(`missing current task meta for component idx [${componentIdx}]`); }
    
    if (meta.taskID !== taskID) {
      throw new Error(`task ID [${meta.taskID}] != requested ID [${taskID}]`);
    }
    if (meta.componentIdx !== componentIdx) {
      throw new Error(`component idx [${meta.componentIdx}] != requested idx [${componentIdx}]`);
    }
    
    CURRENT_TASK_META[componentIdx] = null;
    if (CURRENT_TASK_META.current?.taskID === taskID) {
      CURRENT_TASK_META.current = null;
    }
  }
  
  function _lowerImportBackwardsCompat(args) {
    const params = [...arguments].slice(1);
    _debugLog('[_lowerImportBackwardsCompat()] args', { args, params });
    const {
      functionIdx,
      componentIdx,
      isAsync,
      isManualAsync,
      paramLiftFns,
      resultLowerFns,
      hasResultPointer,
      funcTypeIsAsync,
      metadata,
      memoryIdx,
      getMemoryFn,
      getReallocFn,
      importFn,
      stringEncoding,
    } = args;
    
    _checkMayLeave(componentIdx);
    
    const meta = _getGlobalCurrentTaskMeta(componentIdx);
    let taskMeta = meta && getCurrentTask(componentIdx, meta.taskID);
    let createdTask;
    
    // Some components depend on initialization logic (i.e. `_initialize` or some such
    // core wasm export) that is embedded in the component, but is not executed or wizer'd
    // away before the transpiled component is attempted to be used.
    //
    // These components execut their initialization logic *when they are imported* in the
    // transpiled context -- so we may get a call to an export that is lowered without going
    // through `CallWasm` or `CallInterface`.
    //
    // A nested synchronous call can leave global metadata for a task
    // that has already exited. Treat it like a call with no current task.
    if (!taskMeta) {
      if (funcTypeIsAsync || (isAsync && !isManualAsync)) {
        throw new Error('p3 async wasm exports cannot use backwards compat auto-task init');
      }
      
      const [newTask, newTaskID] = createNewCurrentTask({
        componentIdx,
        isAsync,
        isManualAsync,
        callingWasmExport: false,
      });
      createdTask = newTask;
      
      // Since we're managing the task creation ourselves we must clear ourselves
      createdTask.registerOnResolveHandler(() => {
        _clearCurrentTask({
          taskID: task.id(),
          componentIdx: task.componentIdx(),
        });
      });
      
      _setGlobalCurrentTaskMeta({
        componentIdx,
        taskID: newTaskID,
      });
      
      taskMeta = getCurrentTask(componentIdx, newTaskID);
    }
    if (!taskMeta) {
      throw new Error('invalid/missing async task meta');
    }
    
    const task = taskMeta.task;
    if (!task) { throw new Error('invalid/missing async task'); }
    
    const cstate = getOrCreateAsyncState(componentIdx);
    
    if (!task.mayBlock() && funcTypeIsAsync && !isAsync) {
      throw new Error("non async exports cannot synchronously call async functions");
    }
    
    // If there is an existing task, this should be part of a subtask
    const memory = getMemoryFn();
    // Canonical ABI lower appends result storage as a trailing
    // param when async lower has any flat result, or sync lower
    // has more than one flat result.
    const resultPtr = hasResultPointer ? params[params.length - 1] >>> 0 : undefined;
    const subtask = task.createSubtask({
      componentIdx,
      parentTask: task,
      fnName: importFn.fnName,
      isAsync,
      isManualAsync,
      callMetadata: {
        memoryIdx,
        memory,
        realloc: getReallocFn?.(),
        getReallocFn,
        resultPtr,
        lowers: resultLowerFns,
        funcTypeIsAsync,
        stringEncoding,
      }
    });
    task.setReturnMemoryIdx(memoryIdx);
    task.setReturnMemory(getMemoryFn());
    
    subtask.onStart();
    
    // If dealing with a sync lowered sync function, we can directly return results
    //
    // TODO(breaking): remove once we get rid of manual async import specification,
    // as func types cannot be detected in that case only (and we don't need that w/ p3)
    if (!isManualAsync && !isAsync && !funcTypeIsAsync) {
      if (createdTask) { createdTask.enterSync(); }
      
      const res = importFn(...params);
      
      // TODO(breaking): remove once we get rid of manual async import specification,
      // as func types cannot be detected in that case only (and we don't need that w/ p3)
      if (!funcTypeIsAsync && !subtask.isReturned()) {
        throw new Error('post-execution subtasks must either be async or returned');
      }
      
      const syncRes = subtask.getResult();
      if (createdTask) { createdTask.resolve([syncRes]); }
      
      return syncRes;
    }
    
    // Sync-lowered async functions requires async behavior because the callee *can* block,
    // but this call must *act* synchronously and return immediately with the result
    // (i.e. not returning until the work is done)
    //
    // TODO(breaking): remove checking for manual async specification here, once we can go p3-only
    //
    if (!isManualAsync && !isAsync && funcTypeIsAsync) {
      const { promise, resolve, reject } = promiseWithResolvers();
      queueMicrotask(async () => {
        try {
          await importFn(...params);
          if (!subtask.isResolved()) {
            await task.suspendUntil({ readyFn: () => subtask.isResolved() });
          }
          resolve(subtask.getResult());
        } catch (err) {
          reject(err);
        }
      });
      return promise;
    }
    
    // NOTE: at this point we know that we are working with an async lowered import
    
    const subtaskState = subtask.getStateNumber();
    if (subtaskState < 0 || subtaskState >= 2**4) {
      throw new Error('invalid subtask state, out of valid range');
    }
    
    subtask.setOnProgressFn(() => {
      subtask.setPendingEvent(() => {
        if (subtask.isResolved()) { subtask.deliverResolve(); }
        const event = {
          code: ASYNC_EVENT_CODE.SUBTASK,
          payload0: subtask.waitableRep(),
          payload1: subtask.getStateNumber(),
        }
        return event;
      });
    });
    
    // This is a hack to maintain backwards compatibility with
    // manually-specified async imports, used in wasm exports that are
    // not actually async (but are specified as so).
    //
    // This is not normal p3 sync behavior but instead anticipating that
    // the caller that is doing manual async will be waiting for a promise that
    // resolves to the *actual* result.
    //
    // TODO(breaking): remove once manually specified async is removed
    //
    // There are a few cases:
    // 1. sync function with async types (e.g. `f: func() -> stream<u32>`)
    // 2. async function with async types (e.g. `f: async func() -> stream<u32>`)
    // 3. async function with sync types (e.g. `f: async func() -> list<u32>`)
    // 4. sync function with non-async types (e.g. `f: func() -> list<u32>`)
    //
    // This hack *only* applies to 4 -- the case where an async JS host function
    // is supplied to a Wasm export which does *not* need to do any async abi
    // lifting/lowering (async ABI did not exist when JSPI integratiton was
    // initially merged to enable asynchronously returning values from the host)
    //
    const requiresManualAsyncResult = !isAsync && !funcTypeIsAsync && isManualAsync;
    let manualAsyncResult;
    if (requiresManualAsyncResult) {
      manualAsyncResult = promiseWithResolvers();
    }
    
    queueMicrotask(async () => {
      try {
        _debugLog('[_lowerImportBackwardsCompat()] calling lowered import', { importFn, params });
        if (createdTask) { await createdTask.enter(); }
        
        const asyncRes = await importFn(...params);
        if (requiresManualAsyncResult) {
          manualAsyncResult.resolve(subtask.getResult());
        }
        
        if (createdTask) { createdTask.resolve([asyncRes]); }
        
        
      } catch (err) {
        _debugLog("[_lowerImportBackwardsCompat()] import fn error:", err);
        if (requiresManualAsyncResult) {
          manualAsyncResult.reject(err);
          return;
        }
        task.setErrored(err);
        task.reject(err);
      }
    });
    
    if (requiresManualAsyncResult) { return manualAsyncResult.promise; }
    
    _debugLog('[_lowerImportBackwardsCompat()] async-lowered import return', {
      fnName: importFn.fnName,
      componentIdx,
      subtaskID: subtask.id(),
      waitableRep: subtask.waitableRep(),
      subtaskState,
      packedResult: Number(subtask.waitableRep()) << 4 | subtaskState,
    });
    
    return Number(subtask.waitableRep()) << 4 | subtaskState;
  }
  
  const CURRENT_TASK_MAY_BLOCK= globalThis.WebAssembly ? new globalThis.WebAssembly.Global({ value: 'i32', mutable: true }, 0) : false;
  
  
  function _liftFlatBool(ctx) {
    _debugLog('[_liftFlatBool()] args', { ctx });
    let val;
    
    if (ctx.useDirectParams) {
      if (ctx.params.length === 0) { throw new Error('expected at least a single i32 argument'); }
      val = ctx.params[0] === 1;
      ctx.params = ctx.params.slice(1);
      return [val, ctx];
    }
    
    if (ctx.storageLen !== undefined && ctx.storageLen < 1) {
      throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (bool requires 1 byte)`);
    }
    
    val = new DataView(ctx.memory.buffer).getUint8(ctx.storagePtr, true) === 1;
    
    ctx.storagePtr += 1;
    if (ctx.storageLen !== undefined) { ctx.storageLen -= 1; }
    
    return [val, ctx];
  }
  
  
  function _liftFlatU8(ctx) {
    _debugLog('[_liftFlatU8()] args', { ctx });
    let val;
    
    if (ctx.useDirectParams) {
      if (ctx.params.length === 0) { throw new Error('expected at least a single i32 argument'); }
      val = ctx.params[0];
      ctx.params = ctx.params.slice(1);
      return [val, ctx];
    }
    
    if (ctx.storageLen !== undefined && ctx.storageLen < 1) {
      throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (u8 requires 1 byte)`);
    }
    
    val = new DataView(ctx.memory.buffer).getUint8(ctx.storagePtr, true);
    
    ctx.storagePtr += 1;
    if (ctx.storageLen !== undefined) { ctx.storageLen -= 1; }
    
    return [val, ctx];
  }
  
  
  function _liftFlatU16(ctx) {
    _debugLog('[_liftFlatU16()] args', { ctx });
    let val;
    
    if (ctx.useDirectParams) {
      if (ctx.params.length === 0) { throw new Error('expected at least a single i32 argument'); }
      val = ctx.params[0];
      ctx.params = ctx.params.slice(1);
      return [val, ctx];
    }
    
    if (ctx.storageLen !== undefined && ctx.storageLen < 2) {
      throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (u16 requires 2 bytes)`);
    }
    
    val = new DataView(ctx.memory.buffer).getUint16(ctx.storagePtr, true);
    
    ctx.storagePtr += 2;
    if (ctx.storageLen !== undefined) { ctx.storageLen -= 2; }
    
    const rem = ctx.storagePtr % 2;
    if (rem !== 0) { ctx.storagePtr += (2 - rem); }
    
    return [val, ctx];
  }
  
  
  function _liftFlatS32(ctx) {
    _debugLog('[_liftFlatS32()] args', { ctx });
    let val;
    
    if (ctx.useDirectParams) {
      if (ctx.params.length === 0) { throw new Error('expected at least a single i32 argument'); }
      val = ctx.params[0];
      ctx.params = ctx.params.slice(1);
      return [val, ctx];
    }
    
    if (ctx.storageLen !== undefined && ctx.storageLen < 4) {
      throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (s32 requires 4 bytes)`);
    }
    
    val = new DataView(ctx.memory.buffer).getInt32(ctx.storagePtr, true);
    ctx.storagePtr += 4;
    if (ctx.storageLen !== undefined) { ctx.storageLen -= 4; }
    
    return [val, ctx];
  }
  
  
  function _liftFlatU32(ctx) {
    _debugLog('[_liftFlatU32()] args', { ctx });
    let val;
    
    if (ctx.useDirectParams) {
      if (ctx.params.length === 0) { throw new Error('expected at least a single i34 argument'); }
      // core i32 values arrive as signed numbers
      val = ctx.params[0] >>> 0;
      ctx.params = ctx.params.slice(1);
      return [val, ctx];
    }
    
    if (ctx.storageLen !== undefined && ctx.storageLen < 4) {
      throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (u32 requires 4 bytes)`);
    }
    val = new DataView(ctx.memory.buffer).getUint32(ctx.storagePtr, true);
    ctx.storagePtr += 4;
    if (ctx.storageLen !== undefined) { ctx.storageLen -= 4; }
    
    return [val, ctx];
  }
  
  
  function _liftFlatS64(ctx) {
    _debugLog('[_liftFlatS64()] args', { ctx });
    let val;
    
    if (ctx.useDirectParams) {
      if (ctx.params.length === 0) { throw new Error('expected at least one single i64 argument'); }
      if (typeof ctx.params[0] !== 'bigint') { throw new Error('expected bigint'); }
      val = ctx.params[0];
      ctx.params = ctx.params.slice(1);
      return [val, ctx];
    }
    
    
    if (ctx.storageLen !== undefined && ctx.storageLen < 8) {
      throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (s64 requires 8 bytes)`);
    }
    
    val = new DataView(ctx.memory.buffer).getBigInt64(ctx.storagePtr, true);
    ctx.storagePtr += 8;
    if (ctx.storageLen !== undefined) { ctx.storageLen -= 8; }
    
    return [val, ctx];
  }
  
  
  function _liftFlatU64(ctx) {
    _debugLog('[_liftFlatU64()] args', { ctx });
    let val;
    
    if (ctx.useDirectParams) {
      if (ctx.params.length === 0) { throw new Error('expected at least one single i64 argument'); }
      if (typeof ctx.params[0] !== 'bigint') { throw new Error('expected bigint'); }
      // core i64 values arrive as signed BigInts
      val = BigInt.asUintN(64, ctx.params[0]);
      ctx.params = ctx.params.slice(1);
      return [val, ctx];
    }
    
    if (ctx.storageLen !== undefined && ctx.storageLen < 8) {
      throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (u64 requires 8 bytes)`);
    }
    
    val = new DataView(ctx.memory.buffer).getBigUint64(ctx.storagePtr, true);
    ctx.storagePtr += 8;
    if (ctx.storageLen !== undefined) { ctx.storageLen -= 8; }
    
    return [val, ctx];
  }
  
  
  function _liftFlatFloat64(ctx) {
    _debugLog('[_liftFlatFloat64()] args', { ctx });
    let val;
    
    if (ctx.useDirectParams) {
      if (ctx.params.length === 0) {
        throw new Error('expected at least one single f64 argument');
      }
      val = ctx.params[0];
      ctx.params = ctx.params.slice(1);
      
      return [val, ctx];
    }
    
    if (ctx.storageLen !== undefined && ctx.storageLen < 8) {
      throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (f64 requires 8 bytes)`);
    }
    
    val = new DataView(ctx.memory.buffer).getFloat64(ctx.storagePtr, true);
    ctx.storagePtr += 8;
    if (ctx.storageLen !== undefined) { ctx.storageLen -= 8; }
    
    return [val, ctx];
  }
  
  
  function _liftFlatStringUTF8(ctx) {
    _debugLog('[_liftFlatStringUTF8()] args', { ctx });
    let val;
    
    if (ctx.useDirectParams) {
      if (ctx.params.length < 2) { throw new Error('expected at least two u32 arguments'); }
      let offset = ctx.params[0];
      if (typeof offset === 'bigint') { offset = Number(offset); } else { offset >>>= 0; }
      if (!Number.isSafeInteger(offset)) { throw new Error('invalid offset'); }
      const len = ctx.params[1];
      if (!Number.isSafeInteger(len)) {  throw new Error('invalid len'); }
      val = TEXT_DECODER_UTF8.decode(new DataView(ctx.memory.buffer, offset, len));
      ctx.params = ctx.params.slice(2);
      return [val, ctx];
    }
    
    const rem = ctx.storagePtr % 4;
    if (rem !== 0) { ctx.storagePtr += (4 - rem); }
    
    const dv = new DataView(ctx.memory.buffer);
    const start = dv.getUint32(ctx.storagePtr, true);
    const codeUnits = dv.getUint32(ctx.storagePtr + 4, true);
    
    val = TEXT_DECODER_UTF8.decode(new Uint8Array(ctx.memory.buffer, start, codeUnits));
    
    ctx.storagePtr += 8;
    if (ctx.storageLen !== undefined) { ctx.storageLen -= 8; }
    
    return [val, ctx];
  }
  
  function _liftFlatStringUTF16(ctx) {
    _debugLog('[_liftFlatStringUTF16()] args', { ctx });
    let val;
    
    if (ctx.useDirectParams) {
      if (ctx.params.length < 2) { throw new Error('expected at least two u32 arguments'); }
      let offset = ctx.params[0];
      if (typeof offset === 'bigint') { offset = Number(offset); } else { offset >>>= 0; }
      if (!Number.isSafeInteger(offset)) {  throw new Error('invalid offset'); }
      const len = ctx.params[1];
      if (!Number.isSafeInteger(len)) {  throw new Error('invalid len'); }
      val = utf16Decoder.decode(new DataView(ctx.memory.buffer, offset, len * 2));
      ctx.params = ctx.params.slice(2);
      return [val, ctx];
    }
    
    const rem = ctx.storagePtr % 4;
    if (rem !== 0) { ctx.storagePtr += (4 - rem); }
    
    const dv = new DataView(ctx.memory.buffer);
    const start = dv.getUint32(ctx.storagePtr, true);
    const codeUnits = dv.getUint32(ctx.storagePtr + 4, true);
    
    val = utf16Decoder.decode(new DataView(ctx.memory.buffer, start, codeUnits * 2));
    
    ctx.storagePtr += 8;
    if (ctx.storageLen !== undefined) { ctx.storageLen -= 8; }
    
    return [val, ctx];
  }
  
  function _liftFlatStringAny(ctx) {
    switch (ctx.stringEncoding) {
      case 'utf8':
      return _liftFlatStringUTF8(ctx);
      case 'utf16':
      return _liftFlatStringUTF16(ctx);
      default:
      throw new Error(`missing/unrecognized/unsupported string encoding [${ctx.stringEncoding}]`);
    }
  }
  
  function _liftFlatRecord(meta) {
    const { fieldMetas, size32: recordSize32, align32: recordAlign32 } = meta;
    return function _liftFlatRecordInner(ctx) {
      _debugLog('[_liftFlatRecord()] args', { ctx });
      
      const originalPtr = ctx.storagePtr;
      const res = {};
      for (const [key, liftFn, size32, align32] of fieldMetas) {
        let fieldPtr;
        if (ctx.storagePtr !== undefined) {
          const rem = ctx.storagePtr % align32;
          if (rem !== 0) { ctx.storagePtr += align32 - rem; }
          fieldPtr = ctx.storagePtr;
        }
        
        // A field occupies exactly size32 bytes of the record's
        // flat storage. Capture the remaining storage budget before
        // lifting the field and restore it afterwards: a field's own
        // lift fn may repurpose storageLen internally (e.g. a list
        // sets it to the element-buffer length while reading
        // out-of-line data and never restores it), which would
        // otherwise corrupt the budget the next field sees.
        // See https://github.com/bytecodealliance/jco/issues/1585.
        let fieldLen;
        if (ctx.storageLen !== undefined) { fieldLen = ctx.storageLen; }
        
        let [val, newCtx] = liftFn(ctx);
        res[key] = val;
        ctx = newCtx;
        
        if (fieldPtr !== undefined) {
          ctx.storagePtr = Math.max(ctx.storagePtr, fieldPtr + size32);
        }
        if (fieldLen !== undefined) {
          ctx.storageLen = fieldLen - size32;
        }
      }
      
      if (originalPtr !== undefined) {
        ctx.storagePtr = Math.max(ctx.storagePtr, originalPtr + recordSize32);
      }
      
      if (ctx.storagePtr !== undefined) {
        const rem = ctx.storagePtr % recordAlign32;
        if (rem !== 0) { ctx.storagePtr += recordAlign32 - rem; }
      }
      
      return [res, ctx];
    }
  }
  
  const _liftFlatVariantScratch = new DataView(new ArrayBuffer(8));
  
  function _liftFlatVariant(meta) {
    const {
      caseMetas,
      variantSize32,
      variantAlign32,
      variantPayloadOffset32,
      variantFlatCount,
      variantPayloadFlatTypes,
      isEnum,
    } = meta;
    
    return function _liftFlatVariantInner(ctx) {
      _debugLog('[_liftFlatVariant()] args', { ctx });
      const origUseParams = ctx.useDirectParams;
      
      let caseIdx;
      let liftRes;
      const originalPtr = ctx.storagePtr;
      const numCases =  caseMetas.length;
      if (caseMetas.length < 256) {
        liftRes = _liftFlatU8(ctx);
      } else if (numCases >= 256 && numCases < 65536) {
        liftRes = _liftFlatU16(ctx);
      } else if (numCases >= 65536 && numCases < 4_294_967_296) {
        liftRes = _liftFlatU32(ctx);
      } else {
        throw new Error(`unsupported number of variant cases [${numCases}]`);
      }
      caseIdx = liftRes[0];
      ctx = liftRes[1];
      
      const [
      tag,
      liftFn,
      caseSize32,
      caseAlign32,
      caseFlatCount,
      caseFlatTypes,
      ] = caseMetas[caseIdx];
      
      if (variantPayloadOffset32 === undefined) {
        throw new Error('unexpectedly missing payload offset');
      }
      
      if (originalPtr !== undefined) {
        ctx.storagePtr = originalPtr + variantPayloadOffset32;
      }
      
      let val;
      if (liftFn === null) {
        val = { tag };
        // NOTE: here we need to move past the entire object in memory
        // despite moving to the payload which we now know is missing/unnecessary
        if (originalPtr !== undefined) {
          ctx.storagePtr = originalPtr + variantSize32;
        }
      } else {
        // When lifting from direct params, the payload arrives as the
        // *join* of all case flat representations: each slot whose
        // joined core type differs from the selected case's core type
        // must be reinterpreted before the payload lift
        // (see CanonicalABI `lift_flat_variant`)
        if (ctx.useDirectParams) {
          if (!variantPayloadFlatTypes || !caseFlatTypes) {
            throw new Error('missing variant flat type metadata during direct-param lift');
          }
          const scratch = _liftFlatVariantScratch;
          for (let i = 0; i < caseFlatTypes.length; i++) {
            const have = variantPayloadFlatTypes[i];
            const want = caseFlatTypes[i];
            if (have === want) { continue; }
            const val = ctx.params[i];
            if (have === 'i64' && want === 'i32') {
              ctx.params[i] = Number(BigInt.asIntN(32, val));
            } else if (have === 'i64' && want === 'f32') {
              scratch.setInt32(0, Number(BigInt.asIntN(32, val)), true);
              ctx.params[i] = scratch.getFloat32(0, true);
            } else if (have === 'i64' && want === 'f64') {
              scratch.setBigInt64(0, val, true);
              ctx.params[i] = scratch.getFloat64(0, true);
            } else if (have === 'i32' && want === 'f32') {
              scratch.setInt32(0, val, true);
              ctx.params[i] = scratch.getFloat32(0, true);
            } else {
              throw new Error(`invalid variant payload coercion [${have}] -> [${want}]`);
            }
          }
        }
        
        const [newVal, newCtx] = liftFn(ctx);
        val = { tag, val: newVal };
        ctx = newCtx;
      }
      
      if (origUseParams) {
        if (variantFlatCount === undefined || variantFlatCount === null) {
          _debugLog('[_liftFlatVariant()] variant with unknown flat count', { ctx, meta });
          throw new Error('cannot lift variant with unknown flat count');
        }
        if (caseFlatCount === undefined || caseFlatCount === null) {
          _debugLog('[_liftFlatVariant()] case with unknown flat count', { ctx, meta, case: meta.caseMetas[caseIdx] });
          throw new Error('cannot lift case with unknown flat count');
        }
        // NOTE: enums can be tightly packed and do not have a descriminant
        const remainingPayloadParams = variantFlatCount - caseFlatCount - (isEnum ? 0 : 1);
        if (remainingPayloadParams < 0) {
          throw new Error(`invalid variant flat count metadata`);
        }
        if (ctx.params.length < remainingPayloadParams) {
          throw new Error(`expected at least [${remainingPayloadParams}] remaining variant payload params, but got [${ctx.params.length}]`);
        }
        ctx.params = ctx.params.slice(remainingPayloadParams);
      }
      
      if (ctx.storagePtr !== undefined) {
        const rem = ctx.storagePtr % variantAlign32;
        if (rem !== 0) { ctx.storagePtr += variantAlign32 - rem; }
      }
      
      return [val, ctx];
    }
  }
  
  function _liftFlatList(meta) {
    const { elemLiftFn, elemSize32, elemAlign32, knownLen, typedArray } = meta;
    
    const listValue =
    typedArray === undefined
    ? values => values
    : values => new typedArray(values);
    
    const readValuesAndReset = (ctx, originalPtr, originalLen, dataPtr, len) => {
      if (
      dataPtr < 0 || len < 0 ||
      (elemSize32 !== 0 && len > Math.floor(((1 << 28) - 1) / elemSize32)) ||
      dataPtr > ctx.memory.buffer.byteLength ||
      (elemSize32 !== 0 && len > Math.floor((ctx.memory.buffer.byteLength - dataPtr) / elemSize32))
      ) {
        throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
      }
      if (dataPtr % elemAlign32 !== 0) {
        throw new TypeError(`list pointer [${dataPtr}] is not aligned to ${elemAlign32}`);
      }
      ctx.storagePtr = dataPtr;
      const val = [];
      for (var i = 0; i < len; i++) {
        const elemPtr = dataPtr + i * elemSize32;
        ctx.storagePtr = elemPtr;
        const [res, nextCtx] = elemLiftFn(ctx);
        val.push(res);
        ctx = nextCtx;
        
        ctx.storagePtr = Math.max(ctx.storagePtr, elemPtr + elemSize32);
      }
      if (originalPtr !== null) { ctx.storagePtr = originalPtr; }
      if (originalLen !== null) { ctx.storageLen = originalLen; }
      return [listValue(val), ctx];
    };
    
    return function _liftFlatListInner(ctx) {
      _debugLog('[_liftFlatList()] args', { ctx });
      
      let liftResults;
      if (knownLen !== undefined) { // list with known length
      if (ctx.useDirectParams) {
        _debugLog('memory unexpectedly missing while lifting unknown length list', { ctx });
        liftResults = [listValue(ctx.params.slice(0, knownLen)), ctx];
        ctx.params = ctx.params.slice(knownLen);
      } else { // indirect params
      if (ctx.memory === null) {
        _debugLog('memory unexpectedly missing while lifting known length list', { knownLen, ctx });
        throw new Error(`memory missing while lifting known length (${knownLen}) list`);
      }
      
      const originalLen = ctx.storageLen;
      const originalPtr = ctx.storagePtr;
      
      ctx.storageLen = knownLen * elemSize32;
      liftResults = readValuesAndReset(ctx, null, originalLen, ctx.storagePtr, knownLen);
    }
    
  } else { // unknown length list
  
  if (ctx.useDirectParams) {
    // unknown length list ptr w/ direct params
    const dataPtr = ctx.params[0] >>> 0;
    const len = ctx.params[1];
    ctx.params = ctx.params.slice(2);
    
    ctx.useDirectParams = false;
    const originalPtr = ctx.storagePtr;
    const originalLen = ctx.storageLen;
    ctx.storageLen = len * elemSize32;
    
    liftResults = readValuesAndReset(ctx, originalPtr, originalLen, dataPtr, len);
    
    ctx.useDirectParams = true;
  } else {
    // unknown length list ptr w/ in-memory params
    const originalLen = ctx.storageLen;
    ctx.storageLen = 8;
    
    const dataPtrLiftRes = _liftFlatU32(ctx);
    const dataPtr = dataPtrLiftRes[0];
    ctx = dataPtrLiftRes[1];
    
    const lenLiftRes = _liftFlatU32(ctx);
    const len = lenLiftRes[0];
    ctx = lenLiftRes[1];
    
    const originalPtr = ctx.storagePtr;
    ctx.storagePtr = dataPtr;
    
    ctx.storageLen = len * elemSize32;
    liftResults = readValuesAndReset(ctx, originalPtr, originalLen, dataPtr, len);
  }
}

return liftResults;
}
}

function _liftFlatTuple(meta) {
  const { elemLiftFns, size32: tupleSize32, align32: tupleAlign32 } = meta;
  return function _liftFlatTupleInner(ctx) {
    _debugLog('[_liftFlatTuple()] args', { ctx });
    
    const originalPtr = ctx.storagePtr;
    const val = [];
    for (const [ liftFn, size32, align32 ]  of elemLiftFns) {
      let elemPtr;
      if (ctx.storagePtr !== undefined) {
        const rem = ctx.storagePtr % align32;
        if (rem !== 0) { ctx.storagePtr += align32 - rem; }
        elemPtr = ctx.storagePtr;
      }
      
      // As in _liftFlatRecord: an element occupies exactly size32
      // bytes of the tuple's flat storage, so capture and restore
      // the storage budget around the element lift to stop a
      // field's internal storageLen use (e.g. lists) leaking into
      // the next element.
      // See https://github.com/bytecodealliance/jco/issues/1585.
      let elemLen;
      if (ctx.storageLen !== undefined) { elemLen = ctx.storageLen; }
      
      const [newValue, newCtx] = liftFn(ctx);
      val.push(newValue);
      ctx = newCtx;
      
      if (elemPtr !== undefined) {
        ctx.storagePtr = Math.max(ctx.storagePtr, elemPtr + size32);
      }
      if (elemLen !== undefined) {
        ctx.storageLen = elemLen - size32;
      }
    }
    
    if (originalPtr !== undefined) {
      ctx.storagePtr = Math.max(ctx.storagePtr, originalPtr + tupleSize32);
    }
    
    if (ctx.storagePtr !== undefined) {
      const rem = ctx.storagePtr % tupleAlign32;
      if (rem !== 0) { ctx.storagePtr += tupleAlign32 - rem; }
    }
    
    return [val, ctx];
  }
}

function _liftFlatEnum(meta) {
  meta.isEnum = true;
  const f = _liftFlatVariant(meta);
  return function _liftFlatEnumInner(ctx) {
    _debugLog('[_liftFlatEnum()] args', { ctx });
    const res = f(ctx);
    res[0] = res[0].tag;
    return res;
  }
}

function _liftFlatOption(meta) {
  const { payloadMaybeNull } = meta;
  const f = _liftFlatVariant(meta);
  return function _liftFlatOptionInner(ctx) {
    _debugLog('[_liftFlatOption()] args', { ctx });
    const res = f(ctx);
    if (!payloadMaybeNull) {
      res[0] = res[0].tag === 'none' ? undefined : res[0].val;
    }
    return res;
  }
}

function _liftFlatResult(meta) {
  const f = _liftFlatVariant(meta);
  return function _liftFlatResultInner(ctx) {
    _debugLog('[_liftFlatResult()] args', { ctx });
    const res = f(ctx);
    if (!('val' in res[0])) { res[0].val = undefined; }
    return res;
  }
}

function _lowerFlatBool(ctx) {
  _debugLog('[_lowerFlatBool()] args', { ctx });
  
  if (!ctx.memory) { throw new Error("missing memory for lower"); }
  if (ctx.vals.length !== 1) {
    throw new Error(`unexpected number [${ctx.vals.length}] of vals (expected 1)`);
  }
  
  
  new DataView(ctx.memory.buffer).setUint8(ctx.storagePtr, ctx.vals[0] ? 1 : 0);
  
  ctx.storagePtr += 1;
}

function _lowerFlatU8(ctx) {
  _debugLog('[_lowerFlatU8()] args', ctx);
  
  if (ctx.vals.length !== 1) {
    throw new Error(`unexpected number [${ctx.vals.length}] of vals (expected 1)`);
  }
  
  
  
  if (!ctx.memory) { throw new Error("missing memory for lower"); }
  new DataView(ctx.memory.buffer).setUint8(ctx.storagePtr, ctx.vals[0]);
  
  ctx.storagePtr += 1;
}

function _lowerFlatU16(ctx) {
  _debugLog('[_lowerFlatU16()] args', { ctx });
  
  if (!ctx.memory) { throw new Error("missing memory for lower"); }
  if (ctx.vals.length !== 1) {
    throw new Error(`unexpected number [${ctx.vals.length}] of vals (expected 1)`);
  }
  
  const rem = ctx.storagePtr % 2;
  if (rem !== 0) { ctx.storagePtr += (2 - rem); }
  
  
  new DataView(ctx.memory.buffer).setUint16(ctx.storagePtr, ctx.vals[0], true);
  
  ctx.storagePtr += 2;
}

function _lowerFlatS32(ctx) {
  _debugLog('[_lowerFlatS32()] args', { ctx });
  
  if (ctx.vals.length !== 1) {
    throw new Error(`unexpected number [${ctx.vals.length}] of vals (expected 1)`);
  }
  
  const rem = ctx.storagePtr % 4;
  if (rem !== 0) { ctx.storagePtr += (4 - rem); }
  
  
  new DataView(ctx.memory.buffer).setInt32(ctx.storagePtr, ctx.vals[0], true);
  
  ctx.storagePtr += 4;
}

function _lowerFlatU32(ctx) {
  _debugLog('[_lowerFlatU32()] args', { ctx });
  
  if (ctx.vals.length !== 1) {
    throw new Error(`expected single value to lower, got [${ctx.vals.length}]`);
  }
  
  const rem = ctx.storagePtr % 4;
  if (rem !== 0) { ctx.storagePtr += (4 - rem); }
  
  
  new DataView(ctx.memory.buffer).setUint32(ctx.storagePtr, ctx.vals[0], true);
  
  ctx.storagePtr += 4;
}

function _lowerFlatS64(ctx) {
  _debugLog('[_lowerFlatS64()] args', { ctx });
  
  if (ctx.vals.length !== 1) { throw new Error('unexpected number of vals'); }
  
  const rem = ctx.storagePtr % 8;
  if (rem !== 0) { ctx.storagePtr += (8 - rem); }
  
  
  new DataView(ctx.memory.buffer).setBigInt64(ctx.storagePtr, ctx.vals[0], true);
  
  
  ctx.storagePtr += 8;
}

function _lowerFlatU64(ctx) {
  _debugLog('[_lowerFlatU64()] args', { ctx });
  
  if (ctx.vals.length !== 1) { throw new Error('unexpected number of vals'); }
  
  const rem = ctx.storagePtr % 8;
  if (rem !== 0) { ctx.storagePtr += (8 - rem); }
  
  
  new DataView(ctx.memory.buffer).setBigUint64(ctx.storagePtr, ctx.vals[0], true);
  
  ctx.storagePtr += 8;
}

function _lowerFlatFloat64(ctx) {
  _debugLog('[_lowerFlatFloat64()] args', { ctx });
  
  if (ctx.vals.length !== 1) { throw new Error('unexpected number of vals'); }
  
  const rem = ctx.storagePtr % 8;
  if (rem !== 0) { ctx.storagePtr += (8 - rem); }
  
  
  new DataView(ctx.memory.buffer).setFloat64(ctx.storagePtr, ctx.vals[0], true);
  
  ctx.storagePtr += 8;
}

function _lowerFlatStringUTF8(ctx) {
  _debugLog('[_lowerFlatStringUTF8()] args', ctx);
  if (!ctx.realloc) { throw new Error('missing realloc during flat string lower'); }
  
  const { ptr, len } = _utf8AllocateAndEncode(ctx.vals[0], ctx.realloc, ctx.memory);
  
  const view = new DataView(ctx.memory.buffer);
  view.setUint32(ctx.storagePtr, ptr, true);
  view.setUint32(ctx.storagePtr + 4, len, true);
  
  ctx.storagePtr += 8;
}

function _lowerFlatStringUTF16(ctx) {
  _debugLog('[_lowerFlatStringUTF16()] args', { ctx });
  if (!ctx.realloc) { throw new Error('missing realloc during flat string lower'); }
  
  const { ptr, len } = _utf16AllocateAndEncode(ctx.vals[0], ctx.realloc, ctx.memory);
  
  const view = new DataView(ctx.memory.buffer);
  view.setUint32(ctx.storagePtr, ptr, true);
  view.setUint32(ctx.storagePtr + 4, len, true);
  
  ctx.storagePtr += 8;
}

function _lowerFlatStringAny(ctx) {
  switch (ctx.stringEncoding) {
    case 'utf8':
    return _lowerFlatStringUTF8(ctx);
    case 'utf16':
    return _lowerFlatStringUTF16(ctx);
    default:
    throw new Error(`missing/unrecognized/unsupported string encoding [${ctx.stringEncoding}]`);
  }
}

function _lowerFlatRecord(meta) {
  const { fieldMetas, size32: recordSize32, align32: recordAlign32 } = meta;
  return function _lowerFlatRecordInner(ctx) {
    _debugLog('[_lowerFlatRecord()] args', { ctx });
    
    const originalPtr = ctx.storagePtr;
    const r = ctx.vals[0];
    for (const [tag, lowerFn, size32, align32 ] of fieldMetas) {
      const rem = ctx.storagePtr % align32;
      if (rem !== 0) { ctx.storagePtr += align32 - rem; }
      
      const fieldPtr = ctx.storagePtr;
      ctx.vals = [r[tag]];
      lowerFn(ctx);
      
      ctx.storagePtr = Math.max(ctx.storagePtr, fieldPtr + size32);
    }
    
    ctx.storagePtr = Math.max(ctx.storagePtr, originalPtr + recordSize32);
    
    const rem = ctx.storagePtr % recordAlign32;
    if (rem !== 0) {
      ctx.storagePtr += recordAlign32 - rem;
    }
  }
}

function _lowerFlatVariant(meta) {
  const { variantSize32, variantAlign32, variantPayloadOffset32, caseMetas } = meta;
  
  let caseLookup = {};
  for (const [idx, meta] of caseMetas.entries()) {
    let tag = meta[0];
    caseLookup[tag] = { discriminant: idx, meta };
  }
  
  return function _lowerFlatVariantInner(ctx) {
    _debugLog('[_lowerFlatVariant()] args', { ctx });
    
    const { tag, val } = ctx.vals[0];
    const variantCase = caseLookup[tag];
    if (!variantCase) {
      throw new Error(`missing tag [${tag}] (valid tags: ${Object.keys(caseLookup)})`);
    }
    
    const [ _tag, lowerFn, caseSize32, caseAlign32, caseFlatCount ] = variantCase.meta;
    
    const originalPtr = ctx.storagePtr;
    ctx.vals = [variantCase.discriminant];
    let discLowerRes;
    if (caseMetas.length < 256) {
      discLowerRes = _lowerFlatU8(ctx);
    } else if (caseMetas.length >= 256 && caseMetas.length < 65536) {
      discLowerRes = _lowerFlatU16(ctx);
    } else if (caseMetas.length >= 65536 && caseMetas.length < 4_294_967_296) {
      discLowerRes = _lowerFlatU32(ctx);
    } else {
      throw new Error(`unsupported number of cases [${caseMetas.length}]`);
    }
    
    const payloadOffsetPtr = originalPtr + variantPayloadOffset32;
    ctx.storagePtr = payloadOffsetPtr;
    ctx.vals = [val];
    if (lowerFn) { lowerFn(ctx); }
    
    ctx.storagePtr = Math.max(ctx.storagePtr, originalPtr + variantSize32);
    
    const rem = ctx.storagePtr % variantAlign32;
    if (rem !== 0) { ctx.storagePtr += variantAlign32 - rem; }
  }
}

function _lowerFlatList(meta) {
  const {
    elemLowerFn,
    knownLen,
    size32,
    align32,
    elemSize32,
    elemAlign32,
  } = meta;
  
  if (!elemLowerFn) { throw new TypeError("missing/invalid element lower fn for list"); }
  
  return function _lowerFlatListInner(ctx) {
    _debugLog('[_lowerFlatList()] args', { ctx });
    
    if (ctx.useDirectParams) {
      if (ctx.params.length < 2) { throw new Error('insufficient params left to lower list'); }
      const storagePtr = ctx.params[0] >>> 0;
      const elemCount = ctx.params[1];
      ctx.params = ctx.params.slice(2);
      
      const list = ctx.vals[0];
      if (!list) { throw new Error("missing direct param value"); }
      
      const lowerCtx = {
        storagePtr,
        memory: ctx.memory,
        stringEncoding: ctx.stringEncoding,
      };
      for (let idx = 0; idx < list.length; idx++) {
        const elemPtr = storagePtr + idx * elemSize32;
        lowerCtx.storagePtr = elemPtr;
        lowerCtx.vals = list.slice(idx, idx+1);
        elemLowerFn(lowerCtx);
        lowerCtx.storagePtr = Math.max(lowerCtx.storagePtr, elemPtr + elemSize32);
      }
      ctx.storagePtr = lowerCtx.storagePtr;
      
      // TODO: implement parma-only known-length processing
      
      return;
    }
    
    // TODO(fix): is it possible to get a vals that are a addr and length here from
    // a component lower?
    
    const elems = ctx.vals[0];
    if (knownLen === undefined) {
      // unknown length
      if (!ctx.realloc) { throw new Error('missing realloc during flat string lower'); }
      const dataPtr = ctx.realloc(0, 0, elemAlign32, elemSize32 * elems.length);
      
      ctx.vals[0] = dataPtr;
      _lowerFlatU32(ctx);
      
      ctx.vals[0] = elems.length;
      _lowerFlatU32(ctx);
      
      const origPtr = ctx.storagePtr;
      ctx.storagePtr = dataPtr;
      
      for (const [idx, elem] of elems.entries()) {
        const elemPtr = dataPtr + idx * elemSize32;
        ctx.storagePtr = elemPtr;
        ctx.vals = [elem];
        elemLowerFn(ctx);
        ctx.storagePtr = Math.max(ctx.storagePtr, elemPtr + elemSize32);
      }
      
      ctx.storagePtr = origPtr;
      
    } else {
      // known length
      
      if (elems.length !== knownLen) {
        throw new TypeError(`invalid list input of length [${elems.length}], must be length [${knownLen}]`);
      }
      
      const originalPtr = ctx.storagePtr;
      for (const [idx, elem] of elems.entries()) {
        const elemPtr = originalPtr + idx * elemSize32;
        ctx.storagePtr = elemPtr;
        ctx.vals = [elem];
        elemLowerFn(ctx);
        ctx.storagePtr = Math.max(ctx.storagePtr, elemPtr + elemSize32);
      }
    }
    
    // TODO(fix): special case for u8/u16/etc, we can do a direct copy
    
    const totalSizeBytes = elems.length * size32;
    if (ctx.storageLen !== undefined && totalSizeBytes > ctx.storageLen) {
      throw new Error('not enough storage remaining for list flat lower');
    }
  }
}

function _lowerFlatTuple(meta) {
  const { elemLowerMetas, size32: tupleSize32, align32: tupleAlign32 } = meta;
  return function _lowerFlatTupleInner(ctx) {
    _debugLog('[_lowerFlatTuple()] args', { ctx });
    const originalPtr = ctx.storagePtr;
    const tuple = ctx.vals[0];
    for (const [idx, [ lowerFn, size32, align32 ]]  of elemLowerMetas.entries()) {
      const rem = ctx.storagePtr % align32;
      if (rem !== 0) { ctx.storagePtr += align32 - rem; }
      
      const elemPtr = ctx.storagePtr;
      ctx.vals = [tuple[idx]];
      lowerFn(ctx);
      ctx.storagePtr = Math.max(ctx.storagePtr, elemPtr + size32);
    }
    
    ctx.storagePtr = Math.max(ctx.storagePtr, originalPtr + tupleSize32);
    
    const rem = ctx.storagePtr % tupleAlign32;
    if (rem !== 0) {
      ctx.storagePtr += tupleAlign32 - rem;
    }
  }
}

function _lowerFlatEnum(meta) {
  const f = _lowerFlatVariant(meta);
  return function _lowerFlatEnumInner(ctx) {
    _debugLog('[_lowerFlatEnum()] args', { ctx });
    
    const v = ctx.vals[0];
    const isNotEnumObject = typeof v !== 'object'
    || Object.keys(v).length !== 2
    || !('tag' in v);
    if (isNotEnumObject) {
      ctx.vals[0] = { tag: v };
    }
    
    f(ctx);
  }
}

function _lowerFlatOption(meta) {
  const { payloadMaybeNull } = meta;
  const f = _lowerFlatVariant(meta);
  return function _lowerFlatOptionInner(ctx) {
    _debugLog('[_lowerFlatOption()] args', { ctx });
    
    const v = ctx.vals[0];
    if (v === null || v === undefined) {
      ctx.vals[0] = { tag: 'none' };
    } else if (payloadMaybeNull) {
      const isNotOptionObject = typeof v !== 'object'
      || Object.keys(v).length !== 2
      || !('tag' in v)
      || !(v.tag === 'some' || v.tag === 'none')
      || !('val' in v);
      if (isNotOptionObject) {
        ctx.vals[0] = { tag: 'some', val: v };
      }
    } else {
      ctx.vals[0] = { tag: 'some', val: v };
    }
    
    f(ctx);
  }
}

function _lowerFlatResult(meta) {
  const f = _lowerFlatVariant(meta);
  return function _lowerFlatResultInner(ctx) {
    _debugLog('[_lowerFlatResult()] args', { ctx });
    
    const v = ctx.vals[0];
    const isNotResultObject = typeof v !== 'object'
    || Object.keys(v).length !== 2
    || !('tag' in v)
    || !('ok' === v.tag || 'err' === v.tag)
    || !('val' in v);
    if (isNotResultObject) {
      ctx.vals[0] = { tag: 'ok', val: v };
    }
    
    f(ctx);
  };
}

function _trackHostOperation(operation) {
  const result = operation();
  if (result === null ||
  (typeof result !== 'object' && typeof result !== 'function') ||
  typeof result.then !== 'function') {
    return result;
  }
  
  STORE_ASYNC_STATE.pendingHostOperations++;
  const tracked = Promise.resolve(result).finally(() => {
    STORE_ASYNC_STATE.pendingHostOperations--;
    if (STORE_ASYNC_STATE.pendingHostOperations < 0) {
      throw new Error('negative pending host operation count');
    }
    for (const state of ASYNC_STATE.values()) { state.runTickLoop(); }
    _checkForDeadlock();
  });
  
  // Forward disposal to the host's value, so it is notified if a guest
  // discards the value (e.g. a future) produced from this operation
  for (const sym of [Symbol.asyncDispose, symbolDispose]) {
    if (typeof sym === 'symbol' && typeof result[sym] === 'function') {
      tracked[sym] = () => result[sym]();
    }
  }
  
  return tracked;
}

function clampGuest(i, min, max) {
  if (i < min || i > max) {
    throw new TypeError(`must be between ${min} and ${max}`);
  }
  return i;
}


const fetchCompile = url => fetch(url).then(WebAssembly.compileStreaming);

function throwInvalidBool() {
  throw new TypeError('invalid variant discriminant for bool');
}

function _suspendingImport(componentIdx, fn, syncOnly = false, switchesTask = false) {
  return function (...args) {
    _checkMayLeave(componentIdx);
    const saved = CURRENT_TASK_META[componentIdx] ?? null;
    
    const savedTask = saved
    ? getCurrentTask(saved.componentIdx, saved.taskID)?.task
    : null;
    const mayBlock = savedTask
    ? (savedTask?.mayBlock() ?? (CURRENT_TASK_MAY_BLOCK.value !== 0))
    : false;
    if (!saved && !mayBlock) {
      throw new WebAssemblyRuntimeError('cannot block a synchronous task before returning');
    }
    
    if (syncOnly || !mayBlock) {
      let result;
      try {
        result = fn.apply(null, args);
      } catch (err) {
        CURRENT_TASK_META[componentIdx] = saved;
        if (!switchesTask) { CURRENT_TASK_META.current = saved; }
        throw err;
      }
      
      CURRENT_TASK_META[componentIdx] = saved;
      if (!switchesTask) { CURRENT_TASK_META.current = saved; }
      
      if (result !== null &&
      (typeof result === 'object' || typeof result === 'function') &&
      typeof result.then === 'function') {
        // The helper may already have returned a rejected promise.
        // Mark it handled before replacing it with the canonical
        // synchronous-task trap.
        Promise.resolve(result).catch(() => {});
        throw new WebAssemblyRuntimeError('cannot block a synchronous task before returning');
      }
      return result;
    }
    
    return (async () => {
      try {
        return await fn.apply(null, args);
      } finally {
        CURRENT_TASK_META[componentIdx] = saved;
        if (!switchesTask) { CURRENT_TASK_META.current = saved; }
      }
    })();
  };
}


if (!getCoreModule) getCoreModule = (name) => fetchCompile(new URL(`./${name}`, import.meta.url));
const module0 = getCoreModule('abi.core.wasm');
const module1 = getCoreModule('abi.core2.wasm');
const module2 = getCoreModule('abi.core3.wasm');

const observe = imports.observe.default;
let gen= (function* _initGenerator () {
  const instanceFlags0 = new WebAssembly.Global({ value: "i32", mutable: true }, 1);
  INSTANCE_FLAGS.set(0, instanceFlags0);
  let exports0;
  let exports1;
  let memory0;
  let realloc0;
  let realloc0Async;
  
  const _trampoline0 = function(arg0, arg1) {
    var ptr0 = dataView(memory0).getUint32(((arg0 >>> 0)) + 8, true) >>> 0;
    var len0 = dataView(memory0).getUint32(((arg0 >>> 0)) + 12, true);
    var result0 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr0, len0));
    var bool1 = dataView(memory0).getUint8(((arg0 >>> 0)) + 16, true);
    var ptr2 = dataView(memory0).getUint32(((arg0 >>> 0)) + 24, true) >>> 0;
    var len2 = dataView(memory0).getUint32(((arg0 >>> 0)) + 28, true);
    var result2 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr2, len2));
    var len4 = dataView(memory0).getUint32(((arg0 >>> 0)) + 36, true);
    var base4 = dataView(memory0).getUint32(((arg0 >>> 0)) + 32, true) >>> 0;
    if (base4 < 0 || len4 < 0 || len4 > 22369621 || base4 > memory0.buffer.byteLength || len4 > Math.floor((memory0.buffer.byteLength - base4) / 12)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
    if (base4 % 4 !== 0) throw new TypeError(`list pointer [${base4}] is not aligned to 4`);
    var result4 = [];
    for (let i = 0; i < len4; i++) {
      const base = base4 + i * 12;
      var ptr3 = dataView(memory0).getUint32((base) + 4, true) >>> 0;
      var len3 = dataView(memory0).getUint32((base) + 8, true);
      var result3 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr3, len3));
      result4.push({
        x: dataView(memory0).getInt32((base) + 0, true),
        label: result3,
      });
    }
    var len9 = dataView(memory0).getUint32(((arg0 >>> 0)) + 44, true);
    var base9 = dataView(memory0).getUint32(((arg0 >>> 0)) + 40, true) >>> 0;
    if (base9 < 0 || len9 < 0 || len9 > 16777215 || base9 > memory0.buffer.byteLength || len9 > Math.floor((memory0.buffer.byteLength - base9) / 16)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
    if (base9 % 8 !== 0) throw new TypeError(`list pointer [${base9}] is not aligned to 8`);
    var result9 = [];
    for (let i = 0; i < len9; i++) {
      const base = base9 + i * 16;
      let variant8;
      switch (dataView(memory0).getUint8((base) + 0, true)) {
        case 0: {
          variant8= {
            tag: 'none',
          };
          break;
        }
        case 1: {
          variant8= {
            tag: 'number',
            val: dataView(memory0).getBigInt64((base) + 8, true)
          };
          break;
        }
        case 2: {
          var ptr5 = dataView(memory0).getUint32((base) + 8, true) >>> 0;
          var len5 = dataView(memory0).getUint32((base) + 12, true);
          var result5 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr5, len5));
          variant8= {
            tag: 'text',
            val: result5
          };
          break;
        }
        case 3: {
          var len7 = dataView(memory0).getUint32((base) + 12, true);
          var base7 = dataView(memory0).getUint32((base) + 8, true) >>> 0;
          if (base7 < 0 || len7 < 0 || len7 > 22369621 || base7 > memory0.buffer.byteLength || len7 > Math.floor((memory0.buffer.byteLength - base7) / 12)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
          if (base7 % 4 !== 0) throw new TypeError(`list pointer [${base7}] is not aligned to 4`);
          var result7 = [];
          for (let i = 0; i < len7; i++) {
            const base = base7 + i * 12;
            var ptr6 = dataView(memory0).getUint32((base) + 4, true) >>> 0;
            var len6 = dataView(memory0).getUint32((base) + 8, true);
            var result6 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr6, len6));
            result7.push({
              x: dataView(memory0).getInt32((base) + 0, true),
              label: result6,
            });
          }
          variant8= {
            tag: 'points',
            val: result7
          };
          break;
        }
        default: {
          throw new TypeError('invalid variant discriminant for Choice');
        }
      }
      result9.push(variant8);
    }
    let variant12;
    switch (dataView(memory0).getUint8(((arg0 >>> 0)) + 48, true)) {
      case 0: {
        variant12 = { tag: 'none' };
        break;
      }
      case 1: {
        let variant11;
        switch (dataView(memory0).getUint8(((arg0 >>> 0)) + 52, true)) {
          case 0: {
            variant11 = undefined;
            break;
          }
          case 1: {
            var ptr10 = dataView(memory0).getUint32(((arg0 >>> 0)) + 56, true) >>> 0;
            var len10 = dataView(memory0).getUint32(((arg0 >>> 0)) + 60, true);
            var result10 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr10, len10));
            variant11 = result10;
            break;
          }
          default: {
            throw new TypeError('invalid variant discriminant for option');
          }
        }
        variant12 = {
          tag: 'some',
          val: variant11
        };
        break;
      }
      default: {
        throw new TypeError('invalid variant discriminant for option');
      }
    }
    var len15 = dataView(memory0).getUint32(((arg0 >>> 0)) + 68, true);
    var base15 = dataView(memory0).getUint32(((arg0 >>> 0)) + 64, true) >>> 0;
    if (base15 < 0 || len15 < 0 || len15 > 22369621 || base15 > memory0.buffer.byteLength || len15 > Math.floor((memory0.buffer.byteLength - base15) / 12)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
    if (base15 % 4 !== 0) throw new TypeError(`list pointer [${base15}] is not aligned to 4`);
    var result15 = [];
    for (let i = 0; i < len15; i++) {
      const base = base15 + i * 12;
      let variant14;
      switch (dataView(memory0).getUint8((base) + 0, true)) {
        case 0: {
          variant14= {
            tag: 'ok',
            val: dataView(memory0).getInt32((base) + 4, true) >>> 0
          };
          break;
        }
        case 1: {
          var ptr13 = dataView(memory0).getUint32((base) + 4, true) >>> 0;
          var len13 = dataView(memory0).getUint32((base) + 8, true);
          var result13 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr13, len13));
          variant14= {
            tag: 'err',
            val: result13
          };
          break;
        }
        default: {
          throw new TypeError('invalid variant discriminant for expected');
        }
      }
      result15.push(variant14);
    }
    var ptr16 = dataView(memory0).getUint32(((arg0 >>> 0)) + 80, true) >>> 0;
    var len16 = dataView(memory0).getUint32(((arg0 >>> 0)) + 84, true);
    var result16 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr16, len16));
    let enum17;
    switch (dataView(memory0).getUint8(((arg0 >>> 0)) + 88, true)) {
      case 0: {
        enum17 = 'red';
        break;
      }
      case 1: {
        enum17 = 'green';
        break;
      }
      case 2: {
        enum17 = 'blue';
        break;
      }
      default: {
        throw new TypeError('invalid discriminant specified for Shade');
      }
    }
    var ptr18 = dataView(memory0).getUint32(((arg0 >>> 0)) + 92, true) >>> 0;
    var len18 = dataView(memory0).getUint32(((arg0 >>> 0)) + 96, true);
    if (ptr18 < 0 || len18 < 0 || len18 > 268435455 || ptr18 > memory0.buffer.byteLength || len18 > Math.floor((memory0.buffer.byteLength - ptr18) / 1)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
    if (ptr18 % 1 !== 0) throw new TypeError(`list pointer [${ptr18}] is not aligned to 1`);
    var result18 = new Uint8Array(memory0.buffer.slice(ptr18, ptr18 + len18 * 1));
    _debugLog('[iface="observe", function="observe"] [Instruction::CallInterface] (sync, @ enter)');
    const hostProvided = true;
    
    let parentTask;
    let task;
    let subtask;
    
    const createTask = () => {
      const results = createNewCurrentTask({
        componentIdx: -1,
        isAsync: false,
        entryFnName: 'observe',
        getCallbackFn: () => null,
        callbackFnName: null,
        errHandling: 'none',
        callingWasmExport: false,
      });
      task = results[0];
    };
    
    taskCreation: {
      parentTask = getCurrentTask(
      0,
      _getGlobalCurrentTaskMeta(0)?.taskID,
      )?.task;
      
      if (!parentTask) {
        createTask();
        break taskCreation;
      }
      
      createTask();
      
      if (hostProvided) {
        subtask = parentTask.getLatestSubtask();
        if (!subtask) {
          throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
        }
        task.setParentSubtask(subtask);
      }
    }
    
    const started = task.enterSync();
    let ret;
    
    
    try {
      ret = _withGlobalCurrentTaskMeta({
        componentIdx: task.componentIdx(),
        taskID: task.id(),
        fn: () => _trackHostOperation(() => observe({
          id: BigInt.asUintN(64, BigInt(dataView(memory0).getBigInt64(((arg0 >>> 0)) + 0, true))),
          name: result0,
          enabled: bool1 == 0 ? false : (bool1 == 1 ? true : throwInvalidBool()),
          anchor: {
            x: dataView(memory0).getInt32(((arg0 >>> 0)) + 20, true),
            label: result2,
          },
          values: result4,
          choices: result9,
          optional: variant12,
          verdicts: result15,
          pair: [dataView(memory0).getFloat64(((arg0 >>> 0)) + 72, true), result16],
          shade: enum17,
          bytes: result18,
        })),
      })
      ;
    } catch (err) {
      
      _debugLog('[Instruction::CallInterface] error during sync call', {
        taskID: task.id(),
        subtaskID: task.getParentSubtask()?.id(),
        err,
      });
      getOrCreateAsyncState(0).markTrapped(err);
      task.setErrored(err);
      task.reject(err);
      task.exit();
      throw err;
      
    }
    
    var {id: v19_0, name: v19_1, enabled: v19_2, anchor: v19_3, values: v19_4, choices: v19_5, optional: v19_6, verdicts: v19_7, pair: v19_8, shade: v19_9, bytes: v19_10 } = ret;
    dataView(memory0).setBigInt64(((arg1 >>> 0)) + 0, toUint64(v19_0), true);
    
    var encodeRes = _utf8AllocateAndEncode(v19_1, realloc0, memory0);
    var ptr20= encodeRes.ptr;
    var len20 = encodeRes.len;
    
    dataView(memory0).setUint32(((arg1 >>> 0)) + 12, len20, true);
    dataView(memory0).setUint32(((arg1 >>> 0)) + 8, ptr20, true);
    dataView(memory0).setInt8(((arg1 >>> 0)) + 16, v19_2 ? 1 : 0, true);
    var {x: v21_0, label: v21_1 } = v19_3;
    dataView(memory0).setInt32(((arg1 >>> 0)) + 20, toInt32(v21_0), true);
    
    var encodeRes = _utf8AllocateAndEncode(v21_1, realloc0, memory0);
    var ptr22= encodeRes.ptr;
    var len22 = encodeRes.len;
    
    dataView(memory0).setUint32(((arg1 >>> 0)) + 28, len22, true);
    dataView(memory0).setUint32(((arg1 >>> 0)) + 24, ptr22, true);
    var vec25 = v19_4;
    var len25 = vec25.length;
    var result25 = realloc0(0, 0, 4, len25 * 12);
    if (result25 < 0 || len25 < 0 || len25 > 22369621 || result25 > memory0.buffer.byteLength || len25 > Math.floor((memory0.buffer.byteLength - result25) / 12)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
    for (let i = 0; i < vec25.length; i++) {
      const e = vec25[i];
      const base = result25 + i * 12;var {x: v23_0, label: v23_1 } = e;
      dataView(memory0).setInt32((base) + 0, toInt32(v23_0), true);
      
      var encodeRes = _utf8AllocateAndEncode(v23_1, realloc0, memory0);
      var ptr24= encodeRes.ptr;
      var len24 = encodeRes.len;
      
      dataView(memory0).setUint32((base) + 8, len24, true);
      dataView(memory0).setUint32((base) + 4, ptr24, true);
    }
    dataView(memory0).setUint32(((arg1 >>> 0)) + 36, len25, true);
    dataView(memory0).setUint32(((arg1 >>> 0)) + 32, result25, true);
    var vec31 = v19_5;
    var len31 = vec31.length;
    var result31 = realloc0(0, 0, 8, len31 * 16);
    if (result31 < 0 || len31 < 0 || len31 > 16777215 || result31 > memory0.buffer.byteLength || len31 > Math.floor((memory0.buffer.byteLength - result31) / 16)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
    for (let i = 0; i < vec31.length; i++) {
      const e = vec31[i];
      const base = result31 + i * 16;var variant30 = e;
      switch (variant30.tag) {
        case 'none': {
          dataView(memory0).setInt8((base) + 0, 0, true);
          break;
        }
        case 'number': {
          const e = variant30.val;
          dataView(memory0).setInt8((base) + 0, 1, true);
          dataView(memory0).setBigInt64((base) + 8, toInt64(e), true);
          break;
        }
        case 'text': {
          const e = variant30.val;
          dataView(memory0).setInt8((base) + 0, 2, true);
          
          var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
          var ptr26= encodeRes.ptr;
          var len26 = encodeRes.len;
          
          dataView(memory0).setUint32((base) + 12, len26, true);
          dataView(memory0).setUint32((base) + 8, ptr26, true);
          break;
        }
        case 'points': {
          const e = variant30.val;
          dataView(memory0).setInt8((base) + 0, 3, true);
          var vec29 = e;
          var len29 = vec29.length;
          var result29 = realloc0(0, 0, 4, len29 * 12);
          if (result29 < 0 || len29 < 0 || len29 > 22369621 || result29 > memory0.buffer.byteLength || len29 > Math.floor((memory0.buffer.byteLength - result29) / 12)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
          for (let i = 0; i < vec29.length; i++) {
            const e = vec29[i];
            const base = result29 + i * 12;var {x: v27_0, label: v27_1 } = e;
            dataView(memory0).setInt32((base) + 0, toInt32(v27_0), true);
            
            var encodeRes = _utf8AllocateAndEncode(v27_1, realloc0, memory0);
            var ptr28= encodeRes.ptr;
            var len28 = encodeRes.len;
            
            dataView(memory0).setUint32((base) + 8, len28, true);
            dataView(memory0).setUint32((base) + 4, ptr28, true);
          }
          dataView(memory0).setUint32((base) + 12, len29, true);
          dataView(memory0).setUint32((base) + 8, result29, true);
          break;
        }
        default: {
          throw new TypeError(`invalid variant tag value \`${JSON.stringify(variant30.tag)}\` (received \`${variant30}\`) specified for \`Choice\``);
        }
      }
    }
    dataView(memory0).setUint32(((arg1 >>> 0)) + 44, len31, true);
    dataView(memory0).setUint32(((arg1 >>> 0)) + 40, result31, true);
    var variant34 = v19_6;
    switch (variant34.tag) {
      case 'none': {
        dataView(memory0).setInt8(((arg1 >>> 0)) + 48, 0, true);
        
        break;
      }
      case 'some': {
        const e = variant34.val;
        dataView(memory0).setInt8(((arg1 >>> 0)) + 48, 1, true);
        var variant33 = e;
        if (variant33 === null || variant33=== undefined) {
          dataView(memory0).setInt8(((arg1 >>> 0)) + 52, 0, true);
        } else {
          const e = variant33;
          dataView(memory0).setInt8(((arg1 >>> 0)) + 52, 1, true);
          
          var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
          var ptr32= encodeRes.ptr;
          var len32 = encodeRes.len;
          
          dataView(memory0).setUint32(((arg1 >>> 0)) + 60, len32, true);
          dataView(memory0).setUint32(((arg1 >>> 0)) + 56, ptr32, true);
        }
        
        break;
      }
      default: {
        _debugLog("ERROR: invalid value (expected option as object with 'tag' member)", { value: variant34, valueType: typeof variant34});
        throw new TypeError('invalid variant specified for option');
      }
    }
    var vec37 = v19_7;
    var len37 = vec37.length;
    var result37 = realloc0(0, 0, 4, len37 * 12);
    if (result37 < 0 || len37 < 0 || len37 > 22369621 || result37 > memory0.buffer.byteLength || len37 > Math.floor((memory0.buffer.byteLength - result37) / 12)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
    for (let i = 0; i < vec37.length; i++) {
      const e = vec37[i];
      const base = result37 + i * 12;var variant36 = e;
      switch (variant36.tag) {
        case 'ok': {
          const e = variant36.val;
          dataView(memory0).setInt8((base) + 0, 0, true);
          dataView(memory0).setInt32((base) + 4, toUint32(e), true);
          
          break;
        }
        case 'err': {
          const e = variant36.val;
          dataView(memory0).setInt8((base) + 0, 1, true);
          
          var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
          var ptr35= encodeRes.ptr;
          var len35 = encodeRes.len;
          
          dataView(memory0).setUint32((base) + 8, len35, true);
          dataView(memory0).setUint32((base) + 4, ptr35, true);
          
          break;
        }
        default: {
          _debugLog("ERROR: invalid value (expected result as object with 'tag' member)", { value: variant36, valueType: typeof variant36});
          throw new TypeError('invalid variant specified for result');
        }
      }
    }
    dataView(memory0).setUint32(((arg1 >>> 0)) + 68, len37, true);
    dataView(memory0).setUint32(((arg1 >>> 0)) + 64, result37, true);
    var [tuple38_0, tuple38_1] = v19_8;
    dataView(memory0).setFloat64(((arg1 >>> 0)) + 72, +tuple38_0, true);
    
    var encodeRes = _utf8AllocateAndEncode(tuple38_1, realloc0, memory0);
    var ptr39= encodeRes.ptr;
    var len39 = encodeRes.len;
    
    dataView(memory0).setUint32(((arg1 >>> 0)) + 84, len39, true);
    dataView(memory0).setUint32(((arg1 >>> 0)) + 80, ptr39, true);
    var val40 = v19_9;
    let enum40;
    switch (val40) {
      case 'red': {
        enum40 = 0;
        break;
      }
      case 'green': {
        enum40 = 1;
        break;
      }
      case 'blue': {
        enum40 = 2;
        break;
      }
      default: {
        if ((v19_9) instanceof Error) {
          console.error(v19_9);
        }
        
        throw new TypeError(`"${val40}" is not one of the cases of shade`);
      }
    }
    dataView(memory0).setInt8(((arg1 >>> 0)) + 88, enum40, true);
    var val41 = v19_10;
    var len41 = Array.isArray(val41) ? val41.length : val41.byteLength;
    var ptr41 = realloc0(0, 0, 1, len41 * 1);
    
    let valData41;
    const valLenBytes41 = len41 * 1;
    if (Array.isArray(val41)) {
      // Regular array likely containing numbers, write values to memory
      let offset = 0;
      const dv41 = new DataView(memory0.buffer);
      for (const v of val41) {
        _requireValidNumericPrimitive.bind(null, 'u8')(v);
        dv41.setUint8(ptr41+ offset, v, true);
        offset += 1;
      }
    } else {
      // TypedArray / ArrayBuffer-like, direct copy
      valData41 = new Uint8Array(val41.buffer || val41, val41.byteOffset, valLenBytes41);
      const out41 = new Uint8Array(memory0.buffer, ptr41, valLenBytes41);
      out41.set(valData41);
    }
    
    dataView(memory0).setUint32(((arg1 >>> 0)) + 96, len41, true);
    dataView(memory0).setUint32(((arg1 >>> 0)) + 92, ptr41, true);
    _debugLog('[iface="observe", function="observe"][Instruction::Return]', {
      funcName: 'observe',
      paramCount: 0,
      async: false,
      postReturn: false
    });
    task.resolve([ret]);
    task.exit();
  }
  _trampoline0.fnName = 'observe#observe';
  let exports2;
  let postReturn0;
  let postReturn0Async;
  let postReturn1;
  let postReturn1Async;
  let postReturn2;
  let postReturn2Async;
  let postReturn3;
  let postReturn3Async;
  let postReturn4;
  let postReturn4Async;
  let postReturn5;
  let postReturn5Async;
  let postReturn6;
  let postReturn6Async;
  let postReturn7;
  let postReturn7Async;
  let postReturn8;
  let postReturn8Async;
  let postReturn9;
  let postReturn9Async;
  let postReturn10;
  let postReturn10Async;
  let postReturn11;
  let postReturn11Async;
  let postReturn12;
  let postReturn12Async;
  let exports1EchoScalarValue;
  
  function echoScalarValue(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1EchoScalarValue',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (0!== null) {
      task.setReturnMemoryIdx(0);
      task.setReturnMemory((() => memory0)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          var variant0 = arg0;
          let variant0_0;
          let variant0_1;
          switch (variant0.tag) {
            case 'u32-value': {
              const e = variant0.val;
              variant0_0 = 0;
              variant0_1 = BigInt(toUint32(e));
              break;
            }
            case 's32-value': {
              const e = variant0.val;
              variant0_0 = 1;
              variant0_1 = BigInt(toInt32(e));
              break;
            }
            case 'f32-value': {
              const e = variant0.val;
              variant0_0 = 2;
              variant0_1 = BigInt(f32ToI32(+e));
              break;
            }
            case 'u64-value': {
              const e = variant0.val;
              variant0_0 = 3;
              variant0_1 = toUint64(e);
              break;
            }
            case 's64-value': {
              const e = variant0.val;
              variant0_0 = 4;
              variant0_1 = toInt64(e);
              break;
            }
            case 'f64-value': {
              const e = variant0.val;
              variant0_0 = 5;
              variant0_1 = f64ToI64(+e);
              break;
            }
            default: {
              throw new TypeError(`invalid variant tag value \`${JSON.stringify(variant0.tag)}\` (received \`${variant0}\`) specified for \`ScalarValue\``);
            }
          }
          _debugLog('[iface="echo-scalar-value", function="echo-scalar-value"][Instruction::CallWasm] enter', {
            funcName: 'echo-scalar-value',
            paramCount: 2,
            async: false,
            postReturn: false,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1EchoScalarValue(variant0_0, variant0_1),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          let variant1;
          switch (dataView(memory0).getUint8(((ret >>> 0)) + 0, true)) {
            case 0: {
              variant1= {
                tag: 'u32-value',
                val: dataView(memory0).getInt32(((ret >>> 0)) + 8, true) >>> 0
              };
              break;
            }
            case 1: {
              variant1= {
                tag: 's32-value',
                val: dataView(memory0).getInt32(((ret >>> 0)) + 8, true)
              };
              break;
            }
            case 2: {
              variant1= {
                tag: 'f32-value',
                val: dataView(memory0).getFloat32(((ret >>> 0)) + 8, true)
              };
              break;
            }
            case 3: {
              variant1= {
                tag: 'u64-value',
                val: BigInt.asUintN(64, BigInt(dataView(memory0).getBigInt64(((ret >>> 0)) + 8, true)))
              };
              break;
            }
            case 4: {
              variant1= {
                tag: 's64-value',
                val: dataView(memory0).getBigInt64(((ret >>> 0)) + 8, true)
              };
              break;
            }
            case 5: {
              variant1= {
                tag: 'f64-value',
                val: dataView(memory0).getFloat64(((ret >>> 0)) + 8, true)
              };
              break;
            }
            default: {
              throw new TypeError('invalid variant discriminant for ScalarValue');
            }
          }
          _debugLog('[iface="echo-scalar-value", function="echo-scalar-value"][Instruction::Return]', {
            funcName: 'echo-scalar-value',
            paramCount: 1,
            async: false,
            postReturn: false
          });
          task.resolve([variant1]);
          task.exit();
          return variant1;
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  let exports1InspectScalarValue;
  
  function inspectScalarValue(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1InspectScalarValue',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (0!== null) {
      task.setReturnMemoryIdx(0);
      task.setReturnMemory((() => memory0)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          var variant0 = arg0;
          let variant0_0;
          let variant0_1;
          switch (variant0.tag) {
            case 'u32-value': {
              const e = variant0.val;
              variant0_0 = 0;
              variant0_1 = BigInt(toUint32(e));
              break;
            }
            case 's32-value': {
              const e = variant0.val;
              variant0_0 = 1;
              variant0_1 = BigInt(toInt32(e));
              break;
            }
            case 'f32-value': {
              const e = variant0.val;
              variant0_0 = 2;
              variant0_1 = BigInt(f32ToI32(+e));
              break;
            }
            case 'u64-value': {
              const e = variant0.val;
              variant0_0 = 3;
              variant0_1 = toUint64(e);
              break;
            }
            case 's64-value': {
              const e = variant0.val;
              variant0_0 = 4;
              variant0_1 = toInt64(e);
              break;
            }
            case 'f64-value': {
              const e = variant0.val;
              variant0_0 = 5;
              variant0_1 = f64ToI64(+e);
              break;
            }
            default: {
              throw new TypeError(`invalid variant tag value \`${JSON.stringify(variant0.tag)}\` (received \`${variant0}\`) specified for \`ScalarValue\``);
            }
          }
          _debugLog('[iface="inspect-scalar-value", function="inspect-scalar-value"][Instruction::CallWasm] enter', {
            funcName: 'inspect-scalar-value',
            paramCount: 2,
            async: false,
            postReturn: true,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1InspectScalarValue(variant0_0, variant0_1),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          var ptr1 = dataView(memory0).getUint32(((ret >>> 0)) + 0, true) >>> 0;
          var len1 = dataView(memory0).getUint32(((ret >>> 0)) + 4, true);
          var result1 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr1, len1));
          _debugLog('[iface="inspect-scalar-value", function="inspect-scalar-value"][Instruction::Return]', {
            funcName: 'inspect-scalar-value',
            paramCount: 1,
            async: false,
            postReturn: true
          });
          task.resolve([result1]);
          const retCopy = result1;
          
          let cstate = getOrCreateAsyncState(0);
          cstate.mayLeave = false;
          postReturn0(ret);
          cstate.mayLeave = true;
          task.exit();
          return retCopy;
          
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  let exports1EchoAligned;
  
  function echoAligned(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1EchoAligned',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (0!== null) {
      task.setReturnMemoryIdx(0);
      task.setReturnMemory((() => memory0)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          var {a: v0_0, b: v0_1, c: v0_2, d: v0_3, e: v0_4, f: v0_5, g: v0_6, h: v0_7, enabled: v0_8 } = arg0;
          _debugLog('[iface="echo-aligned", function="echo-aligned"][Instruction::CallWasm] enter', {
            funcName: 'echo-aligned',
            paramCount: 9,
            async: false,
            postReturn: false,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1EchoAligned(toUint8(v0_0), toUint64(v0_1), toUint16(v0_2), toInt32(v0_3), +v0_4, toInt8(v0_5), +v0_6, toInt16(v0_7), v0_8 ? 1 : 0),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          var bool1 = dataView(memory0).getUint8(((ret >>> 0)) + 42, true);
          _debugLog('[iface="echo-aligned", function="echo-aligned"][Instruction::Return]', {
            funcName: 'echo-aligned',
            paramCount: 1,
            async: false,
            postReturn: false
          });
          task.resolve([{
            a: clampGuest(dataView(memory0).getUint8(((ret >>> 0)) + 0, true), 0, 255),
            b: BigInt.asUintN(64, BigInt(dataView(memory0).getBigInt64(((ret >>> 0)) + 8, true))),
            c: clampGuest(dataView(memory0).getUint16(((ret >>> 0)) + 16, true), 0, 65535),
            d: dataView(memory0).getInt32(((ret >>> 0)) + 20, true),
            e: dataView(memory0).getFloat32(((ret >>> 0)) + 24, true),
            f: clampGuest(dataView(memory0).getInt8(((ret >>> 0)) + 28, true), -128, 127),
            g: dataView(memory0).getFloat64(((ret >>> 0)) + 32, true),
            h: clampGuest(dataView(memory0).getInt16(((ret >>> 0)) + 40, true), -32768, 32767),
            enabled: bool1 == 0 ? false : (bool1 == 1 ? true : throwInvalidBool()),
          }]);
          task.exit();
          return {
            a: clampGuest(dataView(memory0).getUint8(((ret >>> 0)) + 0, true), 0, 255),
            b: BigInt.asUintN(64, BigInt(dataView(memory0).getBigInt64(((ret >>> 0)) + 8, true))),
            c: clampGuest(dataView(memory0).getUint16(((ret >>> 0)) + 16, true), 0, 65535),
            d: dataView(memory0).getInt32(((ret >>> 0)) + 20, true),
            e: dataView(memory0).getFloat32(((ret >>> 0)) + 24, true),
            f: clampGuest(dataView(memory0).getInt8(((ret >>> 0)) + 28, true), -128, 127),
            g: dataView(memory0).getFloat64(((ret >>> 0)) + 32, true),
            h: clampGuest(dataView(memory0).getInt16(((ret >>> 0)) + 40, true), -32768, 32767),
            enabled: bool1 == 0 ? false : (bool1 == 1 ? true : throwInvalidBool()),
          };
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  let exports1ListAligned;
  
  function listAligned(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1ListAligned',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (0!== null) {
      task.setReturnMemoryIdx(0);
      task.setReturnMemory((() => memory0)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          var vec1 = arg0;
          var len1 = vec1.length;
          var result1 = realloc0(0, 0, 8, len1 * 48);
          if (result1 < 0 || len1 < 0 || len1 > 5592405 || result1 > memory0.buffer.byteLength || len1 > Math.floor((memory0.buffer.byteLength - result1) / 48)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
          for (let i = 0; i < vec1.length; i++) {
            const e = vec1[i];
            const base = result1 + i * 48;var {a: v0_0, b: v0_1, c: v0_2, d: v0_3, e: v0_4, f: v0_5, g: v0_6, h: v0_7, enabled: v0_8 } = e;
            dataView(memory0).setInt8((base) + 0, toUint8(v0_0), true);
            dataView(memory0).setBigInt64((base) + 8, toUint64(v0_1), true);
            dataView(memory0).setInt16((base) + 16, toUint16(v0_2), true);
            dataView(memory0).setInt32((base) + 20, toInt32(v0_3), true);
            dataView(memory0).setFloat32((base) + 24, +v0_4, true);
            dataView(memory0).setInt8((base) + 28, toInt8(v0_5), true);
            dataView(memory0).setFloat64((base) + 32, +v0_6, true);
            dataView(memory0).setInt16((base) + 40, toInt16(v0_7), true);
            dataView(memory0).setInt8((base) + 42, v0_8 ? 1 : 0, true);
          }
          _debugLog('[iface="list-aligned", function="list-aligned"][Instruction::CallWasm] enter', {
            funcName: 'list-aligned',
            paramCount: 2,
            async: false,
            postReturn: true,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1ListAligned(result1, len1),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          var len3 = dataView(memory0).getUint32(((ret >>> 0)) + 4, true);
          var base3 = dataView(memory0).getUint32(((ret >>> 0)) + 0, true) >>> 0;
          if (base3 < 0 || len3 < 0 || len3 > 5592405 || base3 > memory0.buffer.byteLength || len3 > Math.floor((memory0.buffer.byteLength - base3) / 48)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
          if (base3 % 8 !== 0) throw new TypeError(`list pointer [${base3}] is not aligned to 8`);
          var result3 = [];
          for (let i = 0; i < len3; i++) {
            const base = base3 + i * 48;
            var bool2 = dataView(memory0).getUint8((base) + 42, true);
            result3.push({
              a: clampGuest(dataView(memory0).getUint8((base) + 0, true), 0, 255),
              b: BigInt.asUintN(64, BigInt(dataView(memory0).getBigInt64((base) + 8, true))),
              c: clampGuest(dataView(memory0).getUint16((base) + 16, true), 0, 65535),
              d: dataView(memory0).getInt32((base) + 20, true),
              e: dataView(memory0).getFloat32((base) + 24, true),
              f: clampGuest(dataView(memory0).getInt8((base) + 28, true), -128, 127),
              g: dataView(memory0).getFloat64((base) + 32, true),
              h: clampGuest(dataView(memory0).getInt16((base) + 40, true), -32768, 32767),
              enabled: bool2 == 0 ? false : (bool2 == 1 ? true : throwInvalidBool()),
            });
          }
          _debugLog('[iface="list-aligned", function="list-aligned"][Instruction::Return]', {
            funcName: 'list-aligned',
            paramCount: 1,
            async: false,
            postReturn: true
          });
          task.resolve([result3]);
          const retCopy = result3;
          
          let cstate = getOrCreateAsyncState(0);
          cstate.mayLeave = false;
          postReturn1(ret);
          cstate.mayLeave = true;
          task.exit();
          return retCopy;
          
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  let exports1EchoU8;
  
  function enum256(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1EchoU8',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (null!== null) {
      task.setReturnMemoryIdx(null);
      task.setReturnMemory((() => null)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          var val0 = arg0;
          let enum0;
          switch (val0) {
            case 'c0': {
              enum0 = 0;
              break;
            }
            case 'c1': {
              enum0 = 1;
              break;
            }
            case 'c2': {
              enum0 = 2;
              break;
            }
            case 'c3': {
              enum0 = 3;
              break;
            }
            case 'c4': {
              enum0 = 4;
              break;
            }
            case 'c5': {
              enum0 = 5;
              break;
            }
            case 'c6': {
              enum0 = 6;
              break;
            }
            case 'c7': {
              enum0 = 7;
              break;
            }
            case 'c8': {
              enum0 = 8;
              break;
            }
            case 'c9': {
              enum0 = 9;
              break;
            }
            case 'c10': {
              enum0 = 10;
              break;
            }
            case 'c11': {
              enum0 = 11;
              break;
            }
            case 'c12': {
              enum0 = 12;
              break;
            }
            case 'c13': {
              enum0 = 13;
              break;
            }
            case 'c14': {
              enum0 = 14;
              break;
            }
            case 'c15': {
              enum0 = 15;
              break;
            }
            case 'c16': {
              enum0 = 16;
              break;
            }
            case 'c17': {
              enum0 = 17;
              break;
            }
            case 'c18': {
              enum0 = 18;
              break;
            }
            case 'c19': {
              enum0 = 19;
              break;
            }
            case 'c20': {
              enum0 = 20;
              break;
            }
            case 'c21': {
              enum0 = 21;
              break;
            }
            case 'c22': {
              enum0 = 22;
              break;
            }
            case 'c23': {
              enum0 = 23;
              break;
            }
            case 'c24': {
              enum0 = 24;
              break;
            }
            case 'c25': {
              enum0 = 25;
              break;
            }
            case 'c26': {
              enum0 = 26;
              break;
            }
            case 'c27': {
              enum0 = 27;
              break;
            }
            case 'c28': {
              enum0 = 28;
              break;
            }
            case 'c29': {
              enum0 = 29;
              break;
            }
            case 'c30': {
              enum0 = 30;
              break;
            }
            case 'c31': {
              enum0 = 31;
              break;
            }
            case 'c32': {
              enum0 = 32;
              break;
            }
            case 'c33': {
              enum0 = 33;
              break;
            }
            case 'c34': {
              enum0 = 34;
              break;
            }
            case 'c35': {
              enum0 = 35;
              break;
            }
            case 'c36': {
              enum0 = 36;
              break;
            }
            case 'c37': {
              enum0 = 37;
              break;
            }
            case 'c38': {
              enum0 = 38;
              break;
            }
            case 'c39': {
              enum0 = 39;
              break;
            }
            case 'c40': {
              enum0 = 40;
              break;
            }
            case 'c41': {
              enum0 = 41;
              break;
            }
            case 'c42': {
              enum0 = 42;
              break;
            }
            case 'c43': {
              enum0 = 43;
              break;
            }
            case 'c44': {
              enum0 = 44;
              break;
            }
            case 'c45': {
              enum0 = 45;
              break;
            }
            case 'c46': {
              enum0 = 46;
              break;
            }
            case 'c47': {
              enum0 = 47;
              break;
            }
            case 'c48': {
              enum0 = 48;
              break;
            }
            case 'c49': {
              enum0 = 49;
              break;
            }
            case 'c50': {
              enum0 = 50;
              break;
            }
            case 'c51': {
              enum0 = 51;
              break;
            }
            case 'c52': {
              enum0 = 52;
              break;
            }
            case 'c53': {
              enum0 = 53;
              break;
            }
            case 'c54': {
              enum0 = 54;
              break;
            }
            case 'c55': {
              enum0 = 55;
              break;
            }
            case 'c56': {
              enum0 = 56;
              break;
            }
            case 'c57': {
              enum0 = 57;
              break;
            }
            case 'c58': {
              enum0 = 58;
              break;
            }
            case 'c59': {
              enum0 = 59;
              break;
            }
            case 'c60': {
              enum0 = 60;
              break;
            }
            case 'c61': {
              enum0 = 61;
              break;
            }
            case 'c62': {
              enum0 = 62;
              break;
            }
            case 'c63': {
              enum0 = 63;
              break;
            }
            case 'c64': {
              enum0 = 64;
              break;
            }
            case 'c65': {
              enum0 = 65;
              break;
            }
            case 'c66': {
              enum0 = 66;
              break;
            }
            case 'c67': {
              enum0 = 67;
              break;
            }
            case 'c68': {
              enum0 = 68;
              break;
            }
            case 'c69': {
              enum0 = 69;
              break;
            }
            case 'c70': {
              enum0 = 70;
              break;
            }
            case 'c71': {
              enum0 = 71;
              break;
            }
            case 'c72': {
              enum0 = 72;
              break;
            }
            case 'c73': {
              enum0 = 73;
              break;
            }
            case 'c74': {
              enum0 = 74;
              break;
            }
            case 'c75': {
              enum0 = 75;
              break;
            }
            case 'c76': {
              enum0 = 76;
              break;
            }
            case 'c77': {
              enum0 = 77;
              break;
            }
            case 'c78': {
              enum0 = 78;
              break;
            }
            case 'c79': {
              enum0 = 79;
              break;
            }
            case 'c80': {
              enum0 = 80;
              break;
            }
            case 'c81': {
              enum0 = 81;
              break;
            }
            case 'c82': {
              enum0 = 82;
              break;
            }
            case 'c83': {
              enum0 = 83;
              break;
            }
            case 'c84': {
              enum0 = 84;
              break;
            }
            case 'c85': {
              enum0 = 85;
              break;
            }
            case 'c86': {
              enum0 = 86;
              break;
            }
            case 'c87': {
              enum0 = 87;
              break;
            }
            case 'c88': {
              enum0 = 88;
              break;
            }
            case 'c89': {
              enum0 = 89;
              break;
            }
            case 'c90': {
              enum0 = 90;
              break;
            }
            case 'c91': {
              enum0 = 91;
              break;
            }
            case 'c92': {
              enum0 = 92;
              break;
            }
            case 'c93': {
              enum0 = 93;
              break;
            }
            case 'c94': {
              enum0 = 94;
              break;
            }
            case 'c95': {
              enum0 = 95;
              break;
            }
            case 'c96': {
              enum0 = 96;
              break;
            }
            case 'c97': {
              enum0 = 97;
              break;
            }
            case 'c98': {
              enum0 = 98;
              break;
            }
            case 'c99': {
              enum0 = 99;
              break;
            }
            case 'c100': {
              enum0 = 100;
              break;
            }
            case 'c101': {
              enum0 = 101;
              break;
            }
            case 'c102': {
              enum0 = 102;
              break;
            }
            case 'c103': {
              enum0 = 103;
              break;
            }
            case 'c104': {
              enum0 = 104;
              break;
            }
            case 'c105': {
              enum0 = 105;
              break;
            }
            case 'c106': {
              enum0 = 106;
              break;
            }
            case 'c107': {
              enum0 = 107;
              break;
            }
            case 'c108': {
              enum0 = 108;
              break;
            }
            case 'c109': {
              enum0 = 109;
              break;
            }
            case 'c110': {
              enum0 = 110;
              break;
            }
            case 'c111': {
              enum0 = 111;
              break;
            }
            case 'c112': {
              enum0 = 112;
              break;
            }
            case 'c113': {
              enum0 = 113;
              break;
            }
            case 'c114': {
              enum0 = 114;
              break;
            }
            case 'c115': {
              enum0 = 115;
              break;
            }
            case 'c116': {
              enum0 = 116;
              break;
            }
            case 'c117': {
              enum0 = 117;
              break;
            }
            case 'c118': {
              enum0 = 118;
              break;
            }
            case 'c119': {
              enum0 = 119;
              break;
            }
            case 'c120': {
              enum0 = 120;
              break;
            }
            case 'c121': {
              enum0 = 121;
              break;
            }
            case 'c122': {
              enum0 = 122;
              break;
            }
            case 'c123': {
              enum0 = 123;
              break;
            }
            case 'c124': {
              enum0 = 124;
              break;
            }
            case 'c125': {
              enum0 = 125;
              break;
            }
            case 'c126': {
              enum0 = 126;
              break;
            }
            case 'c127': {
              enum0 = 127;
              break;
            }
            case 'c128': {
              enum0 = 128;
              break;
            }
            case 'c129': {
              enum0 = 129;
              break;
            }
            case 'c130': {
              enum0 = 130;
              break;
            }
            case 'c131': {
              enum0 = 131;
              break;
            }
            case 'c132': {
              enum0 = 132;
              break;
            }
            case 'c133': {
              enum0 = 133;
              break;
            }
            case 'c134': {
              enum0 = 134;
              break;
            }
            case 'c135': {
              enum0 = 135;
              break;
            }
            case 'c136': {
              enum0 = 136;
              break;
            }
            case 'c137': {
              enum0 = 137;
              break;
            }
            case 'c138': {
              enum0 = 138;
              break;
            }
            case 'c139': {
              enum0 = 139;
              break;
            }
            case 'c140': {
              enum0 = 140;
              break;
            }
            case 'c141': {
              enum0 = 141;
              break;
            }
            case 'c142': {
              enum0 = 142;
              break;
            }
            case 'c143': {
              enum0 = 143;
              break;
            }
            case 'c144': {
              enum0 = 144;
              break;
            }
            case 'c145': {
              enum0 = 145;
              break;
            }
            case 'c146': {
              enum0 = 146;
              break;
            }
            case 'c147': {
              enum0 = 147;
              break;
            }
            case 'c148': {
              enum0 = 148;
              break;
            }
            case 'c149': {
              enum0 = 149;
              break;
            }
            case 'c150': {
              enum0 = 150;
              break;
            }
            case 'c151': {
              enum0 = 151;
              break;
            }
            case 'c152': {
              enum0 = 152;
              break;
            }
            case 'c153': {
              enum0 = 153;
              break;
            }
            case 'c154': {
              enum0 = 154;
              break;
            }
            case 'c155': {
              enum0 = 155;
              break;
            }
            case 'c156': {
              enum0 = 156;
              break;
            }
            case 'c157': {
              enum0 = 157;
              break;
            }
            case 'c158': {
              enum0 = 158;
              break;
            }
            case 'c159': {
              enum0 = 159;
              break;
            }
            case 'c160': {
              enum0 = 160;
              break;
            }
            case 'c161': {
              enum0 = 161;
              break;
            }
            case 'c162': {
              enum0 = 162;
              break;
            }
            case 'c163': {
              enum0 = 163;
              break;
            }
            case 'c164': {
              enum0 = 164;
              break;
            }
            case 'c165': {
              enum0 = 165;
              break;
            }
            case 'c166': {
              enum0 = 166;
              break;
            }
            case 'c167': {
              enum0 = 167;
              break;
            }
            case 'c168': {
              enum0 = 168;
              break;
            }
            case 'c169': {
              enum0 = 169;
              break;
            }
            case 'c170': {
              enum0 = 170;
              break;
            }
            case 'c171': {
              enum0 = 171;
              break;
            }
            case 'c172': {
              enum0 = 172;
              break;
            }
            case 'c173': {
              enum0 = 173;
              break;
            }
            case 'c174': {
              enum0 = 174;
              break;
            }
            case 'c175': {
              enum0 = 175;
              break;
            }
            case 'c176': {
              enum0 = 176;
              break;
            }
            case 'c177': {
              enum0 = 177;
              break;
            }
            case 'c178': {
              enum0 = 178;
              break;
            }
            case 'c179': {
              enum0 = 179;
              break;
            }
            case 'c180': {
              enum0 = 180;
              break;
            }
            case 'c181': {
              enum0 = 181;
              break;
            }
            case 'c182': {
              enum0 = 182;
              break;
            }
            case 'c183': {
              enum0 = 183;
              break;
            }
            case 'c184': {
              enum0 = 184;
              break;
            }
            case 'c185': {
              enum0 = 185;
              break;
            }
            case 'c186': {
              enum0 = 186;
              break;
            }
            case 'c187': {
              enum0 = 187;
              break;
            }
            case 'c188': {
              enum0 = 188;
              break;
            }
            case 'c189': {
              enum0 = 189;
              break;
            }
            case 'c190': {
              enum0 = 190;
              break;
            }
            case 'c191': {
              enum0 = 191;
              break;
            }
            case 'c192': {
              enum0 = 192;
              break;
            }
            case 'c193': {
              enum0 = 193;
              break;
            }
            case 'c194': {
              enum0 = 194;
              break;
            }
            case 'c195': {
              enum0 = 195;
              break;
            }
            case 'c196': {
              enum0 = 196;
              break;
            }
            case 'c197': {
              enum0 = 197;
              break;
            }
            case 'c198': {
              enum0 = 198;
              break;
            }
            case 'c199': {
              enum0 = 199;
              break;
            }
            case 'c200': {
              enum0 = 200;
              break;
            }
            case 'c201': {
              enum0 = 201;
              break;
            }
            case 'c202': {
              enum0 = 202;
              break;
            }
            case 'c203': {
              enum0 = 203;
              break;
            }
            case 'c204': {
              enum0 = 204;
              break;
            }
            case 'c205': {
              enum0 = 205;
              break;
            }
            case 'c206': {
              enum0 = 206;
              break;
            }
            case 'c207': {
              enum0 = 207;
              break;
            }
            case 'c208': {
              enum0 = 208;
              break;
            }
            case 'c209': {
              enum0 = 209;
              break;
            }
            case 'c210': {
              enum0 = 210;
              break;
            }
            case 'c211': {
              enum0 = 211;
              break;
            }
            case 'c212': {
              enum0 = 212;
              break;
            }
            case 'c213': {
              enum0 = 213;
              break;
            }
            case 'c214': {
              enum0 = 214;
              break;
            }
            case 'c215': {
              enum0 = 215;
              break;
            }
            case 'c216': {
              enum0 = 216;
              break;
            }
            case 'c217': {
              enum0 = 217;
              break;
            }
            case 'c218': {
              enum0 = 218;
              break;
            }
            case 'c219': {
              enum0 = 219;
              break;
            }
            case 'c220': {
              enum0 = 220;
              break;
            }
            case 'c221': {
              enum0 = 221;
              break;
            }
            case 'c222': {
              enum0 = 222;
              break;
            }
            case 'c223': {
              enum0 = 223;
              break;
            }
            case 'c224': {
              enum0 = 224;
              break;
            }
            case 'c225': {
              enum0 = 225;
              break;
            }
            case 'c226': {
              enum0 = 226;
              break;
            }
            case 'c227': {
              enum0 = 227;
              break;
            }
            case 'c228': {
              enum0 = 228;
              break;
            }
            case 'c229': {
              enum0 = 229;
              break;
            }
            case 'c230': {
              enum0 = 230;
              break;
            }
            case 'c231': {
              enum0 = 231;
              break;
            }
            case 'c232': {
              enum0 = 232;
              break;
            }
            case 'c233': {
              enum0 = 233;
              break;
            }
            case 'c234': {
              enum0 = 234;
              break;
            }
            case 'c235': {
              enum0 = 235;
              break;
            }
            case 'c236': {
              enum0 = 236;
              break;
            }
            case 'c237': {
              enum0 = 237;
              break;
            }
            case 'c238': {
              enum0 = 238;
              break;
            }
            case 'c239': {
              enum0 = 239;
              break;
            }
            case 'c240': {
              enum0 = 240;
              break;
            }
            case 'c241': {
              enum0 = 241;
              break;
            }
            case 'c242': {
              enum0 = 242;
              break;
            }
            case 'c243': {
              enum0 = 243;
              break;
            }
            case 'c244': {
              enum0 = 244;
              break;
            }
            case 'c245': {
              enum0 = 245;
              break;
            }
            case 'c246': {
              enum0 = 246;
              break;
            }
            case 'c247': {
              enum0 = 247;
              break;
            }
            case 'c248': {
              enum0 = 248;
              break;
            }
            case 'c249': {
              enum0 = 249;
              break;
            }
            case 'c250': {
              enum0 = 250;
              break;
            }
            case 'c251': {
              enum0 = 251;
              break;
            }
            case 'c252': {
              enum0 = 252;
              break;
            }
            case 'c253': {
              enum0 = 253;
              break;
            }
            case 'c254': {
              enum0 = 254;
              break;
            }
            case 'c255': {
              enum0 = 255;
              break;
            }
            default: {
              if ((arg0) instanceof Error) {
                console.error(arg0);
              }
              
              throw new TypeError(`"${val0}" is not one of the cases of enum-256`);
            }
          }
          _debugLog('[iface="enum-256", function="enum-256"][Instruction::CallWasm] enter', {
            funcName: 'enum-256',
            paramCount: 1,
            async: false,
            postReturn: false,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1EchoU8(enum0),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          let enum1;
          switch (ret) {
            case 0: {
              enum1 = 'c0';
              break;
            }
            case 1: {
              enum1 = 'c1';
              break;
            }
            case 2: {
              enum1 = 'c2';
              break;
            }
            case 3: {
              enum1 = 'c3';
              break;
            }
            case 4: {
              enum1 = 'c4';
              break;
            }
            case 5: {
              enum1 = 'c5';
              break;
            }
            case 6: {
              enum1 = 'c6';
              break;
            }
            case 7: {
              enum1 = 'c7';
              break;
            }
            case 8: {
              enum1 = 'c8';
              break;
            }
            case 9: {
              enum1 = 'c9';
              break;
            }
            case 10: {
              enum1 = 'c10';
              break;
            }
            case 11: {
              enum1 = 'c11';
              break;
            }
            case 12: {
              enum1 = 'c12';
              break;
            }
            case 13: {
              enum1 = 'c13';
              break;
            }
            case 14: {
              enum1 = 'c14';
              break;
            }
            case 15: {
              enum1 = 'c15';
              break;
            }
            case 16: {
              enum1 = 'c16';
              break;
            }
            case 17: {
              enum1 = 'c17';
              break;
            }
            case 18: {
              enum1 = 'c18';
              break;
            }
            case 19: {
              enum1 = 'c19';
              break;
            }
            case 20: {
              enum1 = 'c20';
              break;
            }
            case 21: {
              enum1 = 'c21';
              break;
            }
            case 22: {
              enum1 = 'c22';
              break;
            }
            case 23: {
              enum1 = 'c23';
              break;
            }
            case 24: {
              enum1 = 'c24';
              break;
            }
            case 25: {
              enum1 = 'c25';
              break;
            }
            case 26: {
              enum1 = 'c26';
              break;
            }
            case 27: {
              enum1 = 'c27';
              break;
            }
            case 28: {
              enum1 = 'c28';
              break;
            }
            case 29: {
              enum1 = 'c29';
              break;
            }
            case 30: {
              enum1 = 'c30';
              break;
            }
            case 31: {
              enum1 = 'c31';
              break;
            }
            case 32: {
              enum1 = 'c32';
              break;
            }
            case 33: {
              enum1 = 'c33';
              break;
            }
            case 34: {
              enum1 = 'c34';
              break;
            }
            case 35: {
              enum1 = 'c35';
              break;
            }
            case 36: {
              enum1 = 'c36';
              break;
            }
            case 37: {
              enum1 = 'c37';
              break;
            }
            case 38: {
              enum1 = 'c38';
              break;
            }
            case 39: {
              enum1 = 'c39';
              break;
            }
            case 40: {
              enum1 = 'c40';
              break;
            }
            case 41: {
              enum1 = 'c41';
              break;
            }
            case 42: {
              enum1 = 'c42';
              break;
            }
            case 43: {
              enum1 = 'c43';
              break;
            }
            case 44: {
              enum1 = 'c44';
              break;
            }
            case 45: {
              enum1 = 'c45';
              break;
            }
            case 46: {
              enum1 = 'c46';
              break;
            }
            case 47: {
              enum1 = 'c47';
              break;
            }
            case 48: {
              enum1 = 'c48';
              break;
            }
            case 49: {
              enum1 = 'c49';
              break;
            }
            case 50: {
              enum1 = 'c50';
              break;
            }
            case 51: {
              enum1 = 'c51';
              break;
            }
            case 52: {
              enum1 = 'c52';
              break;
            }
            case 53: {
              enum1 = 'c53';
              break;
            }
            case 54: {
              enum1 = 'c54';
              break;
            }
            case 55: {
              enum1 = 'c55';
              break;
            }
            case 56: {
              enum1 = 'c56';
              break;
            }
            case 57: {
              enum1 = 'c57';
              break;
            }
            case 58: {
              enum1 = 'c58';
              break;
            }
            case 59: {
              enum1 = 'c59';
              break;
            }
            case 60: {
              enum1 = 'c60';
              break;
            }
            case 61: {
              enum1 = 'c61';
              break;
            }
            case 62: {
              enum1 = 'c62';
              break;
            }
            case 63: {
              enum1 = 'c63';
              break;
            }
            case 64: {
              enum1 = 'c64';
              break;
            }
            case 65: {
              enum1 = 'c65';
              break;
            }
            case 66: {
              enum1 = 'c66';
              break;
            }
            case 67: {
              enum1 = 'c67';
              break;
            }
            case 68: {
              enum1 = 'c68';
              break;
            }
            case 69: {
              enum1 = 'c69';
              break;
            }
            case 70: {
              enum1 = 'c70';
              break;
            }
            case 71: {
              enum1 = 'c71';
              break;
            }
            case 72: {
              enum1 = 'c72';
              break;
            }
            case 73: {
              enum1 = 'c73';
              break;
            }
            case 74: {
              enum1 = 'c74';
              break;
            }
            case 75: {
              enum1 = 'c75';
              break;
            }
            case 76: {
              enum1 = 'c76';
              break;
            }
            case 77: {
              enum1 = 'c77';
              break;
            }
            case 78: {
              enum1 = 'c78';
              break;
            }
            case 79: {
              enum1 = 'c79';
              break;
            }
            case 80: {
              enum1 = 'c80';
              break;
            }
            case 81: {
              enum1 = 'c81';
              break;
            }
            case 82: {
              enum1 = 'c82';
              break;
            }
            case 83: {
              enum1 = 'c83';
              break;
            }
            case 84: {
              enum1 = 'c84';
              break;
            }
            case 85: {
              enum1 = 'c85';
              break;
            }
            case 86: {
              enum1 = 'c86';
              break;
            }
            case 87: {
              enum1 = 'c87';
              break;
            }
            case 88: {
              enum1 = 'c88';
              break;
            }
            case 89: {
              enum1 = 'c89';
              break;
            }
            case 90: {
              enum1 = 'c90';
              break;
            }
            case 91: {
              enum1 = 'c91';
              break;
            }
            case 92: {
              enum1 = 'c92';
              break;
            }
            case 93: {
              enum1 = 'c93';
              break;
            }
            case 94: {
              enum1 = 'c94';
              break;
            }
            case 95: {
              enum1 = 'c95';
              break;
            }
            case 96: {
              enum1 = 'c96';
              break;
            }
            case 97: {
              enum1 = 'c97';
              break;
            }
            case 98: {
              enum1 = 'c98';
              break;
            }
            case 99: {
              enum1 = 'c99';
              break;
            }
            case 100: {
              enum1 = 'c100';
              break;
            }
            case 101: {
              enum1 = 'c101';
              break;
            }
            case 102: {
              enum1 = 'c102';
              break;
            }
            case 103: {
              enum1 = 'c103';
              break;
            }
            case 104: {
              enum1 = 'c104';
              break;
            }
            case 105: {
              enum1 = 'c105';
              break;
            }
            case 106: {
              enum1 = 'c106';
              break;
            }
            case 107: {
              enum1 = 'c107';
              break;
            }
            case 108: {
              enum1 = 'c108';
              break;
            }
            case 109: {
              enum1 = 'c109';
              break;
            }
            case 110: {
              enum1 = 'c110';
              break;
            }
            case 111: {
              enum1 = 'c111';
              break;
            }
            case 112: {
              enum1 = 'c112';
              break;
            }
            case 113: {
              enum1 = 'c113';
              break;
            }
            case 114: {
              enum1 = 'c114';
              break;
            }
            case 115: {
              enum1 = 'c115';
              break;
            }
            case 116: {
              enum1 = 'c116';
              break;
            }
            case 117: {
              enum1 = 'c117';
              break;
            }
            case 118: {
              enum1 = 'c118';
              break;
            }
            case 119: {
              enum1 = 'c119';
              break;
            }
            case 120: {
              enum1 = 'c120';
              break;
            }
            case 121: {
              enum1 = 'c121';
              break;
            }
            case 122: {
              enum1 = 'c122';
              break;
            }
            case 123: {
              enum1 = 'c123';
              break;
            }
            case 124: {
              enum1 = 'c124';
              break;
            }
            case 125: {
              enum1 = 'c125';
              break;
            }
            case 126: {
              enum1 = 'c126';
              break;
            }
            case 127: {
              enum1 = 'c127';
              break;
            }
            case 128: {
              enum1 = 'c128';
              break;
            }
            case 129: {
              enum1 = 'c129';
              break;
            }
            case 130: {
              enum1 = 'c130';
              break;
            }
            case 131: {
              enum1 = 'c131';
              break;
            }
            case 132: {
              enum1 = 'c132';
              break;
            }
            case 133: {
              enum1 = 'c133';
              break;
            }
            case 134: {
              enum1 = 'c134';
              break;
            }
            case 135: {
              enum1 = 'c135';
              break;
            }
            case 136: {
              enum1 = 'c136';
              break;
            }
            case 137: {
              enum1 = 'c137';
              break;
            }
            case 138: {
              enum1 = 'c138';
              break;
            }
            case 139: {
              enum1 = 'c139';
              break;
            }
            case 140: {
              enum1 = 'c140';
              break;
            }
            case 141: {
              enum1 = 'c141';
              break;
            }
            case 142: {
              enum1 = 'c142';
              break;
            }
            case 143: {
              enum1 = 'c143';
              break;
            }
            case 144: {
              enum1 = 'c144';
              break;
            }
            case 145: {
              enum1 = 'c145';
              break;
            }
            case 146: {
              enum1 = 'c146';
              break;
            }
            case 147: {
              enum1 = 'c147';
              break;
            }
            case 148: {
              enum1 = 'c148';
              break;
            }
            case 149: {
              enum1 = 'c149';
              break;
            }
            case 150: {
              enum1 = 'c150';
              break;
            }
            case 151: {
              enum1 = 'c151';
              break;
            }
            case 152: {
              enum1 = 'c152';
              break;
            }
            case 153: {
              enum1 = 'c153';
              break;
            }
            case 154: {
              enum1 = 'c154';
              break;
            }
            case 155: {
              enum1 = 'c155';
              break;
            }
            case 156: {
              enum1 = 'c156';
              break;
            }
            case 157: {
              enum1 = 'c157';
              break;
            }
            case 158: {
              enum1 = 'c158';
              break;
            }
            case 159: {
              enum1 = 'c159';
              break;
            }
            case 160: {
              enum1 = 'c160';
              break;
            }
            case 161: {
              enum1 = 'c161';
              break;
            }
            case 162: {
              enum1 = 'c162';
              break;
            }
            case 163: {
              enum1 = 'c163';
              break;
            }
            case 164: {
              enum1 = 'c164';
              break;
            }
            case 165: {
              enum1 = 'c165';
              break;
            }
            case 166: {
              enum1 = 'c166';
              break;
            }
            case 167: {
              enum1 = 'c167';
              break;
            }
            case 168: {
              enum1 = 'c168';
              break;
            }
            case 169: {
              enum1 = 'c169';
              break;
            }
            case 170: {
              enum1 = 'c170';
              break;
            }
            case 171: {
              enum1 = 'c171';
              break;
            }
            case 172: {
              enum1 = 'c172';
              break;
            }
            case 173: {
              enum1 = 'c173';
              break;
            }
            case 174: {
              enum1 = 'c174';
              break;
            }
            case 175: {
              enum1 = 'c175';
              break;
            }
            case 176: {
              enum1 = 'c176';
              break;
            }
            case 177: {
              enum1 = 'c177';
              break;
            }
            case 178: {
              enum1 = 'c178';
              break;
            }
            case 179: {
              enum1 = 'c179';
              break;
            }
            case 180: {
              enum1 = 'c180';
              break;
            }
            case 181: {
              enum1 = 'c181';
              break;
            }
            case 182: {
              enum1 = 'c182';
              break;
            }
            case 183: {
              enum1 = 'c183';
              break;
            }
            case 184: {
              enum1 = 'c184';
              break;
            }
            case 185: {
              enum1 = 'c185';
              break;
            }
            case 186: {
              enum1 = 'c186';
              break;
            }
            case 187: {
              enum1 = 'c187';
              break;
            }
            case 188: {
              enum1 = 'c188';
              break;
            }
            case 189: {
              enum1 = 'c189';
              break;
            }
            case 190: {
              enum1 = 'c190';
              break;
            }
            case 191: {
              enum1 = 'c191';
              break;
            }
            case 192: {
              enum1 = 'c192';
              break;
            }
            case 193: {
              enum1 = 'c193';
              break;
            }
            case 194: {
              enum1 = 'c194';
              break;
            }
            case 195: {
              enum1 = 'c195';
              break;
            }
            case 196: {
              enum1 = 'c196';
              break;
            }
            case 197: {
              enum1 = 'c197';
              break;
            }
            case 198: {
              enum1 = 'c198';
              break;
            }
            case 199: {
              enum1 = 'c199';
              break;
            }
            case 200: {
              enum1 = 'c200';
              break;
            }
            case 201: {
              enum1 = 'c201';
              break;
            }
            case 202: {
              enum1 = 'c202';
              break;
            }
            case 203: {
              enum1 = 'c203';
              break;
            }
            case 204: {
              enum1 = 'c204';
              break;
            }
            case 205: {
              enum1 = 'c205';
              break;
            }
            case 206: {
              enum1 = 'c206';
              break;
            }
            case 207: {
              enum1 = 'c207';
              break;
            }
            case 208: {
              enum1 = 'c208';
              break;
            }
            case 209: {
              enum1 = 'c209';
              break;
            }
            case 210: {
              enum1 = 'c210';
              break;
            }
            case 211: {
              enum1 = 'c211';
              break;
            }
            case 212: {
              enum1 = 'c212';
              break;
            }
            case 213: {
              enum1 = 'c213';
              break;
            }
            case 214: {
              enum1 = 'c214';
              break;
            }
            case 215: {
              enum1 = 'c215';
              break;
            }
            case 216: {
              enum1 = 'c216';
              break;
            }
            case 217: {
              enum1 = 'c217';
              break;
            }
            case 218: {
              enum1 = 'c218';
              break;
            }
            case 219: {
              enum1 = 'c219';
              break;
            }
            case 220: {
              enum1 = 'c220';
              break;
            }
            case 221: {
              enum1 = 'c221';
              break;
            }
            case 222: {
              enum1 = 'c222';
              break;
            }
            case 223: {
              enum1 = 'c223';
              break;
            }
            case 224: {
              enum1 = 'c224';
              break;
            }
            case 225: {
              enum1 = 'c225';
              break;
            }
            case 226: {
              enum1 = 'c226';
              break;
            }
            case 227: {
              enum1 = 'c227';
              break;
            }
            case 228: {
              enum1 = 'c228';
              break;
            }
            case 229: {
              enum1 = 'c229';
              break;
            }
            case 230: {
              enum1 = 'c230';
              break;
            }
            case 231: {
              enum1 = 'c231';
              break;
            }
            case 232: {
              enum1 = 'c232';
              break;
            }
            case 233: {
              enum1 = 'c233';
              break;
            }
            case 234: {
              enum1 = 'c234';
              break;
            }
            case 235: {
              enum1 = 'c235';
              break;
            }
            case 236: {
              enum1 = 'c236';
              break;
            }
            case 237: {
              enum1 = 'c237';
              break;
            }
            case 238: {
              enum1 = 'c238';
              break;
            }
            case 239: {
              enum1 = 'c239';
              break;
            }
            case 240: {
              enum1 = 'c240';
              break;
            }
            case 241: {
              enum1 = 'c241';
              break;
            }
            case 242: {
              enum1 = 'c242';
              break;
            }
            case 243: {
              enum1 = 'c243';
              break;
            }
            case 244: {
              enum1 = 'c244';
              break;
            }
            case 245: {
              enum1 = 'c245';
              break;
            }
            case 246: {
              enum1 = 'c246';
              break;
            }
            case 247: {
              enum1 = 'c247';
              break;
            }
            case 248: {
              enum1 = 'c248';
              break;
            }
            case 249: {
              enum1 = 'c249';
              break;
            }
            case 250: {
              enum1 = 'c250';
              break;
            }
            case 251: {
              enum1 = 'c251';
              break;
            }
            case 252: {
              enum1 = 'c252';
              break;
            }
            case 253: {
              enum1 = 'c253';
              break;
            }
            case 254: {
              enum1 = 'c254';
              break;
            }
            case 255: {
              enum1 = 'c255';
              break;
            }
            default: {
              throw new TypeError('invalid discriminant specified for Enum256');
            }
          }
          _debugLog('[iface="enum-256", function="enum-256"][Instruction::Return]', {
            funcName: 'enum-256',
            paramCount: 1,
            async: false,
            postReturn: false
          });
          task.resolve([enum1]);
          task.exit();
          return enum1;
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  let exports1Enum257;
  
  function enum257(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1Enum257',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (null!== null) {
      task.setReturnMemoryIdx(null);
      task.setReturnMemory((() => null)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          var val0 = arg0;
          let enum0;
          switch (val0) {
            case 'c0': {
              enum0 = 0;
              break;
            }
            case 'c1': {
              enum0 = 1;
              break;
            }
            case 'c2': {
              enum0 = 2;
              break;
            }
            case 'c3': {
              enum0 = 3;
              break;
            }
            case 'c4': {
              enum0 = 4;
              break;
            }
            case 'c5': {
              enum0 = 5;
              break;
            }
            case 'c6': {
              enum0 = 6;
              break;
            }
            case 'c7': {
              enum0 = 7;
              break;
            }
            case 'c8': {
              enum0 = 8;
              break;
            }
            case 'c9': {
              enum0 = 9;
              break;
            }
            case 'c10': {
              enum0 = 10;
              break;
            }
            case 'c11': {
              enum0 = 11;
              break;
            }
            case 'c12': {
              enum0 = 12;
              break;
            }
            case 'c13': {
              enum0 = 13;
              break;
            }
            case 'c14': {
              enum0 = 14;
              break;
            }
            case 'c15': {
              enum0 = 15;
              break;
            }
            case 'c16': {
              enum0 = 16;
              break;
            }
            case 'c17': {
              enum0 = 17;
              break;
            }
            case 'c18': {
              enum0 = 18;
              break;
            }
            case 'c19': {
              enum0 = 19;
              break;
            }
            case 'c20': {
              enum0 = 20;
              break;
            }
            case 'c21': {
              enum0 = 21;
              break;
            }
            case 'c22': {
              enum0 = 22;
              break;
            }
            case 'c23': {
              enum0 = 23;
              break;
            }
            case 'c24': {
              enum0 = 24;
              break;
            }
            case 'c25': {
              enum0 = 25;
              break;
            }
            case 'c26': {
              enum0 = 26;
              break;
            }
            case 'c27': {
              enum0 = 27;
              break;
            }
            case 'c28': {
              enum0 = 28;
              break;
            }
            case 'c29': {
              enum0 = 29;
              break;
            }
            case 'c30': {
              enum0 = 30;
              break;
            }
            case 'c31': {
              enum0 = 31;
              break;
            }
            case 'c32': {
              enum0 = 32;
              break;
            }
            case 'c33': {
              enum0 = 33;
              break;
            }
            case 'c34': {
              enum0 = 34;
              break;
            }
            case 'c35': {
              enum0 = 35;
              break;
            }
            case 'c36': {
              enum0 = 36;
              break;
            }
            case 'c37': {
              enum0 = 37;
              break;
            }
            case 'c38': {
              enum0 = 38;
              break;
            }
            case 'c39': {
              enum0 = 39;
              break;
            }
            case 'c40': {
              enum0 = 40;
              break;
            }
            case 'c41': {
              enum0 = 41;
              break;
            }
            case 'c42': {
              enum0 = 42;
              break;
            }
            case 'c43': {
              enum0 = 43;
              break;
            }
            case 'c44': {
              enum0 = 44;
              break;
            }
            case 'c45': {
              enum0 = 45;
              break;
            }
            case 'c46': {
              enum0 = 46;
              break;
            }
            case 'c47': {
              enum0 = 47;
              break;
            }
            case 'c48': {
              enum0 = 48;
              break;
            }
            case 'c49': {
              enum0 = 49;
              break;
            }
            case 'c50': {
              enum0 = 50;
              break;
            }
            case 'c51': {
              enum0 = 51;
              break;
            }
            case 'c52': {
              enum0 = 52;
              break;
            }
            case 'c53': {
              enum0 = 53;
              break;
            }
            case 'c54': {
              enum0 = 54;
              break;
            }
            case 'c55': {
              enum0 = 55;
              break;
            }
            case 'c56': {
              enum0 = 56;
              break;
            }
            case 'c57': {
              enum0 = 57;
              break;
            }
            case 'c58': {
              enum0 = 58;
              break;
            }
            case 'c59': {
              enum0 = 59;
              break;
            }
            case 'c60': {
              enum0 = 60;
              break;
            }
            case 'c61': {
              enum0 = 61;
              break;
            }
            case 'c62': {
              enum0 = 62;
              break;
            }
            case 'c63': {
              enum0 = 63;
              break;
            }
            case 'c64': {
              enum0 = 64;
              break;
            }
            case 'c65': {
              enum0 = 65;
              break;
            }
            case 'c66': {
              enum0 = 66;
              break;
            }
            case 'c67': {
              enum0 = 67;
              break;
            }
            case 'c68': {
              enum0 = 68;
              break;
            }
            case 'c69': {
              enum0 = 69;
              break;
            }
            case 'c70': {
              enum0 = 70;
              break;
            }
            case 'c71': {
              enum0 = 71;
              break;
            }
            case 'c72': {
              enum0 = 72;
              break;
            }
            case 'c73': {
              enum0 = 73;
              break;
            }
            case 'c74': {
              enum0 = 74;
              break;
            }
            case 'c75': {
              enum0 = 75;
              break;
            }
            case 'c76': {
              enum0 = 76;
              break;
            }
            case 'c77': {
              enum0 = 77;
              break;
            }
            case 'c78': {
              enum0 = 78;
              break;
            }
            case 'c79': {
              enum0 = 79;
              break;
            }
            case 'c80': {
              enum0 = 80;
              break;
            }
            case 'c81': {
              enum0 = 81;
              break;
            }
            case 'c82': {
              enum0 = 82;
              break;
            }
            case 'c83': {
              enum0 = 83;
              break;
            }
            case 'c84': {
              enum0 = 84;
              break;
            }
            case 'c85': {
              enum0 = 85;
              break;
            }
            case 'c86': {
              enum0 = 86;
              break;
            }
            case 'c87': {
              enum0 = 87;
              break;
            }
            case 'c88': {
              enum0 = 88;
              break;
            }
            case 'c89': {
              enum0 = 89;
              break;
            }
            case 'c90': {
              enum0 = 90;
              break;
            }
            case 'c91': {
              enum0 = 91;
              break;
            }
            case 'c92': {
              enum0 = 92;
              break;
            }
            case 'c93': {
              enum0 = 93;
              break;
            }
            case 'c94': {
              enum0 = 94;
              break;
            }
            case 'c95': {
              enum0 = 95;
              break;
            }
            case 'c96': {
              enum0 = 96;
              break;
            }
            case 'c97': {
              enum0 = 97;
              break;
            }
            case 'c98': {
              enum0 = 98;
              break;
            }
            case 'c99': {
              enum0 = 99;
              break;
            }
            case 'c100': {
              enum0 = 100;
              break;
            }
            case 'c101': {
              enum0 = 101;
              break;
            }
            case 'c102': {
              enum0 = 102;
              break;
            }
            case 'c103': {
              enum0 = 103;
              break;
            }
            case 'c104': {
              enum0 = 104;
              break;
            }
            case 'c105': {
              enum0 = 105;
              break;
            }
            case 'c106': {
              enum0 = 106;
              break;
            }
            case 'c107': {
              enum0 = 107;
              break;
            }
            case 'c108': {
              enum0 = 108;
              break;
            }
            case 'c109': {
              enum0 = 109;
              break;
            }
            case 'c110': {
              enum0 = 110;
              break;
            }
            case 'c111': {
              enum0 = 111;
              break;
            }
            case 'c112': {
              enum0 = 112;
              break;
            }
            case 'c113': {
              enum0 = 113;
              break;
            }
            case 'c114': {
              enum0 = 114;
              break;
            }
            case 'c115': {
              enum0 = 115;
              break;
            }
            case 'c116': {
              enum0 = 116;
              break;
            }
            case 'c117': {
              enum0 = 117;
              break;
            }
            case 'c118': {
              enum0 = 118;
              break;
            }
            case 'c119': {
              enum0 = 119;
              break;
            }
            case 'c120': {
              enum0 = 120;
              break;
            }
            case 'c121': {
              enum0 = 121;
              break;
            }
            case 'c122': {
              enum0 = 122;
              break;
            }
            case 'c123': {
              enum0 = 123;
              break;
            }
            case 'c124': {
              enum0 = 124;
              break;
            }
            case 'c125': {
              enum0 = 125;
              break;
            }
            case 'c126': {
              enum0 = 126;
              break;
            }
            case 'c127': {
              enum0 = 127;
              break;
            }
            case 'c128': {
              enum0 = 128;
              break;
            }
            case 'c129': {
              enum0 = 129;
              break;
            }
            case 'c130': {
              enum0 = 130;
              break;
            }
            case 'c131': {
              enum0 = 131;
              break;
            }
            case 'c132': {
              enum0 = 132;
              break;
            }
            case 'c133': {
              enum0 = 133;
              break;
            }
            case 'c134': {
              enum0 = 134;
              break;
            }
            case 'c135': {
              enum0 = 135;
              break;
            }
            case 'c136': {
              enum0 = 136;
              break;
            }
            case 'c137': {
              enum0 = 137;
              break;
            }
            case 'c138': {
              enum0 = 138;
              break;
            }
            case 'c139': {
              enum0 = 139;
              break;
            }
            case 'c140': {
              enum0 = 140;
              break;
            }
            case 'c141': {
              enum0 = 141;
              break;
            }
            case 'c142': {
              enum0 = 142;
              break;
            }
            case 'c143': {
              enum0 = 143;
              break;
            }
            case 'c144': {
              enum0 = 144;
              break;
            }
            case 'c145': {
              enum0 = 145;
              break;
            }
            case 'c146': {
              enum0 = 146;
              break;
            }
            case 'c147': {
              enum0 = 147;
              break;
            }
            case 'c148': {
              enum0 = 148;
              break;
            }
            case 'c149': {
              enum0 = 149;
              break;
            }
            case 'c150': {
              enum0 = 150;
              break;
            }
            case 'c151': {
              enum0 = 151;
              break;
            }
            case 'c152': {
              enum0 = 152;
              break;
            }
            case 'c153': {
              enum0 = 153;
              break;
            }
            case 'c154': {
              enum0 = 154;
              break;
            }
            case 'c155': {
              enum0 = 155;
              break;
            }
            case 'c156': {
              enum0 = 156;
              break;
            }
            case 'c157': {
              enum0 = 157;
              break;
            }
            case 'c158': {
              enum0 = 158;
              break;
            }
            case 'c159': {
              enum0 = 159;
              break;
            }
            case 'c160': {
              enum0 = 160;
              break;
            }
            case 'c161': {
              enum0 = 161;
              break;
            }
            case 'c162': {
              enum0 = 162;
              break;
            }
            case 'c163': {
              enum0 = 163;
              break;
            }
            case 'c164': {
              enum0 = 164;
              break;
            }
            case 'c165': {
              enum0 = 165;
              break;
            }
            case 'c166': {
              enum0 = 166;
              break;
            }
            case 'c167': {
              enum0 = 167;
              break;
            }
            case 'c168': {
              enum0 = 168;
              break;
            }
            case 'c169': {
              enum0 = 169;
              break;
            }
            case 'c170': {
              enum0 = 170;
              break;
            }
            case 'c171': {
              enum0 = 171;
              break;
            }
            case 'c172': {
              enum0 = 172;
              break;
            }
            case 'c173': {
              enum0 = 173;
              break;
            }
            case 'c174': {
              enum0 = 174;
              break;
            }
            case 'c175': {
              enum0 = 175;
              break;
            }
            case 'c176': {
              enum0 = 176;
              break;
            }
            case 'c177': {
              enum0 = 177;
              break;
            }
            case 'c178': {
              enum0 = 178;
              break;
            }
            case 'c179': {
              enum0 = 179;
              break;
            }
            case 'c180': {
              enum0 = 180;
              break;
            }
            case 'c181': {
              enum0 = 181;
              break;
            }
            case 'c182': {
              enum0 = 182;
              break;
            }
            case 'c183': {
              enum0 = 183;
              break;
            }
            case 'c184': {
              enum0 = 184;
              break;
            }
            case 'c185': {
              enum0 = 185;
              break;
            }
            case 'c186': {
              enum0 = 186;
              break;
            }
            case 'c187': {
              enum0 = 187;
              break;
            }
            case 'c188': {
              enum0 = 188;
              break;
            }
            case 'c189': {
              enum0 = 189;
              break;
            }
            case 'c190': {
              enum0 = 190;
              break;
            }
            case 'c191': {
              enum0 = 191;
              break;
            }
            case 'c192': {
              enum0 = 192;
              break;
            }
            case 'c193': {
              enum0 = 193;
              break;
            }
            case 'c194': {
              enum0 = 194;
              break;
            }
            case 'c195': {
              enum0 = 195;
              break;
            }
            case 'c196': {
              enum0 = 196;
              break;
            }
            case 'c197': {
              enum0 = 197;
              break;
            }
            case 'c198': {
              enum0 = 198;
              break;
            }
            case 'c199': {
              enum0 = 199;
              break;
            }
            case 'c200': {
              enum0 = 200;
              break;
            }
            case 'c201': {
              enum0 = 201;
              break;
            }
            case 'c202': {
              enum0 = 202;
              break;
            }
            case 'c203': {
              enum0 = 203;
              break;
            }
            case 'c204': {
              enum0 = 204;
              break;
            }
            case 'c205': {
              enum0 = 205;
              break;
            }
            case 'c206': {
              enum0 = 206;
              break;
            }
            case 'c207': {
              enum0 = 207;
              break;
            }
            case 'c208': {
              enum0 = 208;
              break;
            }
            case 'c209': {
              enum0 = 209;
              break;
            }
            case 'c210': {
              enum0 = 210;
              break;
            }
            case 'c211': {
              enum0 = 211;
              break;
            }
            case 'c212': {
              enum0 = 212;
              break;
            }
            case 'c213': {
              enum0 = 213;
              break;
            }
            case 'c214': {
              enum0 = 214;
              break;
            }
            case 'c215': {
              enum0 = 215;
              break;
            }
            case 'c216': {
              enum0 = 216;
              break;
            }
            case 'c217': {
              enum0 = 217;
              break;
            }
            case 'c218': {
              enum0 = 218;
              break;
            }
            case 'c219': {
              enum0 = 219;
              break;
            }
            case 'c220': {
              enum0 = 220;
              break;
            }
            case 'c221': {
              enum0 = 221;
              break;
            }
            case 'c222': {
              enum0 = 222;
              break;
            }
            case 'c223': {
              enum0 = 223;
              break;
            }
            case 'c224': {
              enum0 = 224;
              break;
            }
            case 'c225': {
              enum0 = 225;
              break;
            }
            case 'c226': {
              enum0 = 226;
              break;
            }
            case 'c227': {
              enum0 = 227;
              break;
            }
            case 'c228': {
              enum0 = 228;
              break;
            }
            case 'c229': {
              enum0 = 229;
              break;
            }
            case 'c230': {
              enum0 = 230;
              break;
            }
            case 'c231': {
              enum0 = 231;
              break;
            }
            case 'c232': {
              enum0 = 232;
              break;
            }
            case 'c233': {
              enum0 = 233;
              break;
            }
            case 'c234': {
              enum0 = 234;
              break;
            }
            case 'c235': {
              enum0 = 235;
              break;
            }
            case 'c236': {
              enum0 = 236;
              break;
            }
            case 'c237': {
              enum0 = 237;
              break;
            }
            case 'c238': {
              enum0 = 238;
              break;
            }
            case 'c239': {
              enum0 = 239;
              break;
            }
            case 'c240': {
              enum0 = 240;
              break;
            }
            case 'c241': {
              enum0 = 241;
              break;
            }
            case 'c242': {
              enum0 = 242;
              break;
            }
            case 'c243': {
              enum0 = 243;
              break;
            }
            case 'c244': {
              enum0 = 244;
              break;
            }
            case 'c245': {
              enum0 = 245;
              break;
            }
            case 'c246': {
              enum0 = 246;
              break;
            }
            case 'c247': {
              enum0 = 247;
              break;
            }
            case 'c248': {
              enum0 = 248;
              break;
            }
            case 'c249': {
              enum0 = 249;
              break;
            }
            case 'c250': {
              enum0 = 250;
              break;
            }
            case 'c251': {
              enum0 = 251;
              break;
            }
            case 'c252': {
              enum0 = 252;
              break;
            }
            case 'c253': {
              enum0 = 253;
              break;
            }
            case 'c254': {
              enum0 = 254;
              break;
            }
            case 'c255': {
              enum0 = 255;
              break;
            }
            case 'c256': {
              enum0 = 256;
              break;
            }
            default: {
              if ((arg0) instanceof Error) {
                console.error(arg0);
              }
              
              throw new TypeError(`"${val0}" is not one of the cases of enum-257`);
            }
          }
          _debugLog('[iface="enum-257", function="enum-257"][Instruction::CallWasm] enter', {
            funcName: 'enum-257',
            paramCount: 1,
            async: false,
            postReturn: false,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1Enum257(enum0),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          let enum1;
          switch (ret) {
            case 0: {
              enum1 = 'c0';
              break;
            }
            case 1: {
              enum1 = 'c1';
              break;
            }
            case 2: {
              enum1 = 'c2';
              break;
            }
            case 3: {
              enum1 = 'c3';
              break;
            }
            case 4: {
              enum1 = 'c4';
              break;
            }
            case 5: {
              enum1 = 'c5';
              break;
            }
            case 6: {
              enum1 = 'c6';
              break;
            }
            case 7: {
              enum1 = 'c7';
              break;
            }
            case 8: {
              enum1 = 'c8';
              break;
            }
            case 9: {
              enum1 = 'c9';
              break;
            }
            case 10: {
              enum1 = 'c10';
              break;
            }
            case 11: {
              enum1 = 'c11';
              break;
            }
            case 12: {
              enum1 = 'c12';
              break;
            }
            case 13: {
              enum1 = 'c13';
              break;
            }
            case 14: {
              enum1 = 'c14';
              break;
            }
            case 15: {
              enum1 = 'c15';
              break;
            }
            case 16: {
              enum1 = 'c16';
              break;
            }
            case 17: {
              enum1 = 'c17';
              break;
            }
            case 18: {
              enum1 = 'c18';
              break;
            }
            case 19: {
              enum1 = 'c19';
              break;
            }
            case 20: {
              enum1 = 'c20';
              break;
            }
            case 21: {
              enum1 = 'c21';
              break;
            }
            case 22: {
              enum1 = 'c22';
              break;
            }
            case 23: {
              enum1 = 'c23';
              break;
            }
            case 24: {
              enum1 = 'c24';
              break;
            }
            case 25: {
              enum1 = 'c25';
              break;
            }
            case 26: {
              enum1 = 'c26';
              break;
            }
            case 27: {
              enum1 = 'c27';
              break;
            }
            case 28: {
              enum1 = 'c28';
              break;
            }
            case 29: {
              enum1 = 'c29';
              break;
            }
            case 30: {
              enum1 = 'c30';
              break;
            }
            case 31: {
              enum1 = 'c31';
              break;
            }
            case 32: {
              enum1 = 'c32';
              break;
            }
            case 33: {
              enum1 = 'c33';
              break;
            }
            case 34: {
              enum1 = 'c34';
              break;
            }
            case 35: {
              enum1 = 'c35';
              break;
            }
            case 36: {
              enum1 = 'c36';
              break;
            }
            case 37: {
              enum1 = 'c37';
              break;
            }
            case 38: {
              enum1 = 'c38';
              break;
            }
            case 39: {
              enum1 = 'c39';
              break;
            }
            case 40: {
              enum1 = 'c40';
              break;
            }
            case 41: {
              enum1 = 'c41';
              break;
            }
            case 42: {
              enum1 = 'c42';
              break;
            }
            case 43: {
              enum1 = 'c43';
              break;
            }
            case 44: {
              enum1 = 'c44';
              break;
            }
            case 45: {
              enum1 = 'c45';
              break;
            }
            case 46: {
              enum1 = 'c46';
              break;
            }
            case 47: {
              enum1 = 'c47';
              break;
            }
            case 48: {
              enum1 = 'c48';
              break;
            }
            case 49: {
              enum1 = 'c49';
              break;
            }
            case 50: {
              enum1 = 'c50';
              break;
            }
            case 51: {
              enum1 = 'c51';
              break;
            }
            case 52: {
              enum1 = 'c52';
              break;
            }
            case 53: {
              enum1 = 'c53';
              break;
            }
            case 54: {
              enum1 = 'c54';
              break;
            }
            case 55: {
              enum1 = 'c55';
              break;
            }
            case 56: {
              enum1 = 'c56';
              break;
            }
            case 57: {
              enum1 = 'c57';
              break;
            }
            case 58: {
              enum1 = 'c58';
              break;
            }
            case 59: {
              enum1 = 'c59';
              break;
            }
            case 60: {
              enum1 = 'c60';
              break;
            }
            case 61: {
              enum1 = 'c61';
              break;
            }
            case 62: {
              enum1 = 'c62';
              break;
            }
            case 63: {
              enum1 = 'c63';
              break;
            }
            case 64: {
              enum1 = 'c64';
              break;
            }
            case 65: {
              enum1 = 'c65';
              break;
            }
            case 66: {
              enum1 = 'c66';
              break;
            }
            case 67: {
              enum1 = 'c67';
              break;
            }
            case 68: {
              enum1 = 'c68';
              break;
            }
            case 69: {
              enum1 = 'c69';
              break;
            }
            case 70: {
              enum1 = 'c70';
              break;
            }
            case 71: {
              enum1 = 'c71';
              break;
            }
            case 72: {
              enum1 = 'c72';
              break;
            }
            case 73: {
              enum1 = 'c73';
              break;
            }
            case 74: {
              enum1 = 'c74';
              break;
            }
            case 75: {
              enum1 = 'c75';
              break;
            }
            case 76: {
              enum1 = 'c76';
              break;
            }
            case 77: {
              enum1 = 'c77';
              break;
            }
            case 78: {
              enum1 = 'c78';
              break;
            }
            case 79: {
              enum1 = 'c79';
              break;
            }
            case 80: {
              enum1 = 'c80';
              break;
            }
            case 81: {
              enum1 = 'c81';
              break;
            }
            case 82: {
              enum1 = 'c82';
              break;
            }
            case 83: {
              enum1 = 'c83';
              break;
            }
            case 84: {
              enum1 = 'c84';
              break;
            }
            case 85: {
              enum1 = 'c85';
              break;
            }
            case 86: {
              enum1 = 'c86';
              break;
            }
            case 87: {
              enum1 = 'c87';
              break;
            }
            case 88: {
              enum1 = 'c88';
              break;
            }
            case 89: {
              enum1 = 'c89';
              break;
            }
            case 90: {
              enum1 = 'c90';
              break;
            }
            case 91: {
              enum1 = 'c91';
              break;
            }
            case 92: {
              enum1 = 'c92';
              break;
            }
            case 93: {
              enum1 = 'c93';
              break;
            }
            case 94: {
              enum1 = 'c94';
              break;
            }
            case 95: {
              enum1 = 'c95';
              break;
            }
            case 96: {
              enum1 = 'c96';
              break;
            }
            case 97: {
              enum1 = 'c97';
              break;
            }
            case 98: {
              enum1 = 'c98';
              break;
            }
            case 99: {
              enum1 = 'c99';
              break;
            }
            case 100: {
              enum1 = 'c100';
              break;
            }
            case 101: {
              enum1 = 'c101';
              break;
            }
            case 102: {
              enum1 = 'c102';
              break;
            }
            case 103: {
              enum1 = 'c103';
              break;
            }
            case 104: {
              enum1 = 'c104';
              break;
            }
            case 105: {
              enum1 = 'c105';
              break;
            }
            case 106: {
              enum1 = 'c106';
              break;
            }
            case 107: {
              enum1 = 'c107';
              break;
            }
            case 108: {
              enum1 = 'c108';
              break;
            }
            case 109: {
              enum1 = 'c109';
              break;
            }
            case 110: {
              enum1 = 'c110';
              break;
            }
            case 111: {
              enum1 = 'c111';
              break;
            }
            case 112: {
              enum1 = 'c112';
              break;
            }
            case 113: {
              enum1 = 'c113';
              break;
            }
            case 114: {
              enum1 = 'c114';
              break;
            }
            case 115: {
              enum1 = 'c115';
              break;
            }
            case 116: {
              enum1 = 'c116';
              break;
            }
            case 117: {
              enum1 = 'c117';
              break;
            }
            case 118: {
              enum1 = 'c118';
              break;
            }
            case 119: {
              enum1 = 'c119';
              break;
            }
            case 120: {
              enum1 = 'c120';
              break;
            }
            case 121: {
              enum1 = 'c121';
              break;
            }
            case 122: {
              enum1 = 'c122';
              break;
            }
            case 123: {
              enum1 = 'c123';
              break;
            }
            case 124: {
              enum1 = 'c124';
              break;
            }
            case 125: {
              enum1 = 'c125';
              break;
            }
            case 126: {
              enum1 = 'c126';
              break;
            }
            case 127: {
              enum1 = 'c127';
              break;
            }
            case 128: {
              enum1 = 'c128';
              break;
            }
            case 129: {
              enum1 = 'c129';
              break;
            }
            case 130: {
              enum1 = 'c130';
              break;
            }
            case 131: {
              enum1 = 'c131';
              break;
            }
            case 132: {
              enum1 = 'c132';
              break;
            }
            case 133: {
              enum1 = 'c133';
              break;
            }
            case 134: {
              enum1 = 'c134';
              break;
            }
            case 135: {
              enum1 = 'c135';
              break;
            }
            case 136: {
              enum1 = 'c136';
              break;
            }
            case 137: {
              enum1 = 'c137';
              break;
            }
            case 138: {
              enum1 = 'c138';
              break;
            }
            case 139: {
              enum1 = 'c139';
              break;
            }
            case 140: {
              enum1 = 'c140';
              break;
            }
            case 141: {
              enum1 = 'c141';
              break;
            }
            case 142: {
              enum1 = 'c142';
              break;
            }
            case 143: {
              enum1 = 'c143';
              break;
            }
            case 144: {
              enum1 = 'c144';
              break;
            }
            case 145: {
              enum1 = 'c145';
              break;
            }
            case 146: {
              enum1 = 'c146';
              break;
            }
            case 147: {
              enum1 = 'c147';
              break;
            }
            case 148: {
              enum1 = 'c148';
              break;
            }
            case 149: {
              enum1 = 'c149';
              break;
            }
            case 150: {
              enum1 = 'c150';
              break;
            }
            case 151: {
              enum1 = 'c151';
              break;
            }
            case 152: {
              enum1 = 'c152';
              break;
            }
            case 153: {
              enum1 = 'c153';
              break;
            }
            case 154: {
              enum1 = 'c154';
              break;
            }
            case 155: {
              enum1 = 'c155';
              break;
            }
            case 156: {
              enum1 = 'c156';
              break;
            }
            case 157: {
              enum1 = 'c157';
              break;
            }
            case 158: {
              enum1 = 'c158';
              break;
            }
            case 159: {
              enum1 = 'c159';
              break;
            }
            case 160: {
              enum1 = 'c160';
              break;
            }
            case 161: {
              enum1 = 'c161';
              break;
            }
            case 162: {
              enum1 = 'c162';
              break;
            }
            case 163: {
              enum1 = 'c163';
              break;
            }
            case 164: {
              enum1 = 'c164';
              break;
            }
            case 165: {
              enum1 = 'c165';
              break;
            }
            case 166: {
              enum1 = 'c166';
              break;
            }
            case 167: {
              enum1 = 'c167';
              break;
            }
            case 168: {
              enum1 = 'c168';
              break;
            }
            case 169: {
              enum1 = 'c169';
              break;
            }
            case 170: {
              enum1 = 'c170';
              break;
            }
            case 171: {
              enum1 = 'c171';
              break;
            }
            case 172: {
              enum1 = 'c172';
              break;
            }
            case 173: {
              enum1 = 'c173';
              break;
            }
            case 174: {
              enum1 = 'c174';
              break;
            }
            case 175: {
              enum1 = 'c175';
              break;
            }
            case 176: {
              enum1 = 'c176';
              break;
            }
            case 177: {
              enum1 = 'c177';
              break;
            }
            case 178: {
              enum1 = 'c178';
              break;
            }
            case 179: {
              enum1 = 'c179';
              break;
            }
            case 180: {
              enum1 = 'c180';
              break;
            }
            case 181: {
              enum1 = 'c181';
              break;
            }
            case 182: {
              enum1 = 'c182';
              break;
            }
            case 183: {
              enum1 = 'c183';
              break;
            }
            case 184: {
              enum1 = 'c184';
              break;
            }
            case 185: {
              enum1 = 'c185';
              break;
            }
            case 186: {
              enum1 = 'c186';
              break;
            }
            case 187: {
              enum1 = 'c187';
              break;
            }
            case 188: {
              enum1 = 'c188';
              break;
            }
            case 189: {
              enum1 = 'c189';
              break;
            }
            case 190: {
              enum1 = 'c190';
              break;
            }
            case 191: {
              enum1 = 'c191';
              break;
            }
            case 192: {
              enum1 = 'c192';
              break;
            }
            case 193: {
              enum1 = 'c193';
              break;
            }
            case 194: {
              enum1 = 'c194';
              break;
            }
            case 195: {
              enum1 = 'c195';
              break;
            }
            case 196: {
              enum1 = 'c196';
              break;
            }
            case 197: {
              enum1 = 'c197';
              break;
            }
            case 198: {
              enum1 = 'c198';
              break;
            }
            case 199: {
              enum1 = 'c199';
              break;
            }
            case 200: {
              enum1 = 'c200';
              break;
            }
            case 201: {
              enum1 = 'c201';
              break;
            }
            case 202: {
              enum1 = 'c202';
              break;
            }
            case 203: {
              enum1 = 'c203';
              break;
            }
            case 204: {
              enum1 = 'c204';
              break;
            }
            case 205: {
              enum1 = 'c205';
              break;
            }
            case 206: {
              enum1 = 'c206';
              break;
            }
            case 207: {
              enum1 = 'c207';
              break;
            }
            case 208: {
              enum1 = 'c208';
              break;
            }
            case 209: {
              enum1 = 'c209';
              break;
            }
            case 210: {
              enum1 = 'c210';
              break;
            }
            case 211: {
              enum1 = 'c211';
              break;
            }
            case 212: {
              enum1 = 'c212';
              break;
            }
            case 213: {
              enum1 = 'c213';
              break;
            }
            case 214: {
              enum1 = 'c214';
              break;
            }
            case 215: {
              enum1 = 'c215';
              break;
            }
            case 216: {
              enum1 = 'c216';
              break;
            }
            case 217: {
              enum1 = 'c217';
              break;
            }
            case 218: {
              enum1 = 'c218';
              break;
            }
            case 219: {
              enum1 = 'c219';
              break;
            }
            case 220: {
              enum1 = 'c220';
              break;
            }
            case 221: {
              enum1 = 'c221';
              break;
            }
            case 222: {
              enum1 = 'c222';
              break;
            }
            case 223: {
              enum1 = 'c223';
              break;
            }
            case 224: {
              enum1 = 'c224';
              break;
            }
            case 225: {
              enum1 = 'c225';
              break;
            }
            case 226: {
              enum1 = 'c226';
              break;
            }
            case 227: {
              enum1 = 'c227';
              break;
            }
            case 228: {
              enum1 = 'c228';
              break;
            }
            case 229: {
              enum1 = 'c229';
              break;
            }
            case 230: {
              enum1 = 'c230';
              break;
            }
            case 231: {
              enum1 = 'c231';
              break;
            }
            case 232: {
              enum1 = 'c232';
              break;
            }
            case 233: {
              enum1 = 'c233';
              break;
            }
            case 234: {
              enum1 = 'c234';
              break;
            }
            case 235: {
              enum1 = 'c235';
              break;
            }
            case 236: {
              enum1 = 'c236';
              break;
            }
            case 237: {
              enum1 = 'c237';
              break;
            }
            case 238: {
              enum1 = 'c238';
              break;
            }
            case 239: {
              enum1 = 'c239';
              break;
            }
            case 240: {
              enum1 = 'c240';
              break;
            }
            case 241: {
              enum1 = 'c241';
              break;
            }
            case 242: {
              enum1 = 'c242';
              break;
            }
            case 243: {
              enum1 = 'c243';
              break;
            }
            case 244: {
              enum1 = 'c244';
              break;
            }
            case 245: {
              enum1 = 'c245';
              break;
            }
            case 246: {
              enum1 = 'c246';
              break;
            }
            case 247: {
              enum1 = 'c247';
              break;
            }
            case 248: {
              enum1 = 'c248';
              break;
            }
            case 249: {
              enum1 = 'c249';
              break;
            }
            case 250: {
              enum1 = 'c250';
              break;
            }
            case 251: {
              enum1 = 'c251';
              break;
            }
            case 252: {
              enum1 = 'c252';
              break;
            }
            case 253: {
              enum1 = 'c253';
              break;
            }
            case 254: {
              enum1 = 'c254';
              break;
            }
            case 255: {
              enum1 = 'c255';
              break;
            }
            case 256: {
              enum1 = 'c256';
              break;
            }
            default: {
              throw new TypeError('invalid discriminant specified for Enum257');
            }
          }
          _debugLog('[iface="enum-257", function="enum-257"][Instruction::Return]', {
            funcName: 'enum-257',
            paramCount: 1,
            async: false,
            postReturn: false
          });
          task.resolve([enum1]);
          task.exit();
          return enum1;
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  let exports1EchoBool;
  
  function echoBool(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1EchoBool',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (null!== null) {
      task.setReturnMemoryIdx(null);
      task.setReturnMemory((() => null)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          _debugLog('[iface="echo-bool", function="echo-bool"][Instruction::CallWasm] enter', {
            funcName: 'echo-bool',
            paramCount: 1,
            async: false,
            postReturn: false,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1EchoBool(arg0 ? 1 : 0),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          var bool0 = ret;
          _debugLog('[iface="echo-bool", function="echo-bool"][Instruction::Return]', {
            funcName: 'echo-bool',
            paramCount: 1,
            async: false,
            postReturn: false
          });
          task.resolve([bool0 == 0 ? false : (bool0 == 1 ? true : throwInvalidBool())]);
          task.exit();
          return bool0 == 0 ? false : (bool0 == 1 ? true : throwInvalidBool());
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  
  function echoU8(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1EchoU8',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (null!== null) {
      task.setReturnMemoryIdx(null);
      task.setReturnMemory((() => null)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          _debugLog('[iface="echo-u8", function="echo-u8"][Instruction::CallWasm] enter', {
            funcName: 'echo-u8',
            paramCount: 1,
            async: false,
            postReturn: false,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1EchoU8(toUint8(arg0)),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          _debugLog('[iface="echo-u8", function="echo-u8"][Instruction::Return]', {
            funcName: 'echo-u8',
            paramCount: 1,
            async: false,
            postReturn: false
          });
          task.resolve([clampGuest(ret, 0, 255)]);
          task.exit();
          return clampGuest(ret, 0, 255);
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  let exports1EchoS8;
  
  function echoS8(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1EchoS8',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (null!== null) {
      task.setReturnMemoryIdx(null);
      task.setReturnMemory((() => null)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          _debugLog('[iface="echo-s8", function="echo-s8"][Instruction::CallWasm] enter', {
            funcName: 'echo-s8',
            paramCount: 1,
            async: false,
            postReturn: false,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1EchoS8(toInt8(arg0)),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          _debugLog('[iface="echo-s8", function="echo-s8"][Instruction::Return]', {
            funcName: 'echo-s8',
            paramCount: 1,
            async: false,
            postReturn: false
          });
          task.resolve([clampGuest(ret, -128, 127)]);
          task.exit();
          return clampGuest(ret, -128, 127);
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  let exports1EchoU16;
  
  function echoU16(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1EchoU16',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (null!== null) {
      task.setReturnMemoryIdx(null);
      task.setReturnMemory((() => null)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          _debugLog('[iface="echo-u16", function="echo-u16"][Instruction::CallWasm] enter', {
            funcName: 'echo-u16',
            paramCount: 1,
            async: false,
            postReturn: false,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1EchoU16(toUint16(arg0)),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          _debugLog('[iface="echo-u16", function="echo-u16"][Instruction::Return]', {
            funcName: 'echo-u16',
            paramCount: 1,
            async: false,
            postReturn: false
          });
          task.resolve([clampGuest(ret, 0, 65535)]);
          task.exit();
          return clampGuest(ret, 0, 65535);
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  let exports1EchoS16;
  
  function echoS16(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1EchoS16',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (null!== null) {
      task.setReturnMemoryIdx(null);
      task.setReturnMemory((() => null)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          _debugLog('[iface="echo-s16", function="echo-s16"][Instruction::CallWasm] enter', {
            funcName: 'echo-s16',
            paramCount: 1,
            async: false,
            postReturn: false,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1EchoS16(toInt16(arg0)),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          _debugLog('[iface="echo-s16", function="echo-s16"][Instruction::Return]', {
            funcName: 'echo-s16',
            paramCount: 1,
            async: false,
            postReturn: false
          });
          task.resolve([clampGuest(ret, -32768, 32767)]);
          task.exit();
          return clampGuest(ret, -32768, 32767);
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  let exports1EchoS32;
  
  function echoU32(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1EchoS32',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (null!== null) {
      task.setReturnMemoryIdx(null);
      task.setReturnMemory((() => null)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          _debugLog('[iface="echo-u32", function="echo-u32"][Instruction::CallWasm] enter', {
            funcName: 'echo-u32',
            paramCount: 1,
            async: false,
            postReturn: false,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1EchoS32(toUint32(arg0)),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          _debugLog('[iface="echo-u32", function="echo-u32"][Instruction::Return]', {
            funcName: 'echo-u32',
            paramCount: 1,
            async: false,
            postReturn: false
          });
          task.resolve([ret >>> 0]);
          task.exit();
          return ret >>> 0;
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  
  function echoS32(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1EchoS32',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (null!== null) {
      task.setReturnMemoryIdx(null);
      task.setReturnMemory((() => null)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          _debugLog('[iface="echo-s32", function="echo-s32"][Instruction::CallWasm] enter', {
            funcName: 'echo-s32',
            paramCount: 1,
            async: false,
            postReturn: false,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1EchoS32(toInt32(arg0)),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          _debugLog('[iface="echo-s32", function="echo-s32"][Instruction::Return]', {
            funcName: 'echo-s32',
            paramCount: 1,
            async: false,
            postReturn: false
          });
          task.resolve([ret]);
          task.exit();
          return ret;
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  let exports1EchoIdentifier;
  
  function echoU64(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1EchoIdentifier',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (null!== null) {
      task.setReturnMemoryIdx(null);
      task.setReturnMemory((() => null)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          _debugLog('[iface="echo-u64", function="echo-u64"][Instruction::CallWasm] enter', {
            funcName: 'echo-u64',
            paramCount: 1,
            async: false,
            postReturn: false,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1EchoIdentifier(toUint64(arg0)),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          _debugLog('[iface="echo-u64", function="echo-u64"][Instruction::Return]', {
            funcName: 'echo-u64',
            paramCount: 1,
            async: false,
            postReturn: false
          });
          task.resolve([BigInt.asUintN(64, BigInt(ret))]);
          task.exit();
          return BigInt.asUintN(64, BigInt(ret));
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  
  function echoS64(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1EchoIdentifier',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (null!== null) {
      task.setReturnMemoryIdx(null);
      task.setReturnMemory((() => null)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          _debugLog('[iface="echo-s64", function="echo-s64"][Instruction::CallWasm] enter', {
            funcName: 'echo-s64',
            paramCount: 1,
            async: false,
            postReturn: false,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1EchoIdentifier(toInt64(arg0)),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          _debugLog('[iface="echo-s64", function="echo-s64"][Instruction::Return]', {
            funcName: 'echo-s64',
            paramCount: 1,
            async: false,
            postReturn: false
          });
          task.resolve([ret]);
          task.exit();
          return ret;
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  let exports1EchoF32;
  
  function echoF32(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1EchoF32',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (null!== null) {
      task.setReturnMemoryIdx(null);
      task.setReturnMemory((() => null)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          _debugLog('[iface="echo-f32", function="echo-f32"][Instruction::CallWasm] enter', {
            funcName: 'echo-f32',
            paramCount: 1,
            async: false,
            postReturn: false,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1EchoF32(+arg0),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          _debugLog('[iface="echo-f32", function="echo-f32"][Instruction::Return]', {
            funcName: 'echo-f32',
            paramCount: 1,
            async: false,
            postReturn: false
          });
          task.resolve([ret]);
          task.exit();
          return ret;
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  let exports1EchoF64;
  
  function echoF64(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1EchoF64',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (null!== null) {
      task.setReturnMemoryIdx(null);
      task.setReturnMemory((() => null)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          _debugLog('[iface="echo-f64", function="echo-f64"][Instruction::CallWasm] enter', {
            funcName: 'echo-f64',
            paramCount: 1,
            async: false,
            postReturn: false,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1EchoF64(+arg0),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          _debugLog('[iface="echo-f64", function="echo-f64"][Instruction::Return]', {
            funcName: 'echo-f64',
            paramCount: 1,
            async: false,
            postReturn: false
          });
          task.resolve([ret]);
          task.exit();
          return ret;
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  let exports1CharCode;
  
  function echoChar(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1CharCode',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (null!== null) {
      task.setReturnMemoryIdx(null);
      task.setReturnMemory((() => null)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          _debugLog('[iface="echo-char", function="echo-char"][Instruction::CallWasm] enter', {
            funcName: 'echo-char',
            paramCount: 1,
            async: false,
            postReturn: false,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1CharCode(validateHostChar(arg0)),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          _debugLog('[iface="echo-char", function="echo-char"][Instruction::Return]', {
            funcName: 'echo-char',
            paramCount: 1,
            async: false,
            postReturn: false
          });
          task.resolve([validateGuestChar(ret)]);
          task.exit();
          return validateGuestChar(ret);
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  let exports1EchoString;
  
  function echoString(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1EchoString',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (0!== null) {
      task.setReturnMemoryIdx(0);
      task.setReturnMemory((() => memory0)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          
          var encodeRes = _utf8AllocateAndEncode(arg0, realloc0, memory0);
          var ptr0= encodeRes.ptr;
          var len0 = encodeRes.len;
          
          _debugLog('[iface="echo-string", function="echo-string"][Instruction::CallWasm] enter', {
            funcName: 'echo-string',
            paramCount: 2,
            async: false,
            postReturn: true,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1EchoString(ptr0, len0),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          var ptr1 = dataView(memory0).getUint32(((ret >>> 0)) + 0, true) >>> 0;
          var len1 = dataView(memory0).getUint32(((ret >>> 0)) + 4, true);
          var result1 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr1, len1));
          _debugLog('[iface="echo-string", function="echo-string"][Instruction::Return]', {
            funcName: 'echo-string',
            paramCount: 1,
            async: false,
            postReturn: true
          });
          task.resolve([result1]);
          const retCopy = result1;
          
          let cstate = getOrCreateAsyncState(0);
          cstate.mayLeave = false;
          postReturn0(ret);
          cstate.mayLeave = true;
          task.exit();
          return retCopy;
          
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  let exports1ListBool;
  
  function listBool(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1ListBool',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (0!== null) {
      task.setReturnMemoryIdx(0);
      task.setReturnMemory((() => memory0)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          var vec0 = arg0;
          var len0 = vec0.length;
          var result0 = realloc0(0, 0, 1, len0 * 1);
          if (result0 < 0 || len0 < 0 || len0 > 268435455 || result0 > memory0.buffer.byteLength || len0 > Math.floor((memory0.buffer.byteLength - result0) / 1)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
          for (let i = 0; i < vec0.length; i++) {
            const e = vec0[i];
            const base = result0 + i * 1;dataView(memory0).setInt8((base) + 0, e ? 1 : 0, true);
          }
          _debugLog('[iface="list-bool", function="list-bool"][Instruction::CallWasm] enter', {
            funcName: 'list-bool',
            paramCount: 2,
            async: false,
            postReturn: true,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1ListBool(result0, len0),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          var len2 = dataView(memory0).getUint32(((ret >>> 0)) + 4, true);
          var base2 = dataView(memory0).getUint32(((ret >>> 0)) + 0, true) >>> 0;
          if (base2 < 0 || len2 < 0 || len2 > 268435455 || base2 > memory0.buffer.byteLength || len2 > Math.floor((memory0.buffer.byteLength - base2) / 1)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
          if (base2 % 1 !== 0) throw new TypeError(`list pointer [${base2}] is not aligned to 1`);
          var result2 = [];
          for (let i = 0; i < len2; i++) {
            const base = base2 + i * 1;
            var bool1 = dataView(memory0).getUint8((base) + 0, true);
            result2.push(bool1 == 0 ? false : (bool1 == 1 ? true : throwInvalidBool()));
          }
          _debugLog('[iface="list-bool", function="list-bool"][Instruction::Return]', {
            funcName: 'list-bool',
            paramCount: 1,
            async: false,
            postReturn: true
          });
          task.resolve([result2]);
          const retCopy = result2;
          
          let cstate = getOrCreateAsyncState(0);
          cstate.mayLeave = false;
          postReturn0(ret);
          cstate.mayLeave = true;
          task.exit();
          return retCopy;
          
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  let exports1ListU8;
  
  function listU8(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1ListU8',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (0!== null) {
      task.setReturnMemoryIdx(0);
      task.setReturnMemory((() => memory0)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          var val0 = arg0;
          var len0 = Array.isArray(val0) ? val0.length : val0.byteLength;
          var ptr0 = realloc0(0, 0, 1, len0 * 1);
          
          let valData0;
          const valLenBytes0 = len0 * 1;
          if (Array.isArray(val0)) {
            // Regular array likely containing numbers, write values to memory
            let offset = 0;
            const dv0 = new DataView(memory0.buffer);
            for (const v of val0) {
              _requireValidNumericPrimitive.bind(null, 'u8')(v);
              dv0.setUint8(ptr0+ offset, v, true);
              offset += 1;
            }
          } else {
            // TypedArray / ArrayBuffer-like, direct copy
            valData0 = new Uint8Array(val0.buffer || val0, val0.byteOffset, valLenBytes0);
            const out0 = new Uint8Array(memory0.buffer, ptr0, valLenBytes0);
            out0.set(valData0);
          }
          
          _debugLog('[iface="list-u8", function="list-u8"][Instruction::CallWasm] enter', {
            funcName: 'list-u8',
            paramCount: 2,
            async: false,
            postReturn: true,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1ListU8(ptr0, len0),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          var ptr1 = dataView(memory0).getUint32(((ret >>> 0)) + 0, true) >>> 0;
          var len1 = dataView(memory0).getUint32(((ret >>> 0)) + 4, true);
          if (ptr1 < 0 || len1 < 0 || len1 > 268435455 || ptr1 > memory0.buffer.byteLength || len1 > Math.floor((memory0.buffer.byteLength - ptr1) / 1)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
          if (ptr1 % 1 !== 0) throw new TypeError(`list pointer [${ptr1}] is not aligned to 1`);
          var result1 = new Uint8Array(memory0.buffer.slice(ptr1, ptr1 + len1 * 1));
          _debugLog('[iface="list-u8", function="list-u8"][Instruction::Return]', {
            funcName: 'list-u8',
            paramCount: 1,
            async: false,
            postReturn: true
          });
          task.resolve([result1]);
          const retCopy = result1;
          
          let cstate = getOrCreateAsyncState(0);
          cstate.mayLeave = false;
          postReturn0(ret);
          cstate.mayLeave = true;
          task.exit();
          return retCopy;
          
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  let exports1ListS8;
  
  function listS8(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1ListS8',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (0!== null) {
      task.setReturnMemoryIdx(0);
      task.setReturnMemory((() => memory0)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          var val0 = arg0;
          var len0 = val0.length;
          var ptr0 = realloc0(0, 0, 1, len0 * 1);
          
          let valData0;
          const valLenBytes0 = len0 * 1;
          if (Array.isArray(val0)) {
            // Regular array likely containing numbers, write values to memory
            let offset = 0;
            const dv0 = new DataView(memory0.buffer);
            for (const v of val0) {
              _requireValidNumericPrimitive.bind(null, 's8')(v);
              dv0.setInt8(ptr0+ offset, v, true);
              offset += 1;
            }
          } else {
            // TypedArray / ArrayBuffer-like, direct copy
            valData0 = new Uint8Array(val0.buffer || val0, val0.byteOffset, valLenBytes0);
            const out0 = new Uint8Array(memory0.buffer, ptr0, valLenBytes0);
            out0.set(valData0);
          }
          
          _debugLog('[iface="list-s8", function="list-s8"][Instruction::CallWasm] enter', {
            funcName: 'list-s8',
            paramCount: 2,
            async: false,
            postReturn: true,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1ListS8(ptr0, len0),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          var ptr1 = dataView(memory0).getUint32(((ret >>> 0)) + 0, true) >>> 0;
          var len1 = dataView(memory0).getUint32(((ret >>> 0)) + 4, true);
          if (ptr1 < 0 || len1 < 0 || len1 > 268435455 || ptr1 > memory0.buffer.byteLength || len1 > Math.floor((memory0.buffer.byteLength - ptr1) / 1)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
          if (ptr1 % 1 !== 0) throw new TypeError(`list pointer [${ptr1}] is not aligned to 1`);
          var result1 = new Int8Array(memory0.buffer.slice(ptr1, ptr1 + len1 * 1));
          _debugLog('[iface="list-s8", function="list-s8"][Instruction::Return]', {
            funcName: 'list-s8',
            paramCount: 1,
            async: false,
            postReturn: true
          });
          task.resolve([result1]);
          const retCopy = result1;
          
          let cstate = getOrCreateAsyncState(0);
          cstate.mayLeave = false;
          postReturn0(ret);
          cstate.mayLeave = true;
          task.exit();
          return retCopy;
          
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  let exports1ListU16;
  
  function listU16(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1ListU16',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (0!== null) {
      task.setReturnMemoryIdx(0);
      task.setReturnMemory((() => memory0)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          var val0 = arg0;
          var len0 = val0.length;
          var ptr0 = realloc0(0, 0, 2, len0 * 2);
          
          let valData0;
          const valLenBytes0 = len0 * 2;
          if (Array.isArray(val0)) {
            // Regular array likely containing numbers, write values to memory
            let offset = 0;
            const dv0 = new DataView(memory0.buffer);
            for (const v of val0) {
              _requireValidNumericPrimitive.bind(null, 'u16')(v);
              dv0.setUint16(ptr0+ offset, v, true);
              offset += 2;
            }
          } else {
            // TypedArray / ArrayBuffer-like, direct copy
            valData0 = new Uint8Array(val0.buffer || val0, val0.byteOffset, valLenBytes0);
            const out0 = new Uint8Array(memory0.buffer, ptr0, valLenBytes0);
            out0.set(valData0);
          }
          
          _debugLog('[iface="list-u16", function="list-u16"][Instruction::CallWasm] enter', {
            funcName: 'list-u16',
            paramCount: 2,
            async: false,
            postReturn: true,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1ListU16(ptr0, len0),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          var ptr1 = dataView(memory0).getUint32(((ret >>> 0)) + 0, true) >>> 0;
          var len1 = dataView(memory0).getUint32(((ret >>> 0)) + 4, true);
          if (ptr1 < 0 || len1 < 0 || len1 > 134217727 || ptr1 > memory0.buffer.byteLength || len1 > Math.floor((memory0.buffer.byteLength - ptr1) / 2)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
          if (ptr1 % 2 !== 0) throw new TypeError(`list pointer [${ptr1}] is not aligned to 2`);
          var result1 = new Uint16Array(memory0.buffer.slice(ptr1, ptr1 + len1 * 2));
          _debugLog('[iface="list-u16", function="list-u16"][Instruction::Return]', {
            funcName: 'list-u16',
            paramCount: 1,
            async: false,
            postReturn: true
          });
          task.resolve([result1]);
          const retCopy = result1;
          
          let cstate = getOrCreateAsyncState(0);
          cstate.mayLeave = false;
          postReturn2(ret);
          cstate.mayLeave = true;
          task.exit();
          return retCopy;
          
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  let exports1ListS16;
  
  function listS16(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1ListS16',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (0!== null) {
      task.setReturnMemoryIdx(0);
      task.setReturnMemory((() => memory0)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          var val0 = arg0;
          var len0 = val0.length;
          var ptr0 = realloc0(0, 0, 2, len0 * 2);
          
          let valData0;
          const valLenBytes0 = len0 * 2;
          if (Array.isArray(val0)) {
            // Regular array likely containing numbers, write values to memory
            let offset = 0;
            const dv0 = new DataView(memory0.buffer);
            for (const v of val0) {
              _requireValidNumericPrimitive.bind(null, 's16')(v);
              dv0.setInt16(ptr0+ offset, v, true);
              offset += 2;
            }
          } else {
            // TypedArray / ArrayBuffer-like, direct copy
            valData0 = new Uint8Array(val0.buffer || val0, val0.byteOffset, valLenBytes0);
            const out0 = new Uint8Array(memory0.buffer, ptr0, valLenBytes0);
            out0.set(valData0);
          }
          
          _debugLog('[iface="list-s16", function="list-s16"][Instruction::CallWasm] enter', {
            funcName: 'list-s16',
            paramCount: 2,
            async: false,
            postReturn: true,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1ListS16(ptr0, len0),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          var ptr1 = dataView(memory0).getUint32(((ret >>> 0)) + 0, true) >>> 0;
          var len1 = dataView(memory0).getUint32(((ret >>> 0)) + 4, true);
          if (ptr1 < 0 || len1 < 0 || len1 > 134217727 || ptr1 > memory0.buffer.byteLength || len1 > Math.floor((memory0.buffer.byteLength - ptr1) / 2)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
          if (ptr1 % 2 !== 0) throw new TypeError(`list pointer [${ptr1}] is not aligned to 2`);
          var result1 = new Int16Array(memory0.buffer.slice(ptr1, ptr1 + len1 * 2));
          _debugLog('[iface="list-s16", function="list-s16"][Instruction::Return]', {
            funcName: 'list-s16',
            paramCount: 1,
            async: false,
            postReturn: true
          });
          task.resolve([result1]);
          const retCopy = result1;
          
          let cstate = getOrCreateAsyncState(0);
          cstate.mayLeave = false;
          postReturn2(ret);
          cstate.mayLeave = true;
          task.exit();
          return retCopy;
          
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  let exports1ListU32;
  
  function listU32(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1ListU32',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (0!== null) {
      task.setReturnMemoryIdx(0);
      task.setReturnMemory((() => memory0)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          var val0 = arg0;
          var len0 = val0.length;
          var ptr0 = realloc0(0, 0, 4, len0 * 4);
          
          let valData0;
          const valLenBytes0 = len0 * 4;
          if (Array.isArray(val0)) {
            // Regular array likely containing numbers, write values to memory
            let offset = 0;
            const dv0 = new DataView(memory0.buffer);
            for (const v of val0) {
              _requireValidNumericPrimitive.bind(null, 'u32')(v);
              dv0.setUint32(ptr0+ offset, v, true);
              offset += 4;
            }
          } else {
            // TypedArray / ArrayBuffer-like, direct copy
            valData0 = new Uint8Array(val0.buffer || val0, val0.byteOffset, valLenBytes0);
            const out0 = new Uint8Array(memory0.buffer, ptr0, valLenBytes0);
            out0.set(valData0);
          }
          
          _debugLog('[iface="list-u32", function="list-u32"][Instruction::CallWasm] enter', {
            funcName: 'list-u32',
            paramCount: 2,
            async: false,
            postReturn: true,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1ListU32(ptr0, len0),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          var ptr1 = dataView(memory0).getUint32(((ret >>> 0)) + 0, true) >>> 0;
          var len1 = dataView(memory0).getUint32(((ret >>> 0)) + 4, true);
          if (ptr1 < 0 || len1 < 0 || len1 > 67108863 || ptr1 > memory0.buffer.byteLength || len1 > Math.floor((memory0.buffer.byteLength - ptr1) / 4)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
          if (ptr1 % 4 !== 0) throw new TypeError(`list pointer [${ptr1}] is not aligned to 4`);
          var result1 = new Uint32Array(memory0.buffer.slice(ptr1, ptr1 + len1 * 4));
          _debugLog('[iface="list-u32", function="list-u32"][Instruction::Return]', {
            funcName: 'list-u32',
            paramCount: 1,
            async: false,
            postReturn: true
          });
          task.resolve([result1]);
          const retCopy = result1;
          
          let cstate = getOrCreateAsyncState(0);
          cstate.mayLeave = false;
          postReturn3(ret);
          cstate.mayLeave = true;
          task.exit();
          return retCopy;
          
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  let exports1ListS32;
  
  function listS32(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1ListS32',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (0!== null) {
      task.setReturnMemoryIdx(0);
      task.setReturnMemory((() => memory0)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          var val0 = arg0;
          var len0 = val0.length;
          var ptr0 = realloc0(0, 0, 4, len0 * 4);
          
          let valData0;
          const valLenBytes0 = len0 * 4;
          if (Array.isArray(val0)) {
            // Regular array likely containing numbers, write values to memory
            let offset = 0;
            const dv0 = new DataView(memory0.buffer);
            for (const v of val0) {
              _requireValidNumericPrimitive.bind(null, 's32')(v);
              dv0.setInt32(ptr0+ offset, v, true);
              offset += 4;
            }
          } else {
            // TypedArray / ArrayBuffer-like, direct copy
            valData0 = new Uint8Array(val0.buffer || val0, val0.byteOffset, valLenBytes0);
            const out0 = new Uint8Array(memory0.buffer, ptr0, valLenBytes0);
            out0.set(valData0);
          }
          
          _debugLog('[iface="list-s32", function="list-s32"][Instruction::CallWasm] enter', {
            funcName: 'list-s32',
            paramCount: 2,
            async: false,
            postReturn: true,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1ListS32(ptr0, len0),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          var ptr1 = dataView(memory0).getUint32(((ret >>> 0)) + 0, true) >>> 0;
          var len1 = dataView(memory0).getUint32(((ret >>> 0)) + 4, true);
          if (ptr1 < 0 || len1 < 0 || len1 > 67108863 || ptr1 > memory0.buffer.byteLength || len1 > Math.floor((memory0.buffer.byteLength - ptr1) / 4)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
          if (ptr1 % 4 !== 0) throw new TypeError(`list pointer [${ptr1}] is not aligned to 4`);
          var result1 = new Int32Array(memory0.buffer.slice(ptr1, ptr1 + len1 * 4));
          _debugLog('[iface="list-s32", function="list-s32"][Instruction::Return]', {
            funcName: 'list-s32',
            paramCount: 1,
            async: false,
            postReturn: true
          });
          task.resolve([result1]);
          const retCopy = result1;
          
          let cstate = getOrCreateAsyncState(0);
          cstate.mayLeave = false;
          postReturn3(ret);
          cstate.mayLeave = true;
          task.exit();
          return retCopy;
          
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  let exports1ListS64;
  
  function listU64(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1ListS64',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (0!== null) {
      task.setReturnMemoryIdx(0);
      task.setReturnMemory((() => memory0)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          var val0 = arg0;
          var len0 = val0.length;
          var ptr0 = realloc0(0, 0, 8, len0 * 8);
          
          let valData0;
          const valLenBytes0 = len0 * 8;
          if (Array.isArray(val0)) {
            // Regular array likely containing numbers, write values to memory
            let offset = 0;
            const dv0 = new DataView(memory0.buffer);
            for (const v of val0) {
              _requireValidNumericPrimitive.bind(null, 'u64')(v);
              dv0.setBigUint64(ptr0+ offset, v, true);
              offset += 8;
            }
          } else {
            // TypedArray / ArrayBuffer-like, direct copy
            valData0 = new Uint8Array(val0.buffer || val0, val0.byteOffset, valLenBytes0);
            const out0 = new Uint8Array(memory0.buffer, ptr0, valLenBytes0);
            out0.set(valData0);
          }
          
          _debugLog('[iface="list-u64", function="list-u64"][Instruction::CallWasm] enter', {
            funcName: 'list-u64',
            paramCount: 2,
            async: false,
            postReturn: true,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1ListS64(ptr0, len0),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          var ptr1 = dataView(memory0).getUint32(((ret >>> 0)) + 0, true) >>> 0;
          var len1 = dataView(memory0).getUint32(((ret >>> 0)) + 4, true);
          if (ptr1 < 0 || len1 < 0 || len1 > 33554431 || ptr1 > memory0.buffer.byteLength || len1 > Math.floor((memory0.buffer.byteLength - ptr1) / 8)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
          if (ptr1 % 8 !== 0) throw new TypeError(`list pointer [${ptr1}] is not aligned to 8`);
          var result1 = new BigUint64Array(memory0.buffer.slice(ptr1, ptr1 + len1 * 8));
          _debugLog('[iface="list-u64", function="list-u64"][Instruction::Return]', {
            funcName: 'list-u64',
            paramCount: 1,
            async: false,
            postReturn: true
          });
          task.resolve([result1]);
          const retCopy = result1;
          
          let cstate = getOrCreateAsyncState(0);
          cstate.mayLeave = false;
          postReturn4(ret);
          cstate.mayLeave = true;
          task.exit();
          return retCopy;
          
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  
  function listS64(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1ListS64',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (0!== null) {
      task.setReturnMemoryIdx(0);
      task.setReturnMemory((() => memory0)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          var val0 = arg0;
          var len0 = val0.length;
          var ptr0 = realloc0(0, 0, 8, len0 * 8);
          
          let valData0;
          const valLenBytes0 = len0 * 8;
          if (Array.isArray(val0)) {
            // Regular array likely containing numbers, write values to memory
            let offset = 0;
            const dv0 = new DataView(memory0.buffer);
            for (const v of val0) {
              _requireValidNumericPrimitive.bind(null, 's64')(v);
              dv0.setBigInt64(ptr0+ offset, v, true);
              offset += 8;
            }
          } else {
            // TypedArray / ArrayBuffer-like, direct copy
            valData0 = new Uint8Array(val0.buffer || val0, val0.byteOffset, valLenBytes0);
            const out0 = new Uint8Array(memory0.buffer, ptr0, valLenBytes0);
            out0.set(valData0);
          }
          
          _debugLog('[iface="list-s64", function="list-s64"][Instruction::CallWasm] enter', {
            funcName: 'list-s64',
            paramCount: 2,
            async: false,
            postReturn: true,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1ListS64(ptr0, len0),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          var ptr1 = dataView(memory0).getUint32(((ret >>> 0)) + 0, true) >>> 0;
          var len1 = dataView(memory0).getUint32(((ret >>> 0)) + 4, true);
          if (ptr1 < 0 || len1 < 0 || len1 > 33554431 || ptr1 > memory0.buffer.byteLength || len1 > Math.floor((memory0.buffer.byteLength - ptr1) / 8)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
          if (ptr1 % 8 !== 0) throw new TypeError(`list pointer [${ptr1}] is not aligned to 8`);
          var result1 = new BigInt64Array(memory0.buffer.slice(ptr1, ptr1 + len1 * 8));
          _debugLog('[iface="list-s64", function="list-s64"][Instruction::Return]', {
            funcName: 'list-s64',
            paramCount: 1,
            async: false,
            postReturn: true
          });
          task.resolve([result1]);
          const retCopy = result1;
          
          let cstate = getOrCreateAsyncState(0);
          cstate.mayLeave = false;
          postReturn4(ret);
          cstate.mayLeave = true;
          task.exit();
          return retCopy;
          
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  let exports1ListF32;
  
  function listF32(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1ListF32',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (0!== null) {
      task.setReturnMemoryIdx(0);
      task.setReturnMemory((() => memory0)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          var val0 = arg0;
          var len0 = val0.length;
          var ptr0 = realloc0(0, 0, 4, len0 * 4);
          
          let valData0;
          const valLenBytes0 = len0 * 4;
          if (Array.isArray(val0)) {
            // Regular array likely containing numbers, write values to memory
            let offset = 0;
            const dv0 = new DataView(memory0.buffer);
            for (const v of val0) {
              _requireValidNumericPrimitive.bind(null, 'f32')(v);
              dv0.setFloat32(ptr0+ offset, v, true);
              offset += 4;
            }
          } else {
            // TypedArray / ArrayBuffer-like, direct copy
            valData0 = new Uint8Array(val0.buffer || val0, val0.byteOffset, valLenBytes0);
            const out0 = new Uint8Array(memory0.buffer, ptr0, valLenBytes0);
            out0.set(valData0);
          }
          
          _debugLog('[iface="list-f32", function="list-f32"][Instruction::CallWasm] enter', {
            funcName: 'list-f32',
            paramCount: 2,
            async: false,
            postReturn: true,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1ListF32(ptr0, len0),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          var ptr1 = dataView(memory0).getUint32(((ret >>> 0)) + 0, true) >>> 0;
          var len1 = dataView(memory0).getUint32(((ret >>> 0)) + 4, true);
          if (ptr1 < 0 || len1 < 0 || len1 > 67108863 || ptr1 > memory0.buffer.byteLength || len1 > Math.floor((memory0.buffer.byteLength - ptr1) / 4)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
          if (ptr1 % 4 !== 0) throw new TypeError(`list pointer [${ptr1}] is not aligned to 4`);
          var result1 = new Float32Array(memory0.buffer.slice(ptr1, ptr1 + len1 * 4));
          _debugLog('[iface="list-f32", function="list-f32"][Instruction::Return]', {
            funcName: 'list-f32',
            paramCount: 1,
            async: false,
            postReturn: true
          });
          task.resolve([result1]);
          const retCopy = result1;
          
          let cstate = getOrCreateAsyncState(0);
          cstate.mayLeave = false;
          postReturn3(ret);
          cstate.mayLeave = true;
          task.exit();
          return retCopy;
          
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  let exports1ListF64;
  
  function listF64(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1ListF64',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (0!== null) {
      task.setReturnMemoryIdx(0);
      task.setReturnMemory((() => memory0)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          var val0 = arg0;
          var len0 = val0.length;
          var ptr0 = realloc0(0, 0, 8, len0 * 8);
          
          let valData0;
          const valLenBytes0 = len0 * 8;
          if (Array.isArray(val0)) {
            // Regular array likely containing numbers, write values to memory
            let offset = 0;
            const dv0 = new DataView(memory0.buffer);
            for (const v of val0) {
              _requireValidNumericPrimitive.bind(null, 'f64')(v);
              dv0.setFloat64(ptr0+ offset, v, true);
              offset += 8;
            }
          } else {
            // TypedArray / ArrayBuffer-like, direct copy
            valData0 = new Uint8Array(val0.buffer || val0, val0.byteOffset, valLenBytes0);
            const out0 = new Uint8Array(memory0.buffer, ptr0, valLenBytes0);
            out0.set(valData0);
          }
          
          _debugLog('[iface="list-f64", function="list-f64"][Instruction::CallWasm] enter', {
            funcName: 'list-f64',
            paramCount: 2,
            async: false,
            postReturn: true,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1ListF64(ptr0, len0),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          var ptr1 = dataView(memory0).getUint32(((ret >>> 0)) + 0, true) >>> 0;
          var len1 = dataView(memory0).getUint32(((ret >>> 0)) + 4, true);
          if (ptr1 < 0 || len1 < 0 || len1 > 33554431 || ptr1 > memory0.buffer.byteLength || len1 > Math.floor((memory0.buffer.byteLength - ptr1) / 8)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
          if (ptr1 % 8 !== 0) throw new TypeError(`list pointer [${ptr1}] is not aligned to 8`);
          var result1 = new Float64Array(memory0.buffer.slice(ptr1, ptr1 + len1 * 8));
          _debugLog('[iface="list-f64", function="list-f64"][Instruction::Return]', {
            funcName: 'list-f64',
            paramCount: 1,
            async: false,
            postReturn: true
          });
          task.resolve([result1]);
          const retCopy = result1;
          
          let cstate = getOrCreateAsyncState(0);
          cstate.mayLeave = false;
          postReturn4(ret);
          cstate.mayLeave = true;
          task.exit();
          return retCopy;
          
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  let exports1ListChar;
  
  function listChar(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1ListChar',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (0!== null) {
      task.setReturnMemoryIdx(0);
      task.setReturnMemory((() => memory0)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          var vec0 = arg0;
          var len0 = vec0.length;
          var result0 = realloc0(0, 0, 4, len0 * 4);
          if (result0 < 0 || len0 < 0 || len0 > 67108863 || result0 > memory0.buffer.byteLength || len0 > Math.floor((memory0.buffer.byteLength - result0) / 4)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
          for (let i = 0; i < vec0.length; i++) {
            const e = vec0[i];
            const base = result0 + i * 4;dataView(memory0).setInt32((base) + 0, validateHostChar(e), true);
          }
          _debugLog('[iface="list-char", function="list-char"][Instruction::CallWasm] enter', {
            funcName: 'list-char',
            paramCount: 2,
            async: false,
            postReturn: true,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1ListChar(result0, len0),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          var len1 = dataView(memory0).getUint32(((ret >>> 0)) + 4, true);
          var base1 = dataView(memory0).getUint32(((ret >>> 0)) + 0, true) >>> 0;
          if (base1 < 0 || len1 < 0 || len1 > 67108863 || base1 > memory0.buffer.byteLength || len1 > Math.floor((memory0.buffer.byteLength - base1) / 4)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
          if (base1 % 4 !== 0) throw new TypeError(`list pointer [${base1}] is not aligned to 4`);
          var result1 = [];
          for (let i = 0; i < len1; i++) {
            const base = base1 + i * 4;
            result1.push(validateGuestChar(dataView(memory0).getInt32((base) + 0, true)));
          }
          _debugLog('[iface="list-char", function="list-char"][Instruction::Return]', {
            funcName: 'list-char',
            paramCount: 1,
            async: false,
            postReturn: true
          });
          task.resolve([result1]);
          const retCopy = result1;
          
          let cstate = getOrCreateAsyncState(0);
          cstate.mayLeave = false;
          postReturn3(ret);
          cstate.mayLeave = true;
          task.exit();
          return retCopy;
          
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  let exports1ListString;
  
  function listString(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1ListString',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (0!== null) {
      task.setReturnMemoryIdx(0);
      task.setReturnMemory((() => memory0)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          var vec1 = arg0;
          var len1 = vec1.length;
          var result1 = realloc0(0, 0, 4, len1 * 8);
          if (result1 < 0 || len1 < 0 || len1 > 33554431 || result1 > memory0.buffer.byteLength || len1 > Math.floor((memory0.buffer.byteLength - result1) / 8)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
          for (let i = 0; i < vec1.length; i++) {
            const e = vec1[i];
            const base = result1 + i * 8;
            var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
            var ptr0= encodeRes.ptr;
            var len0 = encodeRes.len;
            
            dataView(memory0).setUint32((base) + 4, len0, true);
            dataView(memory0).setUint32((base) + 0, ptr0, true);
          }
          _debugLog('[iface="list-string", function="list-string"][Instruction::CallWasm] enter', {
            funcName: 'list-string',
            paramCount: 2,
            async: false,
            postReturn: true,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1ListString(result1, len1),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          var len3 = dataView(memory0).getUint32(((ret >>> 0)) + 4, true);
          var base3 = dataView(memory0).getUint32(((ret >>> 0)) + 0, true) >>> 0;
          if (base3 < 0 || len3 < 0 || len3 > 33554431 || base3 > memory0.buffer.byteLength || len3 > Math.floor((memory0.buffer.byteLength - base3) / 8)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
          if (base3 % 4 !== 0) throw new TypeError(`list pointer [${base3}] is not aligned to 4`);
          var result3 = [];
          for (let i = 0; i < len3; i++) {
            const base = base3 + i * 8;
            var ptr2 = dataView(memory0).getUint32((base) + 0, true) >>> 0;
            var len2 = dataView(memory0).getUint32((base) + 4, true);
            var result2 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr2, len2));
            result3.push(result2);
          }
          _debugLog('[iface="list-string", function="list-string"][Instruction::Return]', {
            funcName: 'list-string',
            paramCount: 1,
            async: false,
            postReturn: true
          });
          task.resolve([result3]);
          const retCopy = result3;
          
          let cstate = getOrCreateAsyncState(0);
          cstate.mayLeave = false;
          postReturn5(ret);
          cstate.mayLeave = true;
          task.exit();
          return retCopy;
          
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  
  function flags1(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1EchoU8',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (null!== null) {
      task.setReturnMemoryIdx(null);
      task.setReturnMemory((() => null)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          let flags0 = 0;
          if (typeof arg0 === 'object' && arg0 !== null) {
            flags0 = Boolean(arg0.b0) << 0;
          } else if (arg0 !== null && arg0!== undefined) {
            throw new TypeError('only an object, undefined or null can be converted to flags');
          }
          _debugLog('[iface="flags-1", function="flags-1"][Instruction::CallWasm] enter', {
            funcName: 'flags-1',
            paramCount: 1,
            async: false,
            postReturn: false,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1EchoU8(flags0),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          if ((ret & 4294967294) !== 0) {
            throw new TypeError('flags have extraneous bits set');
          }
          var flags1 = {
            b0: Boolean(ret & 1),
          };
          _debugLog('[iface="flags-1", function="flags-1"][Instruction::Return]', {
            funcName: 'flags-1',
            paramCount: 1,
            async: false,
            postReturn: false
          });
          task.resolve([flags1]);
          task.exit();
          return flags1;
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  
  function flags8(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1EchoU8',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (null!== null) {
      task.setReturnMemoryIdx(null);
      task.setReturnMemory((() => null)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          let flags0 = 0;
          if (typeof arg0 === 'object' && arg0 !== null) {
            flags0 = Boolean(arg0.b0) << 0 | Boolean(arg0.b1) << 1 | Boolean(arg0.b2) << 2 | Boolean(arg0.b3) << 3 | Boolean(arg0.b4) << 4 | Boolean(arg0.b5) << 5 | Boolean(arg0.b6) << 6 | Boolean(arg0.b7) << 7;
          } else if (arg0 !== null && arg0!== undefined) {
            throw new TypeError('only an object, undefined or null can be converted to flags');
          }
          _debugLog('[iface="flags-8", function="flags-8"][Instruction::CallWasm] enter', {
            funcName: 'flags-8',
            paramCount: 1,
            async: false,
            postReturn: false,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1EchoU8(flags0),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          if ((ret & 4294967040) !== 0) {
            throw new TypeError('flags have extraneous bits set');
          }
          var flags1 = {
            b0: Boolean(ret & 1),
            b1: Boolean(ret & 2),
            b2: Boolean(ret & 4),
            b3: Boolean(ret & 8),
            b4: Boolean(ret & 16),
            b5: Boolean(ret & 32),
            b6: Boolean(ret & 64),
            b7: Boolean(ret & 128),
          };
          _debugLog('[iface="flags-8", function="flags-8"][Instruction::Return]', {
            funcName: 'flags-8',
            paramCount: 1,
            async: false,
            postReturn: false
          });
          task.resolve([flags1]);
          task.exit();
          return flags1;
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  
  function flags9(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1EchoU16',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (null!== null) {
      task.setReturnMemoryIdx(null);
      task.setReturnMemory((() => null)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          let flags0 = 0;
          if (typeof arg0 === 'object' && arg0 !== null) {
            flags0 = Boolean(arg0.b0) << 0 | Boolean(arg0.b1) << 1 | Boolean(arg0.b2) << 2 | Boolean(arg0.b3) << 3 | Boolean(arg0.b4) << 4 | Boolean(arg0.b5) << 5 | Boolean(arg0.b6) << 6 | Boolean(arg0.b7) << 7 | Boolean(arg0.b8) << 8;
          } else if (arg0 !== null && arg0!== undefined) {
            throw new TypeError('only an object, undefined or null can be converted to flags');
          }
          _debugLog('[iface="flags-9", function="flags-9"][Instruction::CallWasm] enter', {
            funcName: 'flags-9',
            paramCount: 1,
            async: false,
            postReturn: false,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1EchoU16(flags0),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          if ((ret & 4294966784) !== 0) {
            throw new TypeError('flags have extraneous bits set');
          }
          var flags1 = {
            b0: Boolean(ret & 1),
            b1: Boolean(ret & 2),
            b2: Boolean(ret & 4),
            b3: Boolean(ret & 8),
            b4: Boolean(ret & 16),
            b5: Boolean(ret & 32),
            b6: Boolean(ret & 64),
            b7: Boolean(ret & 128),
            b8: Boolean(ret & 256),
          };
          _debugLog('[iface="flags-9", function="flags-9"][Instruction::Return]', {
            funcName: 'flags-9',
            paramCount: 1,
            async: false,
            postReturn: false
          });
          task.resolve([flags1]);
          task.exit();
          return flags1;
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  
  function flags16(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1EchoU16',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (null!== null) {
      task.setReturnMemoryIdx(null);
      task.setReturnMemory((() => null)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          let flags0 = 0;
          if (typeof arg0 === 'object' && arg0 !== null) {
            flags0 = Boolean(arg0.b0) << 0 | Boolean(arg0.b1) << 1 | Boolean(arg0.b2) << 2 | Boolean(arg0.b3) << 3 | Boolean(arg0.b4) << 4 | Boolean(arg0.b5) << 5 | Boolean(arg0.b6) << 6 | Boolean(arg0.b7) << 7 | Boolean(arg0.b8) << 8 | Boolean(arg0.b9) << 9 | Boolean(arg0.b10) << 10 | Boolean(arg0.b11) << 11 | Boolean(arg0.b12) << 12 | Boolean(arg0.b13) << 13 | Boolean(arg0.b14) << 14 | Boolean(arg0.b15) << 15;
          } else if (arg0 !== null && arg0!== undefined) {
            throw new TypeError('only an object, undefined or null can be converted to flags');
          }
          _debugLog('[iface="flags-16", function="flags-16"][Instruction::CallWasm] enter', {
            funcName: 'flags-16',
            paramCount: 1,
            async: false,
            postReturn: false,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1EchoU16(flags0),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          if ((ret & 4294901760) !== 0) {
            throw new TypeError('flags have extraneous bits set');
          }
          var flags1 = {
            b0: Boolean(ret & 1),
            b1: Boolean(ret & 2),
            b2: Boolean(ret & 4),
            b3: Boolean(ret & 8),
            b4: Boolean(ret & 16),
            b5: Boolean(ret & 32),
            b6: Boolean(ret & 64),
            b7: Boolean(ret & 128),
            b8: Boolean(ret & 256),
            b9: Boolean(ret & 512),
            b10: Boolean(ret & 1024),
            b11: Boolean(ret & 2048),
            b12: Boolean(ret & 4096),
            b13: Boolean(ret & 8192),
            b14: Boolean(ret & 16384),
            b15: Boolean(ret & 32768),
          };
          _debugLog('[iface="flags-16", function="flags-16"][Instruction::Return]', {
            funcName: 'flags-16',
            paramCount: 1,
            async: false,
            postReturn: false
          });
          task.resolve([flags1]);
          task.exit();
          return flags1;
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  
  function flags17(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1EchoS32',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (null!== null) {
      task.setReturnMemoryIdx(null);
      task.setReturnMemory((() => null)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          let flags0 = 0;
          if (typeof arg0 === 'object' && arg0 !== null) {
            flags0 = Boolean(arg0.b0) << 0 | Boolean(arg0.b1) << 1 | Boolean(arg0.b2) << 2 | Boolean(arg0.b3) << 3 | Boolean(arg0.b4) << 4 | Boolean(arg0.b5) << 5 | Boolean(arg0.b6) << 6 | Boolean(arg0.b7) << 7 | Boolean(arg0.b8) << 8 | Boolean(arg0.b9) << 9 | Boolean(arg0.b10) << 10 | Boolean(arg0.b11) << 11 | Boolean(arg0.b12) << 12 | Boolean(arg0.b13) << 13 | Boolean(arg0.b14) << 14 | Boolean(arg0.b15) << 15 | Boolean(arg0.b16) << 16;
          } else if (arg0 !== null && arg0!== undefined) {
            throw new TypeError('only an object, undefined or null can be converted to flags');
          }
          _debugLog('[iface="flags-17", function="flags-17"][Instruction::CallWasm] enter', {
            funcName: 'flags-17',
            paramCount: 1,
            async: false,
            postReturn: false,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1EchoS32(flags0),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          if ((ret & 4294836224) !== 0) {
            throw new TypeError('flags have extraneous bits set');
          }
          var flags1 = {
            b0: Boolean(ret & 1),
            b1: Boolean(ret & 2),
            b2: Boolean(ret & 4),
            b3: Boolean(ret & 8),
            b4: Boolean(ret & 16),
            b5: Boolean(ret & 32),
            b6: Boolean(ret & 64),
            b7: Boolean(ret & 128),
            b8: Boolean(ret & 256),
            b9: Boolean(ret & 512),
            b10: Boolean(ret & 1024),
            b11: Boolean(ret & 2048),
            b12: Boolean(ret & 4096),
            b13: Boolean(ret & 8192),
            b14: Boolean(ret & 16384),
            b15: Boolean(ret & 32768),
            b16: Boolean(ret & 65536),
          };
          _debugLog('[iface="flags-17", function="flags-17"][Instruction::Return]', {
            funcName: 'flags-17',
            paramCount: 1,
            async: false,
            postReturn: false
          });
          task.resolve([flags1]);
          task.exit();
          return flags1;
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  
  function flags32(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1EchoS32',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (null!== null) {
      task.setReturnMemoryIdx(null);
      task.setReturnMemory((() => null)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          let flags0 = 0;
          if (typeof arg0 === 'object' && arg0 !== null) {
            flags0 = Boolean(arg0.b0) << 0 | Boolean(arg0.b1) << 1 | Boolean(arg0.b2) << 2 | Boolean(arg0.b3) << 3 | Boolean(arg0.b4) << 4 | Boolean(arg0.b5) << 5 | Boolean(arg0.b6) << 6 | Boolean(arg0.b7) << 7 | Boolean(arg0.b8) << 8 | Boolean(arg0.b9) << 9 | Boolean(arg0.b10) << 10 | Boolean(arg0.b11) << 11 | Boolean(arg0.b12) << 12 | Boolean(arg0.b13) << 13 | Boolean(arg0.b14) << 14 | Boolean(arg0.b15) << 15 | Boolean(arg0.b16) << 16 | Boolean(arg0.b17) << 17 | Boolean(arg0.b18) << 18 | Boolean(arg0.b19) << 19 | Boolean(arg0.b20) << 20 | Boolean(arg0.b21) << 21 | Boolean(arg0.b22) << 22 | Boolean(arg0.b23) << 23 | Boolean(arg0.b24) << 24 | Boolean(arg0.b25) << 25 | Boolean(arg0.b26) << 26 | Boolean(arg0.b27) << 27 | Boolean(arg0.b28) << 28 | Boolean(arg0.b29) << 29 | Boolean(arg0.b30) << 30 | Boolean(arg0.b31) << 31;
          } else if (arg0 !== null && arg0!== undefined) {
            throw new TypeError('only an object, undefined or null can be converted to flags');
          }
          _debugLog('[iface="flags-32", function="flags-32"][Instruction::CallWasm] enter', {
            funcName: 'flags-32',
            paramCount: 1,
            async: false,
            postReturn: false,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1EchoS32(flags0),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          var flags1 = {
            b0: Boolean(ret & 1),
            b1: Boolean(ret & 2),
            b2: Boolean(ret & 4),
            b3: Boolean(ret & 8),
            b4: Boolean(ret & 16),
            b5: Boolean(ret & 32),
            b6: Boolean(ret & 64),
            b7: Boolean(ret & 128),
            b8: Boolean(ret & 256),
            b9: Boolean(ret & 512),
            b10: Boolean(ret & 1024),
            b11: Boolean(ret & 2048),
            b12: Boolean(ret & 4096),
            b13: Boolean(ret & 8192),
            b14: Boolean(ret & 16384),
            b15: Boolean(ret & 32768),
            b16: Boolean(ret & 65536),
            b17: Boolean(ret & 131072),
            b18: Boolean(ret & 262144),
            b19: Boolean(ret & 524288),
            b20: Boolean(ret & 1048576),
            b21: Boolean(ret & 2097152),
            b22: Boolean(ret & 4194304),
            b23: Boolean(ret & 8388608),
            b24: Boolean(ret & 16777216),
            b25: Boolean(ret & 33554432),
            b26: Boolean(ret & 67108864),
            b27: Boolean(ret & 134217728),
            b28: Boolean(ret & 268435456),
            b29: Boolean(ret & 536870912),
            b30: Boolean(ret & 1073741824),
            b31: Boolean(ret & 2147483648),
          };
          _debugLog('[iface="flags-32", function="flags-32"][Instruction::Return]', {
            funcName: 'flags-32',
            paramCount: 1,
            async: false,
            postReturn: false
          });
          task.resolve([flags1]);
          task.exit();
          return flags1;
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  let exports1EchoShade;
  
  function echoShade(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1EchoShade',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (null!== null) {
      task.setReturnMemoryIdx(null);
      task.setReturnMemory((() => null)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          var val0 = arg0;
          let enum0;
          switch (val0) {
            case 'red': {
              enum0 = 0;
              break;
            }
            case 'green': {
              enum0 = 1;
              break;
            }
            case 'blue': {
              enum0 = 2;
              break;
            }
            default: {
              if ((arg0) instanceof Error) {
                console.error(arg0);
              }
              
              throw new TypeError(`"${val0}" is not one of the cases of shade`);
            }
          }
          _debugLog('[iface="echo-shade", function="echo-shade"][Instruction::CallWasm] enter', {
            funcName: 'echo-shade',
            paramCount: 1,
            async: false,
            postReturn: false,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1EchoShade(enum0),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          let enum1;
          switch (ret) {
            case 0: {
              enum1 = 'red';
              break;
            }
            case 1: {
              enum1 = 'green';
              break;
            }
            case 2: {
              enum1 = 'blue';
              break;
            }
            default: {
              throw new TypeError('invalid discriminant specified for Shade');
            }
          }
          _debugLog('[iface="echo-shade", function="echo-shade"][Instruction::Return]', {
            funcName: 'echo-shade',
            paramCount: 1,
            async: false,
            postReturn: false
          });
          task.resolve([enum1]);
          task.exit();
          return enum1;
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  let exports1EchoChoice;
  
  function echoChoice(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1EchoChoice',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (0!== null) {
      task.setReturnMemoryIdx(0);
      task.setReturnMemory((() => memory0)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          var variant4 = arg0;
          let variant4_0;
          let variant4_1;
          let variant4_2;
          switch (variant4.tag) {
            case 'none': {
              variant4_0 = 0;
              variant4_1 = 0n;
              variant4_2 = 0;
              break;
            }
            case 'number': {
              const e = variant4.val;
              variant4_0 = 1;
              variant4_1 = BigInt(toInt64(e));
              variant4_2 = 0;
              break;
            }
            case 'text': {
              const e = variant4.val;
              
              var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
              var ptr0= encodeRes.ptr;
              var len0 = encodeRes.len;
              
              variant4_0 = 2;
              variant4_1 = BigInt(ptr0);
              variant4_2 = len0;
              break;
            }
            case 'points': {
              const e = variant4.val;
              var vec3 = e;
              var len3 = vec3.length;
              var result3 = realloc0(0, 0, 4, len3 * 12);
              if (result3 < 0 || len3 < 0 || len3 > 22369621 || result3 > memory0.buffer.byteLength || len3 > Math.floor((memory0.buffer.byteLength - result3) / 12)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
              for (let i = 0; i < vec3.length; i++) {
                const e = vec3[i];
                const base = result3 + i * 12;var {x: v1_0, label: v1_1 } = e;
                dataView(memory0).setInt32((base) + 0, toInt32(v1_0), true);
                
                var encodeRes = _utf8AllocateAndEncode(v1_1, realloc0, memory0);
                var ptr2= encodeRes.ptr;
                var len2 = encodeRes.len;
                
                dataView(memory0).setUint32((base) + 8, len2, true);
                dataView(memory0).setUint32((base) + 4, ptr2, true);
              }
              variant4_0 = 3;
              variant4_1 = BigInt(result3);
              variant4_2 = len3;
              break;
            }
            default: {
              throw new TypeError(`invalid variant tag value \`${JSON.stringify(variant4.tag)}\` (received \`${variant4}\`) specified for \`Choice\``);
            }
          }
          _debugLog('[iface="echo-choice", function="echo-choice"][Instruction::CallWasm] enter', {
            funcName: 'echo-choice',
            paramCount: 3,
            async: false,
            postReturn: true,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1EchoChoice(variant4_0, variant4_1, variant4_2),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          let variant8;
          switch (dataView(memory0).getUint8(((ret >>> 0)) + 0, true)) {
            case 0: {
              variant8= {
                tag: 'none',
              };
              break;
            }
            case 1: {
              variant8= {
                tag: 'number',
                val: dataView(memory0).getBigInt64(((ret >>> 0)) + 8, true)
              };
              break;
            }
            case 2: {
              var ptr5 = dataView(memory0).getUint32(((ret >>> 0)) + 8, true) >>> 0;
              var len5 = dataView(memory0).getUint32(((ret >>> 0)) + 12, true);
              var result5 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr5, len5));
              variant8= {
                tag: 'text',
                val: result5
              };
              break;
            }
            case 3: {
              var len7 = dataView(memory0).getUint32(((ret >>> 0)) + 12, true);
              var base7 = dataView(memory0).getUint32(((ret >>> 0)) + 8, true) >>> 0;
              if (base7 < 0 || len7 < 0 || len7 > 22369621 || base7 > memory0.buffer.byteLength || len7 > Math.floor((memory0.buffer.byteLength - base7) / 12)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
              if (base7 % 4 !== 0) throw new TypeError(`list pointer [${base7}] is not aligned to 4`);
              var result7 = [];
              for (let i = 0; i < len7; i++) {
                const base = base7 + i * 12;
                var ptr6 = dataView(memory0).getUint32((base) + 4, true) >>> 0;
                var len6 = dataView(memory0).getUint32((base) + 8, true);
                var result6 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr6, len6));
                result7.push({
                  x: dataView(memory0).getInt32((base) + 0, true),
                  label: result6,
                });
              }
              variant8= {
                tag: 'points',
                val: result7
              };
              break;
            }
            default: {
              throw new TypeError('invalid variant discriminant for Choice');
            }
          }
          _debugLog('[iface="echo-choice", function="echo-choice"][Instruction::Return]', {
            funcName: 'echo-choice',
            paramCount: 1,
            async: false,
            postReturn: true
          });
          task.resolve([variant8]);
          const retCopy = variant8;
          
          let cstate = getOrCreateAsyncState(0);
          cstate.mayLeave = false;
          postReturn6(ret);
          cstate.mayLeave = true;
          task.exit();
          return retCopy;
          
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  let exports1EchoPacket;
  
  function echoPacket(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1EchoPacket',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (0!== null) {
      task.setReturnMemoryIdx(0);
      task.setReturnMemory((() => memory0)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          var ptr0 = realloc0(0, 0, 8, 104);
          var {id: v1_0, name: v1_1, enabled: v1_2, anchor: v1_3, values: v1_4, choices: v1_5, optional: v1_6, verdicts: v1_7, pair: v1_8, shade: v1_9, bytes: v1_10 } = arg0;
          dataView(memory0).setBigInt64((ptr0) + 0, toUint64(v1_0), true);
          
          var encodeRes = _utf8AllocateAndEncode(v1_1, realloc0, memory0);
          var ptr2= encodeRes.ptr;
          var len2 = encodeRes.len;
          
          dataView(memory0).setUint32((ptr0) + 12, len2, true);
          dataView(memory0).setUint32((ptr0) + 8, ptr2, true);
          dataView(memory0).setInt8((ptr0) + 16, v1_2 ? 1 : 0, true);
          var {x: v3_0, label: v3_1 } = v1_3;
          dataView(memory0).setInt32((ptr0) + 20, toInt32(v3_0), true);
          
          var encodeRes = _utf8AllocateAndEncode(v3_1, realloc0, memory0);
          var ptr4= encodeRes.ptr;
          var len4 = encodeRes.len;
          
          dataView(memory0).setUint32((ptr0) + 28, len4, true);
          dataView(memory0).setUint32((ptr0) + 24, ptr4, true);
          var vec7 = v1_4;
          var len7 = vec7.length;
          var result7 = realloc0(0, 0, 4, len7 * 12);
          if (result7 < 0 || len7 < 0 || len7 > 22369621 || result7 > memory0.buffer.byteLength || len7 > Math.floor((memory0.buffer.byteLength - result7) / 12)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
          for (let i = 0; i < vec7.length; i++) {
            const e = vec7[i];
            const base = result7 + i * 12;var {x: v5_0, label: v5_1 } = e;
            dataView(memory0).setInt32((base) + 0, toInt32(v5_0), true);
            
            var encodeRes = _utf8AllocateAndEncode(v5_1, realloc0, memory0);
            var ptr6= encodeRes.ptr;
            var len6 = encodeRes.len;
            
            dataView(memory0).setUint32((base) + 8, len6, true);
            dataView(memory0).setUint32((base) + 4, ptr6, true);
          }
          dataView(memory0).setUint32((ptr0) + 36, len7, true);
          dataView(memory0).setUint32((ptr0) + 32, result7, true);
          var vec13 = v1_5;
          var len13 = vec13.length;
          var result13 = realloc0(0, 0, 8, len13 * 16);
          if (result13 < 0 || len13 < 0 || len13 > 16777215 || result13 > memory0.buffer.byteLength || len13 > Math.floor((memory0.buffer.byteLength - result13) / 16)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
          for (let i = 0; i < vec13.length; i++) {
            const e = vec13[i];
            const base = result13 + i * 16;var variant12 = e;
            switch (variant12.tag) {
              case 'none': {
                dataView(memory0).setInt8((base) + 0, 0, true);
                break;
              }
              case 'number': {
                const e = variant12.val;
                dataView(memory0).setInt8((base) + 0, 1, true);
                dataView(memory0).setBigInt64((base) + 8, toInt64(e), true);
                break;
              }
              case 'text': {
                const e = variant12.val;
                dataView(memory0).setInt8((base) + 0, 2, true);
                
                var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
                var ptr8= encodeRes.ptr;
                var len8 = encodeRes.len;
                
                dataView(memory0).setUint32((base) + 12, len8, true);
                dataView(memory0).setUint32((base) + 8, ptr8, true);
                break;
              }
              case 'points': {
                const e = variant12.val;
                dataView(memory0).setInt8((base) + 0, 3, true);
                var vec11 = e;
                var len11 = vec11.length;
                var result11 = realloc0(0, 0, 4, len11 * 12);
                if (result11 < 0 || len11 < 0 || len11 > 22369621 || result11 > memory0.buffer.byteLength || len11 > Math.floor((memory0.buffer.byteLength - result11) / 12)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
                for (let i = 0; i < vec11.length; i++) {
                  const e = vec11[i];
                  const base = result11 + i * 12;var {x: v9_0, label: v9_1 } = e;
                  dataView(memory0).setInt32((base) + 0, toInt32(v9_0), true);
                  
                  var encodeRes = _utf8AllocateAndEncode(v9_1, realloc0, memory0);
                  var ptr10= encodeRes.ptr;
                  var len10 = encodeRes.len;
                  
                  dataView(memory0).setUint32((base) + 8, len10, true);
                  dataView(memory0).setUint32((base) + 4, ptr10, true);
                }
                dataView(memory0).setUint32((base) + 12, len11, true);
                dataView(memory0).setUint32((base) + 8, result11, true);
                break;
              }
              default: {
                throw new TypeError(`invalid variant tag value \`${JSON.stringify(variant12.tag)}\` (received \`${variant12}\`) specified for \`Choice\``);
              }
            }
          }
          dataView(memory0).setUint32((ptr0) + 44, len13, true);
          dataView(memory0).setUint32((ptr0) + 40, result13, true);
          var variant16 = v1_6;
          switch (variant16.tag) {
            case 'none': {
              dataView(memory0).setInt8((ptr0) + 48, 0, true);
              
              break;
            }
            case 'some': {
              const e = variant16.val;
              dataView(memory0).setInt8((ptr0) + 48, 1, true);
              var variant15 = e;
              if (variant15 === null || variant15=== undefined) {
                dataView(memory0).setInt8((ptr0) + 52, 0, true);
              } else {
                const e = variant15;
                dataView(memory0).setInt8((ptr0) + 52, 1, true);
                
                var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
                var ptr14= encodeRes.ptr;
                var len14 = encodeRes.len;
                
                dataView(memory0).setUint32((ptr0) + 60, len14, true);
                dataView(memory0).setUint32((ptr0) + 56, ptr14, true);
              }
              
              break;
            }
            default: {
              _debugLog("ERROR: invalid value (expected option as object with 'tag' member)", { value: variant16, valueType: typeof variant16});
              throw new TypeError('invalid variant specified for option');
            }
          }
          var vec19 = v1_7;
          var len19 = vec19.length;
          var result19 = realloc0(0, 0, 4, len19 * 12);
          if (result19 < 0 || len19 < 0 || len19 > 22369621 || result19 > memory0.buffer.byteLength || len19 > Math.floor((memory0.buffer.byteLength - result19) / 12)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
          for (let i = 0; i < vec19.length; i++) {
            const e = vec19[i];
            const base = result19 + i * 12;var variant18 = e;
            switch (variant18.tag) {
              case 'ok': {
                const e = variant18.val;
                dataView(memory0).setInt8((base) + 0, 0, true);
                dataView(memory0).setInt32((base) + 4, toUint32(e), true);
                
                break;
              }
              case 'err': {
                const e = variant18.val;
                dataView(memory0).setInt8((base) + 0, 1, true);
                
                var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
                var ptr17= encodeRes.ptr;
                var len17 = encodeRes.len;
                
                dataView(memory0).setUint32((base) + 8, len17, true);
                dataView(memory0).setUint32((base) + 4, ptr17, true);
                
                break;
              }
              default: {
                _debugLog("ERROR: invalid value (expected result as object with 'tag' member)", { value: variant18, valueType: typeof variant18});
                throw new TypeError('invalid variant specified for result');
              }
            }
          }
          dataView(memory0).setUint32((ptr0) + 68, len19, true);
          dataView(memory0).setUint32((ptr0) + 64, result19, true);
          var [tuple20_0, tuple20_1] = v1_8;
          dataView(memory0).setFloat64((ptr0) + 72, +tuple20_0, true);
          
          var encodeRes = _utf8AllocateAndEncode(tuple20_1, realloc0, memory0);
          var ptr21= encodeRes.ptr;
          var len21 = encodeRes.len;
          
          dataView(memory0).setUint32((ptr0) + 84, len21, true);
          dataView(memory0).setUint32((ptr0) + 80, ptr21, true);
          var val22 = v1_9;
          let enum22;
          switch (val22) {
            case 'red': {
              enum22 = 0;
              break;
            }
            case 'green': {
              enum22 = 1;
              break;
            }
            case 'blue': {
              enum22 = 2;
              break;
            }
            default: {
              if ((v1_9) instanceof Error) {
                console.error(v1_9);
              }
              
              throw new TypeError(`"${val22}" is not one of the cases of shade`);
            }
          }
          dataView(memory0).setInt8((ptr0) + 88, enum22, true);
          var val23 = v1_10;
          var len23 = Array.isArray(val23) ? val23.length : val23.byteLength;
          var ptr23 = realloc0(0, 0, 1, len23 * 1);
          
          let valData23;
          const valLenBytes23 = len23 * 1;
          if (Array.isArray(val23)) {
            // Regular array likely containing numbers, write values to memory
            let offset = 0;
            const dv23 = new DataView(memory0.buffer);
            for (const v of val23) {
              _requireValidNumericPrimitive.bind(null, 'u8')(v);
              dv23.setUint8(ptr23+ offset, v, true);
              offset += 1;
            }
          } else {
            // TypedArray / ArrayBuffer-like, direct copy
            valData23 = new Uint8Array(val23.buffer || val23, val23.byteOffset, valLenBytes23);
            const out23 = new Uint8Array(memory0.buffer, ptr23, valLenBytes23);
            out23.set(valData23);
          }
          
          dataView(memory0).setUint32((ptr0) + 96, len23, true);
          dataView(memory0).setUint32((ptr0) + 92, ptr23, true);
          _debugLog('[iface="echo-packet", function="echo-packet"][Instruction::CallWasm] enter', {
            funcName: 'echo-packet',
            paramCount: 1,
            async: false,
            postReturn: true,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1EchoPacket(ptr0),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          var ptr24 = dataView(memory0).getUint32(((ret >>> 0)) + 8, true) >>> 0;
          var len24 = dataView(memory0).getUint32(((ret >>> 0)) + 12, true);
          var result24 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr24, len24));
          var bool25 = dataView(memory0).getUint8(((ret >>> 0)) + 16, true);
          var ptr26 = dataView(memory0).getUint32(((ret >>> 0)) + 24, true) >>> 0;
          var len26 = dataView(memory0).getUint32(((ret >>> 0)) + 28, true);
          var result26 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr26, len26));
          var len28 = dataView(memory0).getUint32(((ret >>> 0)) + 36, true);
          var base28 = dataView(memory0).getUint32(((ret >>> 0)) + 32, true) >>> 0;
          if (base28 < 0 || len28 < 0 || len28 > 22369621 || base28 > memory0.buffer.byteLength || len28 > Math.floor((memory0.buffer.byteLength - base28) / 12)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
          if (base28 % 4 !== 0) throw new TypeError(`list pointer [${base28}] is not aligned to 4`);
          var result28 = [];
          for (let i = 0; i < len28; i++) {
            const base = base28 + i * 12;
            var ptr27 = dataView(memory0).getUint32((base) + 4, true) >>> 0;
            var len27 = dataView(memory0).getUint32((base) + 8, true);
            var result27 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr27, len27));
            result28.push({
              x: dataView(memory0).getInt32((base) + 0, true),
              label: result27,
            });
          }
          var len33 = dataView(memory0).getUint32(((ret >>> 0)) + 44, true);
          var base33 = dataView(memory0).getUint32(((ret >>> 0)) + 40, true) >>> 0;
          if (base33 < 0 || len33 < 0 || len33 > 16777215 || base33 > memory0.buffer.byteLength || len33 > Math.floor((memory0.buffer.byteLength - base33) / 16)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
          if (base33 % 8 !== 0) throw new TypeError(`list pointer [${base33}] is not aligned to 8`);
          var result33 = [];
          for (let i = 0; i < len33; i++) {
            const base = base33 + i * 16;
            let variant32;
            switch (dataView(memory0).getUint8((base) + 0, true)) {
              case 0: {
                variant32= {
                  tag: 'none',
                };
                break;
              }
              case 1: {
                variant32= {
                  tag: 'number',
                  val: dataView(memory0).getBigInt64((base) + 8, true)
                };
                break;
              }
              case 2: {
                var ptr29 = dataView(memory0).getUint32((base) + 8, true) >>> 0;
                var len29 = dataView(memory0).getUint32((base) + 12, true);
                var result29 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr29, len29));
                variant32= {
                  tag: 'text',
                  val: result29
                };
                break;
              }
              case 3: {
                var len31 = dataView(memory0).getUint32((base) + 12, true);
                var base31 = dataView(memory0).getUint32((base) + 8, true) >>> 0;
                if (base31 < 0 || len31 < 0 || len31 > 22369621 || base31 > memory0.buffer.byteLength || len31 > Math.floor((memory0.buffer.byteLength - base31) / 12)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
                if (base31 % 4 !== 0) throw new TypeError(`list pointer [${base31}] is not aligned to 4`);
                var result31 = [];
                for (let i = 0; i < len31; i++) {
                  const base = base31 + i * 12;
                  var ptr30 = dataView(memory0).getUint32((base) + 4, true) >>> 0;
                  var len30 = dataView(memory0).getUint32((base) + 8, true);
                  var result30 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr30, len30));
                  result31.push({
                    x: dataView(memory0).getInt32((base) + 0, true),
                    label: result30,
                  });
                }
                variant32= {
                  tag: 'points',
                  val: result31
                };
                break;
              }
              default: {
                throw new TypeError('invalid variant discriminant for Choice');
              }
            }
            result33.push(variant32);
          }
          let variant36;
          switch (dataView(memory0).getUint8(((ret >>> 0)) + 48, true)) {
            case 0: {
              variant36 = { tag: 'none' };
              break;
            }
            case 1: {
              let variant35;
              switch (dataView(memory0).getUint8(((ret >>> 0)) + 52, true)) {
                case 0: {
                  variant35 = undefined;
                  break;
                }
                case 1: {
                  var ptr34 = dataView(memory0).getUint32(((ret >>> 0)) + 56, true) >>> 0;
                  var len34 = dataView(memory0).getUint32(((ret >>> 0)) + 60, true);
                  var result34 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr34, len34));
                  variant35 = result34;
                  break;
                }
                default: {
                  throw new TypeError('invalid variant discriminant for option');
                }
              }
              variant36 = {
                tag: 'some',
                val: variant35
              };
              break;
            }
            default: {
              throw new TypeError('invalid variant discriminant for option');
            }
          }
          var len39 = dataView(memory0).getUint32(((ret >>> 0)) + 68, true);
          var base39 = dataView(memory0).getUint32(((ret >>> 0)) + 64, true) >>> 0;
          if (base39 < 0 || len39 < 0 || len39 > 22369621 || base39 > memory0.buffer.byteLength || len39 > Math.floor((memory0.buffer.byteLength - base39) / 12)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
          if (base39 % 4 !== 0) throw new TypeError(`list pointer [${base39}] is not aligned to 4`);
          var result39 = [];
          for (let i = 0; i < len39; i++) {
            const base = base39 + i * 12;
            let variant38;
            switch (dataView(memory0).getUint8((base) + 0, true)) {
              case 0: {
                variant38= {
                  tag: 'ok',
                  val: dataView(memory0).getInt32((base) + 4, true) >>> 0
                };
                break;
              }
              case 1: {
                var ptr37 = dataView(memory0).getUint32((base) + 4, true) >>> 0;
                var len37 = dataView(memory0).getUint32((base) + 8, true);
                var result37 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr37, len37));
                variant38= {
                  tag: 'err',
                  val: result37
                };
                break;
              }
              default: {
                throw new TypeError('invalid variant discriminant for expected');
              }
            }
            result39.push(variant38);
          }
          var ptr40 = dataView(memory0).getUint32(((ret >>> 0)) + 80, true) >>> 0;
          var len40 = dataView(memory0).getUint32(((ret >>> 0)) + 84, true);
          var result40 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr40, len40));
          let enum41;
          switch (dataView(memory0).getUint8(((ret >>> 0)) + 88, true)) {
            case 0: {
              enum41 = 'red';
              break;
            }
            case 1: {
              enum41 = 'green';
              break;
            }
            case 2: {
              enum41 = 'blue';
              break;
            }
            default: {
              throw new TypeError('invalid discriminant specified for Shade');
            }
          }
          var ptr42 = dataView(memory0).getUint32(((ret >>> 0)) + 92, true) >>> 0;
          var len42 = dataView(memory0).getUint32(((ret >>> 0)) + 96, true);
          if (ptr42 < 0 || len42 < 0 || len42 > 268435455 || ptr42 > memory0.buffer.byteLength || len42 > Math.floor((memory0.buffer.byteLength - ptr42) / 1)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
          if (ptr42 % 1 !== 0) throw new TypeError(`list pointer [${ptr42}] is not aligned to 1`);
          var result42 = new Uint8Array(memory0.buffer.slice(ptr42, ptr42 + len42 * 1));
          _debugLog('[iface="echo-packet", function="echo-packet"][Instruction::Return]', {
            funcName: 'echo-packet',
            paramCount: 1,
            async: false,
            postReturn: true
          });
          task.resolve([{
            id: BigInt.asUintN(64, BigInt(dataView(memory0).getBigInt64(((ret >>> 0)) + 0, true))),
            name: result24,
            enabled: bool25 == 0 ? false : (bool25 == 1 ? true : throwInvalidBool()),
            anchor: {
              x: dataView(memory0).getInt32(((ret >>> 0)) + 20, true),
              label: result26,
            },
            values: result28,
            choices: result33,
            optional: variant36,
            verdicts: result39,
            pair: [dataView(memory0).getFloat64(((ret >>> 0)) + 72, true), result40],
            shade: enum41,
            bytes: result42,
          }]);
          const retCopy = {
            id: BigInt.asUintN(64, BigInt(dataView(memory0).getBigInt64(((ret >>> 0)) + 0, true))),
            name: result24,
            enabled: bool25 == 0 ? false : (bool25 == 1 ? true : throwInvalidBool()),
            anchor: {
              x: dataView(memory0).getInt32(((ret >>> 0)) + 20, true),
              label: result26,
            },
            values: result28,
            choices: result33,
            optional: variant36,
            verdicts: result39,
            pair: [dataView(memory0).getFloat64(((ret >>> 0)) + 72, true), result40],
            shade: enum41,
            bytes: result42,
          };
          
          let cstate = getOrCreateAsyncState(0);
          cstate.mayLeave = false;
          postReturn7(ret);
          cstate.mayLeave = true;
          task.exit();
          return retCopy;
          
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  let exports1InspectPacket;
  
  function inspectPacket(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1InspectPacket',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (0!== null) {
      task.setReturnMemoryIdx(0);
      task.setReturnMemory((() => memory0)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          var ptr0 = realloc0(0, 0, 8, 104);
          var {id: v1_0, name: v1_1, enabled: v1_2, anchor: v1_3, values: v1_4, choices: v1_5, optional: v1_6, verdicts: v1_7, pair: v1_8, shade: v1_9, bytes: v1_10 } = arg0;
          dataView(memory0).setBigInt64((ptr0) + 0, toUint64(v1_0), true);
          
          var encodeRes = _utf8AllocateAndEncode(v1_1, realloc0, memory0);
          var ptr2= encodeRes.ptr;
          var len2 = encodeRes.len;
          
          dataView(memory0).setUint32((ptr0) + 12, len2, true);
          dataView(memory0).setUint32((ptr0) + 8, ptr2, true);
          dataView(memory0).setInt8((ptr0) + 16, v1_2 ? 1 : 0, true);
          var {x: v3_0, label: v3_1 } = v1_3;
          dataView(memory0).setInt32((ptr0) + 20, toInt32(v3_0), true);
          
          var encodeRes = _utf8AllocateAndEncode(v3_1, realloc0, memory0);
          var ptr4= encodeRes.ptr;
          var len4 = encodeRes.len;
          
          dataView(memory0).setUint32((ptr0) + 28, len4, true);
          dataView(memory0).setUint32((ptr0) + 24, ptr4, true);
          var vec7 = v1_4;
          var len7 = vec7.length;
          var result7 = realloc0(0, 0, 4, len7 * 12);
          if (result7 < 0 || len7 < 0 || len7 > 22369621 || result7 > memory0.buffer.byteLength || len7 > Math.floor((memory0.buffer.byteLength - result7) / 12)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
          for (let i = 0; i < vec7.length; i++) {
            const e = vec7[i];
            const base = result7 + i * 12;var {x: v5_0, label: v5_1 } = e;
            dataView(memory0).setInt32((base) + 0, toInt32(v5_0), true);
            
            var encodeRes = _utf8AllocateAndEncode(v5_1, realloc0, memory0);
            var ptr6= encodeRes.ptr;
            var len6 = encodeRes.len;
            
            dataView(memory0).setUint32((base) + 8, len6, true);
            dataView(memory0).setUint32((base) + 4, ptr6, true);
          }
          dataView(memory0).setUint32((ptr0) + 36, len7, true);
          dataView(memory0).setUint32((ptr0) + 32, result7, true);
          var vec13 = v1_5;
          var len13 = vec13.length;
          var result13 = realloc0(0, 0, 8, len13 * 16);
          if (result13 < 0 || len13 < 0 || len13 > 16777215 || result13 > memory0.buffer.byteLength || len13 > Math.floor((memory0.buffer.byteLength - result13) / 16)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
          for (let i = 0; i < vec13.length; i++) {
            const e = vec13[i];
            const base = result13 + i * 16;var variant12 = e;
            switch (variant12.tag) {
              case 'none': {
                dataView(memory0).setInt8((base) + 0, 0, true);
                break;
              }
              case 'number': {
                const e = variant12.val;
                dataView(memory0).setInt8((base) + 0, 1, true);
                dataView(memory0).setBigInt64((base) + 8, toInt64(e), true);
                break;
              }
              case 'text': {
                const e = variant12.val;
                dataView(memory0).setInt8((base) + 0, 2, true);
                
                var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
                var ptr8= encodeRes.ptr;
                var len8 = encodeRes.len;
                
                dataView(memory0).setUint32((base) + 12, len8, true);
                dataView(memory0).setUint32((base) + 8, ptr8, true);
                break;
              }
              case 'points': {
                const e = variant12.val;
                dataView(memory0).setInt8((base) + 0, 3, true);
                var vec11 = e;
                var len11 = vec11.length;
                var result11 = realloc0(0, 0, 4, len11 * 12);
                if (result11 < 0 || len11 < 0 || len11 > 22369621 || result11 > memory0.buffer.byteLength || len11 > Math.floor((memory0.buffer.byteLength - result11) / 12)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
                for (let i = 0; i < vec11.length; i++) {
                  const e = vec11[i];
                  const base = result11 + i * 12;var {x: v9_0, label: v9_1 } = e;
                  dataView(memory0).setInt32((base) + 0, toInt32(v9_0), true);
                  
                  var encodeRes = _utf8AllocateAndEncode(v9_1, realloc0, memory0);
                  var ptr10= encodeRes.ptr;
                  var len10 = encodeRes.len;
                  
                  dataView(memory0).setUint32((base) + 8, len10, true);
                  dataView(memory0).setUint32((base) + 4, ptr10, true);
                }
                dataView(memory0).setUint32((base) + 12, len11, true);
                dataView(memory0).setUint32((base) + 8, result11, true);
                break;
              }
              default: {
                throw new TypeError(`invalid variant tag value \`${JSON.stringify(variant12.tag)}\` (received \`${variant12}\`) specified for \`Choice\``);
              }
            }
          }
          dataView(memory0).setUint32((ptr0) + 44, len13, true);
          dataView(memory0).setUint32((ptr0) + 40, result13, true);
          var variant16 = v1_6;
          switch (variant16.tag) {
            case 'none': {
              dataView(memory0).setInt8((ptr0) + 48, 0, true);
              
              break;
            }
            case 'some': {
              const e = variant16.val;
              dataView(memory0).setInt8((ptr0) + 48, 1, true);
              var variant15 = e;
              if (variant15 === null || variant15=== undefined) {
                dataView(memory0).setInt8((ptr0) + 52, 0, true);
              } else {
                const e = variant15;
                dataView(memory0).setInt8((ptr0) + 52, 1, true);
                
                var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
                var ptr14= encodeRes.ptr;
                var len14 = encodeRes.len;
                
                dataView(memory0).setUint32((ptr0) + 60, len14, true);
                dataView(memory0).setUint32((ptr0) + 56, ptr14, true);
              }
              
              break;
            }
            default: {
              _debugLog("ERROR: invalid value (expected option as object with 'tag' member)", { value: variant16, valueType: typeof variant16});
              throw new TypeError('invalid variant specified for option');
            }
          }
          var vec19 = v1_7;
          var len19 = vec19.length;
          var result19 = realloc0(0, 0, 4, len19 * 12);
          if (result19 < 0 || len19 < 0 || len19 > 22369621 || result19 > memory0.buffer.byteLength || len19 > Math.floor((memory0.buffer.byteLength - result19) / 12)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
          for (let i = 0; i < vec19.length; i++) {
            const e = vec19[i];
            const base = result19 + i * 12;var variant18 = e;
            switch (variant18.tag) {
              case 'ok': {
                const e = variant18.val;
                dataView(memory0).setInt8((base) + 0, 0, true);
                dataView(memory0).setInt32((base) + 4, toUint32(e), true);
                
                break;
              }
              case 'err': {
                const e = variant18.val;
                dataView(memory0).setInt8((base) + 0, 1, true);
                
                var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
                var ptr17= encodeRes.ptr;
                var len17 = encodeRes.len;
                
                dataView(memory0).setUint32((base) + 8, len17, true);
                dataView(memory0).setUint32((base) + 4, ptr17, true);
                
                break;
              }
              default: {
                _debugLog("ERROR: invalid value (expected result as object with 'tag' member)", { value: variant18, valueType: typeof variant18});
                throw new TypeError('invalid variant specified for result');
              }
            }
          }
          dataView(memory0).setUint32((ptr0) + 68, len19, true);
          dataView(memory0).setUint32((ptr0) + 64, result19, true);
          var [tuple20_0, tuple20_1] = v1_8;
          dataView(memory0).setFloat64((ptr0) + 72, +tuple20_0, true);
          
          var encodeRes = _utf8AllocateAndEncode(tuple20_1, realloc0, memory0);
          var ptr21= encodeRes.ptr;
          var len21 = encodeRes.len;
          
          dataView(memory0).setUint32((ptr0) + 84, len21, true);
          dataView(memory0).setUint32((ptr0) + 80, ptr21, true);
          var val22 = v1_9;
          let enum22;
          switch (val22) {
            case 'red': {
              enum22 = 0;
              break;
            }
            case 'green': {
              enum22 = 1;
              break;
            }
            case 'blue': {
              enum22 = 2;
              break;
            }
            default: {
              if ((v1_9) instanceof Error) {
                console.error(v1_9);
              }
              
              throw new TypeError(`"${val22}" is not one of the cases of shade`);
            }
          }
          dataView(memory0).setInt8((ptr0) + 88, enum22, true);
          var val23 = v1_10;
          var len23 = Array.isArray(val23) ? val23.length : val23.byteLength;
          var ptr23 = realloc0(0, 0, 1, len23 * 1);
          
          let valData23;
          const valLenBytes23 = len23 * 1;
          if (Array.isArray(val23)) {
            // Regular array likely containing numbers, write values to memory
            let offset = 0;
            const dv23 = new DataView(memory0.buffer);
            for (const v of val23) {
              _requireValidNumericPrimitive.bind(null, 'u8')(v);
              dv23.setUint8(ptr23+ offset, v, true);
              offset += 1;
            }
          } else {
            // TypedArray / ArrayBuffer-like, direct copy
            valData23 = new Uint8Array(val23.buffer || val23, val23.byteOffset, valLenBytes23);
            const out23 = new Uint8Array(memory0.buffer, ptr23, valLenBytes23);
            out23.set(valData23);
          }
          
          dataView(memory0).setUint32((ptr0) + 96, len23, true);
          dataView(memory0).setUint32((ptr0) + 92, ptr23, true);
          _debugLog('[iface="inspect-packet", function="inspect-packet"][Instruction::CallWasm] enter', {
            funcName: 'inspect-packet',
            paramCount: 1,
            async: false,
            postReturn: true,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1InspectPacket(ptr0),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          var ptr24 = dataView(memory0).getUint32(((ret >>> 0)) + 0, true) >>> 0;
          var len24 = dataView(memory0).getUint32(((ret >>> 0)) + 4, true);
          var result24 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr24, len24));
          _debugLog('[iface="inspect-packet", function="inspect-packet"][Instruction::Return]', {
            funcName: 'inspect-packet',
            paramCount: 1,
            async: false,
            postReturn: true
          });
          task.resolve([result24]);
          const retCopy = result24;
          
          let cstate = getOrCreateAsyncState(0);
          cstate.mayLeave = false;
          postReturn0(ret);
          cstate.mayLeave = true;
          task.exit();
          return retCopy;
          
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  let exports1ThroughHost;
  
  function throughHost(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1ThroughHost',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (0!== null) {
      task.setReturnMemoryIdx(0);
      task.setReturnMemory((() => memory0)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          var ptr0 = realloc0(0, 0, 8, 104);
          var {id: v1_0, name: v1_1, enabled: v1_2, anchor: v1_3, values: v1_4, choices: v1_5, optional: v1_6, verdicts: v1_7, pair: v1_8, shade: v1_9, bytes: v1_10 } = arg0;
          dataView(memory0).setBigInt64((ptr0) + 0, toUint64(v1_0), true);
          
          var encodeRes = _utf8AllocateAndEncode(v1_1, realloc0, memory0);
          var ptr2= encodeRes.ptr;
          var len2 = encodeRes.len;
          
          dataView(memory0).setUint32((ptr0) + 12, len2, true);
          dataView(memory0).setUint32((ptr0) + 8, ptr2, true);
          dataView(memory0).setInt8((ptr0) + 16, v1_2 ? 1 : 0, true);
          var {x: v3_0, label: v3_1 } = v1_3;
          dataView(memory0).setInt32((ptr0) + 20, toInt32(v3_0), true);
          
          var encodeRes = _utf8AllocateAndEncode(v3_1, realloc0, memory0);
          var ptr4= encodeRes.ptr;
          var len4 = encodeRes.len;
          
          dataView(memory0).setUint32((ptr0) + 28, len4, true);
          dataView(memory0).setUint32((ptr0) + 24, ptr4, true);
          var vec7 = v1_4;
          var len7 = vec7.length;
          var result7 = realloc0(0, 0, 4, len7 * 12);
          if (result7 < 0 || len7 < 0 || len7 > 22369621 || result7 > memory0.buffer.byteLength || len7 > Math.floor((memory0.buffer.byteLength - result7) / 12)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
          for (let i = 0; i < vec7.length; i++) {
            const e = vec7[i];
            const base = result7 + i * 12;var {x: v5_0, label: v5_1 } = e;
            dataView(memory0).setInt32((base) + 0, toInt32(v5_0), true);
            
            var encodeRes = _utf8AllocateAndEncode(v5_1, realloc0, memory0);
            var ptr6= encodeRes.ptr;
            var len6 = encodeRes.len;
            
            dataView(memory0).setUint32((base) + 8, len6, true);
            dataView(memory0).setUint32((base) + 4, ptr6, true);
          }
          dataView(memory0).setUint32((ptr0) + 36, len7, true);
          dataView(memory0).setUint32((ptr0) + 32, result7, true);
          var vec13 = v1_5;
          var len13 = vec13.length;
          var result13 = realloc0(0, 0, 8, len13 * 16);
          if (result13 < 0 || len13 < 0 || len13 > 16777215 || result13 > memory0.buffer.byteLength || len13 > Math.floor((memory0.buffer.byteLength - result13) / 16)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
          for (let i = 0; i < vec13.length; i++) {
            const e = vec13[i];
            const base = result13 + i * 16;var variant12 = e;
            switch (variant12.tag) {
              case 'none': {
                dataView(memory0).setInt8((base) + 0, 0, true);
                break;
              }
              case 'number': {
                const e = variant12.val;
                dataView(memory0).setInt8((base) + 0, 1, true);
                dataView(memory0).setBigInt64((base) + 8, toInt64(e), true);
                break;
              }
              case 'text': {
                const e = variant12.val;
                dataView(memory0).setInt8((base) + 0, 2, true);
                
                var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
                var ptr8= encodeRes.ptr;
                var len8 = encodeRes.len;
                
                dataView(memory0).setUint32((base) + 12, len8, true);
                dataView(memory0).setUint32((base) + 8, ptr8, true);
                break;
              }
              case 'points': {
                const e = variant12.val;
                dataView(memory0).setInt8((base) + 0, 3, true);
                var vec11 = e;
                var len11 = vec11.length;
                var result11 = realloc0(0, 0, 4, len11 * 12);
                if (result11 < 0 || len11 < 0 || len11 > 22369621 || result11 > memory0.buffer.byteLength || len11 > Math.floor((memory0.buffer.byteLength - result11) / 12)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
                for (let i = 0; i < vec11.length; i++) {
                  const e = vec11[i];
                  const base = result11 + i * 12;var {x: v9_0, label: v9_1 } = e;
                  dataView(memory0).setInt32((base) + 0, toInt32(v9_0), true);
                  
                  var encodeRes = _utf8AllocateAndEncode(v9_1, realloc0, memory0);
                  var ptr10= encodeRes.ptr;
                  var len10 = encodeRes.len;
                  
                  dataView(memory0).setUint32((base) + 8, len10, true);
                  dataView(memory0).setUint32((base) + 4, ptr10, true);
                }
                dataView(memory0).setUint32((base) + 12, len11, true);
                dataView(memory0).setUint32((base) + 8, result11, true);
                break;
              }
              default: {
                throw new TypeError(`invalid variant tag value \`${JSON.stringify(variant12.tag)}\` (received \`${variant12}\`) specified for \`Choice\``);
              }
            }
          }
          dataView(memory0).setUint32((ptr0) + 44, len13, true);
          dataView(memory0).setUint32((ptr0) + 40, result13, true);
          var variant16 = v1_6;
          switch (variant16.tag) {
            case 'none': {
              dataView(memory0).setInt8((ptr0) + 48, 0, true);
              
              break;
            }
            case 'some': {
              const e = variant16.val;
              dataView(memory0).setInt8((ptr0) + 48, 1, true);
              var variant15 = e;
              if (variant15 === null || variant15=== undefined) {
                dataView(memory0).setInt8((ptr0) + 52, 0, true);
              } else {
                const e = variant15;
                dataView(memory0).setInt8((ptr0) + 52, 1, true);
                
                var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
                var ptr14= encodeRes.ptr;
                var len14 = encodeRes.len;
                
                dataView(memory0).setUint32((ptr0) + 60, len14, true);
                dataView(memory0).setUint32((ptr0) + 56, ptr14, true);
              }
              
              break;
            }
            default: {
              _debugLog("ERROR: invalid value (expected option as object with 'tag' member)", { value: variant16, valueType: typeof variant16});
              throw new TypeError('invalid variant specified for option');
            }
          }
          var vec19 = v1_7;
          var len19 = vec19.length;
          var result19 = realloc0(0, 0, 4, len19 * 12);
          if (result19 < 0 || len19 < 0 || len19 > 22369621 || result19 > memory0.buffer.byteLength || len19 > Math.floor((memory0.buffer.byteLength - result19) / 12)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
          for (let i = 0; i < vec19.length; i++) {
            const e = vec19[i];
            const base = result19 + i * 12;var variant18 = e;
            switch (variant18.tag) {
              case 'ok': {
                const e = variant18.val;
                dataView(memory0).setInt8((base) + 0, 0, true);
                dataView(memory0).setInt32((base) + 4, toUint32(e), true);
                
                break;
              }
              case 'err': {
                const e = variant18.val;
                dataView(memory0).setInt8((base) + 0, 1, true);
                
                var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
                var ptr17= encodeRes.ptr;
                var len17 = encodeRes.len;
                
                dataView(memory0).setUint32((base) + 8, len17, true);
                dataView(memory0).setUint32((base) + 4, ptr17, true);
                
                break;
              }
              default: {
                _debugLog("ERROR: invalid value (expected result as object with 'tag' member)", { value: variant18, valueType: typeof variant18});
                throw new TypeError('invalid variant specified for result');
              }
            }
          }
          dataView(memory0).setUint32((ptr0) + 68, len19, true);
          dataView(memory0).setUint32((ptr0) + 64, result19, true);
          var [tuple20_0, tuple20_1] = v1_8;
          dataView(memory0).setFloat64((ptr0) + 72, +tuple20_0, true);
          
          var encodeRes = _utf8AllocateAndEncode(tuple20_1, realloc0, memory0);
          var ptr21= encodeRes.ptr;
          var len21 = encodeRes.len;
          
          dataView(memory0).setUint32((ptr0) + 84, len21, true);
          dataView(memory0).setUint32((ptr0) + 80, ptr21, true);
          var val22 = v1_9;
          let enum22;
          switch (val22) {
            case 'red': {
              enum22 = 0;
              break;
            }
            case 'green': {
              enum22 = 1;
              break;
            }
            case 'blue': {
              enum22 = 2;
              break;
            }
            default: {
              if ((v1_9) instanceof Error) {
                console.error(v1_9);
              }
              
              throw new TypeError(`"${val22}" is not one of the cases of shade`);
            }
          }
          dataView(memory0).setInt8((ptr0) + 88, enum22, true);
          var val23 = v1_10;
          var len23 = Array.isArray(val23) ? val23.length : val23.byteLength;
          var ptr23 = realloc0(0, 0, 1, len23 * 1);
          
          let valData23;
          const valLenBytes23 = len23 * 1;
          if (Array.isArray(val23)) {
            // Regular array likely containing numbers, write values to memory
            let offset = 0;
            const dv23 = new DataView(memory0.buffer);
            for (const v of val23) {
              _requireValidNumericPrimitive.bind(null, 'u8')(v);
              dv23.setUint8(ptr23+ offset, v, true);
              offset += 1;
            }
          } else {
            // TypedArray / ArrayBuffer-like, direct copy
            valData23 = new Uint8Array(val23.buffer || val23, val23.byteOffset, valLenBytes23);
            const out23 = new Uint8Array(memory0.buffer, ptr23, valLenBytes23);
            out23.set(valData23);
          }
          
          dataView(memory0).setUint32((ptr0) + 96, len23, true);
          dataView(memory0).setUint32((ptr0) + 92, ptr23, true);
          _debugLog('[iface="through-host", function="through-host"][Instruction::CallWasm] enter', {
            funcName: 'through-host',
            paramCount: 1,
            async: false,
            postReturn: true,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1ThroughHost(ptr0),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          var ptr24 = dataView(memory0).getUint32(((ret >>> 0)) + 8, true) >>> 0;
          var len24 = dataView(memory0).getUint32(((ret >>> 0)) + 12, true);
          var result24 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr24, len24));
          var bool25 = dataView(memory0).getUint8(((ret >>> 0)) + 16, true);
          var ptr26 = dataView(memory0).getUint32(((ret >>> 0)) + 24, true) >>> 0;
          var len26 = dataView(memory0).getUint32(((ret >>> 0)) + 28, true);
          var result26 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr26, len26));
          var len28 = dataView(memory0).getUint32(((ret >>> 0)) + 36, true);
          var base28 = dataView(memory0).getUint32(((ret >>> 0)) + 32, true) >>> 0;
          if (base28 < 0 || len28 < 0 || len28 > 22369621 || base28 > memory0.buffer.byteLength || len28 > Math.floor((memory0.buffer.byteLength - base28) / 12)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
          if (base28 % 4 !== 0) throw new TypeError(`list pointer [${base28}] is not aligned to 4`);
          var result28 = [];
          for (let i = 0; i < len28; i++) {
            const base = base28 + i * 12;
            var ptr27 = dataView(memory0).getUint32((base) + 4, true) >>> 0;
            var len27 = dataView(memory0).getUint32((base) + 8, true);
            var result27 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr27, len27));
            result28.push({
              x: dataView(memory0).getInt32((base) + 0, true),
              label: result27,
            });
          }
          var len33 = dataView(memory0).getUint32(((ret >>> 0)) + 44, true);
          var base33 = dataView(memory0).getUint32(((ret >>> 0)) + 40, true) >>> 0;
          if (base33 < 0 || len33 < 0 || len33 > 16777215 || base33 > memory0.buffer.byteLength || len33 > Math.floor((memory0.buffer.byteLength - base33) / 16)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
          if (base33 % 8 !== 0) throw new TypeError(`list pointer [${base33}] is not aligned to 8`);
          var result33 = [];
          for (let i = 0; i < len33; i++) {
            const base = base33 + i * 16;
            let variant32;
            switch (dataView(memory0).getUint8((base) + 0, true)) {
              case 0: {
                variant32= {
                  tag: 'none',
                };
                break;
              }
              case 1: {
                variant32= {
                  tag: 'number',
                  val: dataView(memory0).getBigInt64((base) + 8, true)
                };
                break;
              }
              case 2: {
                var ptr29 = dataView(memory0).getUint32((base) + 8, true) >>> 0;
                var len29 = dataView(memory0).getUint32((base) + 12, true);
                var result29 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr29, len29));
                variant32= {
                  tag: 'text',
                  val: result29
                };
                break;
              }
              case 3: {
                var len31 = dataView(memory0).getUint32((base) + 12, true);
                var base31 = dataView(memory0).getUint32((base) + 8, true) >>> 0;
                if (base31 < 0 || len31 < 0 || len31 > 22369621 || base31 > memory0.buffer.byteLength || len31 > Math.floor((memory0.buffer.byteLength - base31) / 12)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
                if (base31 % 4 !== 0) throw new TypeError(`list pointer [${base31}] is not aligned to 4`);
                var result31 = [];
                for (let i = 0; i < len31; i++) {
                  const base = base31 + i * 12;
                  var ptr30 = dataView(memory0).getUint32((base) + 4, true) >>> 0;
                  var len30 = dataView(memory0).getUint32((base) + 8, true);
                  var result30 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr30, len30));
                  result31.push({
                    x: dataView(memory0).getInt32((base) + 0, true),
                    label: result30,
                  });
                }
                variant32= {
                  tag: 'points',
                  val: result31
                };
                break;
              }
              default: {
                throw new TypeError('invalid variant discriminant for Choice');
              }
            }
            result33.push(variant32);
          }
          let variant36;
          switch (dataView(memory0).getUint8(((ret >>> 0)) + 48, true)) {
            case 0: {
              variant36 = { tag: 'none' };
              break;
            }
            case 1: {
              let variant35;
              switch (dataView(memory0).getUint8(((ret >>> 0)) + 52, true)) {
                case 0: {
                  variant35 = undefined;
                  break;
                }
                case 1: {
                  var ptr34 = dataView(memory0).getUint32(((ret >>> 0)) + 56, true) >>> 0;
                  var len34 = dataView(memory0).getUint32(((ret >>> 0)) + 60, true);
                  var result34 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr34, len34));
                  variant35 = result34;
                  break;
                }
                default: {
                  throw new TypeError('invalid variant discriminant for option');
                }
              }
              variant36 = {
                tag: 'some',
                val: variant35
              };
              break;
            }
            default: {
              throw new TypeError('invalid variant discriminant for option');
            }
          }
          var len39 = dataView(memory0).getUint32(((ret >>> 0)) + 68, true);
          var base39 = dataView(memory0).getUint32(((ret >>> 0)) + 64, true) >>> 0;
          if (base39 < 0 || len39 < 0 || len39 > 22369621 || base39 > memory0.buffer.byteLength || len39 > Math.floor((memory0.buffer.byteLength - base39) / 12)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
          if (base39 % 4 !== 0) throw new TypeError(`list pointer [${base39}] is not aligned to 4`);
          var result39 = [];
          for (let i = 0; i < len39; i++) {
            const base = base39 + i * 12;
            let variant38;
            switch (dataView(memory0).getUint8((base) + 0, true)) {
              case 0: {
                variant38= {
                  tag: 'ok',
                  val: dataView(memory0).getInt32((base) + 4, true) >>> 0
                };
                break;
              }
              case 1: {
                var ptr37 = dataView(memory0).getUint32((base) + 4, true) >>> 0;
                var len37 = dataView(memory0).getUint32((base) + 8, true);
                var result37 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr37, len37));
                variant38= {
                  tag: 'err',
                  val: result37
                };
                break;
              }
              default: {
                throw new TypeError('invalid variant discriminant for expected');
              }
            }
            result39.push(variant38);
          }
          var ptr40 = dataView(memory0).getUint32(((ret >>> 0)) + 80, true) >>> 0;
          var len40 = dataView(memory0).getUint32(((ret >>> 0)) + 84, true);
          var result40 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr40, len40));
          let enum41;
          switch (dataView(memory0).getUint8(((ret >>> 0)) + 88, true)) {
            case 0: {
              enum41 = 'red';
              break;
            }
            case 1: {
              enum41 = 'green';
              break;
            }
            case 2: {
              enum41 = 'blue';
              break;
            }
            default: {
              throw new TypeError('invalid discriminant specified for Shade');
            }
          }
          var ptr42 = dataView(memory0).getUint32(((ret >>> 0)) + 92, true) >>> 0;
          var len42 = dataView(memory0).getUint32(((ret >>> 0)) + 96, true);
          if (ptr42 < 0 || len42 < 0 || len42 > 268435455 || ptr42 > memory0.buffer.byteLength || len42 > Math.floor((memory0.buffer.byteLength - ptr42) / 1)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
          if (ptr42 % 1 !== 0) throw new TypeError(`list pointer [${ptr42}] is not aligned to 1`);
          var result42 = new Uint8Array(memory0.buffer.slice(ptr42, ptr42 + len42 * 1));
          _debugLog('[iface="through-host", function="through-host"][Instruction::Return]', {
            funcName: 'through-host',
            paramCount: 1,
            async: false,
            postReturn: true
          });
          task.resolve([{
            id: BigInt.asUintN(64, BigInt(dataView(memory0).getBigInt64(((ret >>> 0)) + 0, true))),
            name: result24,
            enabled: bool25 == 0 ? false : (bool25 == 1 ? true : throwInvalidBool()),
            anchor: {
              x: dataView(memory0).getInt32(((ret >>> 0)) + 20, true),
              label: result26,
            },
            values: result28,
            choices: result33,
            optional: variant36,
            verdicts: result39,
            pair: [dataView(memory0).getFloat64(((ret >>> 0)) + 72, true), result40],
            shade: enum41,
            bytes: result42,
          }]);
          const retCopy = {
            id: BigInt.asUintN(64, BigInt(dataView(memory0).getBigInt64(((ret >>> 0)) + 0, true))),
            name: result24,
            enabled: bool25 == 0 ? false : (bool25 == 1 ? true : throwInvalidBool()),
            anchor: {
              x: dataView(memory0).getInt32(((ret >>> 0)) + 20, true),
              label: result26,
            },
            values: result28,
            choices: result33,
            optional: variant36,
            verdicts: result39,
            pair: [dataView(memory0).getFloat64(((ret >>> 0)) + 72, true), result40],
            shade: enum41,
            bytes: result42,
          };
          
          let cstate = getOrCreateAsyncState(0);
          cstate.mayLeave = false;
          postReturn7(ret);
          cstate.mayLeave = true;
          task.exit();
          return retCopy;
          
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  let exports1EchoTuple;
  
  function echoTuple(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1EchoTuple',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (0!== null) {
      task.setReturnMemoryIdx(0);
      task.setReturnMemory((() => memory0)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          var [tuple0_0, tuple0_1, tuple0_2, tuple0_3] = arg0;
          
          var encodeRes = _utf8AllocateAndEncode(tuple0_1, realloc0, memory0);
          var ptr1= encodeRes.ptr;
          var len1 = encodeRes.len;
          
          var val2 = tuple0_3;
          var len2 = val2.length;
          var ptr2 = realloc0(0, 0, 2, len2 * 2);
          
          let valData2;
          const valLenBytes2 = len2 * 2;
          if (Array.isArray(val2)) {
            // Regular array likely containing numbers, write values to memory
            let offset = 0;
            const dv2 = new DataView(memory0.buffer);
            for (const v of val2) {
              _requireValidNumericPrimitive.bind(null, 'u16')(v);
              dv2.setUint16(ptr2+ offset, v, true);
              offset += 2;
            }
          } else {
            // TypedArray / ArrayBuffer-like, direct copy
            valData2 = new Uint8Array(val2.buffer || val2, val2.byteOffset, valLenBytes2);
            const out2 = new Uint8Array(memory0.buffer, ptr2, valLenBytes2);
            out2.set(valData2);
          }
          
          _debugLog('[iface="echo-tuple", function="echo-tuple"][Instruction::CallWasm] enter', {
            funcName: 'echo-tuple',
            paramCount: 6,
            async: false,
            postReturn: true,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1EchoTuple(toInt64(tuple0_0), ptr1, len1, tuple0_2 ? 1 : 0, ptr2, len2),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          var ptr3 = dataView(memory0).getUint32(((ret >>> 0)) + 8, true) >>> 0;
          var len3 = dataView(memory0).getUint32(((ret >>> 0)) + 12, true);
          var result3 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr3, len3));
          var bool4 = dataView(memory0).getUint8(((ret >>> 0)) + 16, true);
          var ptr5 = dataView(memory0).getUint32(((ret >>> 0)) + 20, true) >>> 0;
          var len5 = dataView(memory0).getUint32(((ret >>> 0)) + 24, true);
          if (ptr5 < 0 || len5 < 0 || len5 > 134217727 || ptr5 > memory0.buffer.byteLength || len5 > Math.floor((memory0.buffer.byteLength - ptr5) / 2)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
          if (ptr5 % 2 !== 0) throw new TypeError(`list pointer [${ptr5}] is not aligned to 2`);
          var result5 = new Uint16Array(memory0.buffer.slice(ptr5, ptr5 + len5 * 2));
          _debugLog('[iface="echo-tuple", function="echo-tuple"][Instruction::Return]', {
            funcName: 'echo-tuple',
            paramCount: 1,
            async: false,
            postReturn: true
          });
          task.resolve([[dataView(memory0).getBigInt64(((ret >>> 0)) + 0, true), result3, bool4 == 0 ? false : (bool4 == 1 ? true : throwInvalidBool()), result5]]);
          const retCopy = [dataView(memory0).getBigInt64(((ret >>> 0)) + 0, true), result3, bool4 == 0 ? false : (bool4 == 1 ? true : throwInvalidBool()), result5];
          
          let cstate = getOrCreateAsyncState(0);
          cstate.mayLeave = false;
          postReturn8(ret);
          cstate.mayLeave = true;
          task.exit();
          return retCopy;
          
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  let exports1EchoNested;
  
  function echoNested(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1EchoNested',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (0!== null) {
      task.setReturnMemoryIdx(0);
      task.setReturnMemory((() => memory0)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          var vec3 = arg0;
          var len3 = vec3.length;
          var result3 = realloc0(0, 0, 4, len3 * 8);
          if (result3 < 0 || len3 < 0 || len3 > 33554431 || result3 > memory0.buffer.byteLength || len3 > Math.floor((memory0.buffer.byteLength - result3) / 8)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
          for (let i = 0; i < vec3.length; i++) {
            const e = vec3[i];
            const base = result3 + i * 8;var vec2 = e;
            var len2 = vec2.length;
            var result2 = realloc0(0, 0, 4, len2 * 12);
            if (result2 < 0 || len2 < 0 || len2 > 22369621 || result2 > memory0.buffer.byteLength || len2 > Math.floor((memory0.buffer.byteLength - result2) / 12)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
            for (let i = 0; i < vec2.length; i++) {
              const e = vec2[i];
              const base = result2 + i * 12;var {x: v0_0, label: v0_1 } = e;
              dataView(memory0).setInt32((base) + 0, toInt32(v0_0), true);
              
              var encodeRes = _utf8AllocateAndEncode(v0_1, realloc0, memory0);
              var ptr1= encodeRes.ptr;
              var len1 = encodeRes.len;
              
              dataView(memory0).setUint32((base) + 8, len1, true);
              dataView(memory0).setUint32((base) + 4, ptr1, true);
            }
            dataView(memory0).setUint32((base) + 4, len2, true);
            dataView(memory0).setUint32((base) + 0, result2, true);
          }
          _debugLog('[iface="echo-nested", function="echo-nested"][Instruction::CallWasm] enter', {
            funcName: 'echo-nested',
            paramCount: 2,
            async: false,
            postReturn: true,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1EchoNested(result3, len3),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          var len6 = dataView(memory0).getUint32(((ret >>> 0)) + 4, true);
          var base6 = dataView(memory0).getUint32(((ret >>> 0)) + 0, true) >>> 0;
          if (base6 < 0 || len6 < 0 || len6 > 33554431 || base6 > memory0.buffer.byteLength || len6 > Math.floor((memory0.buffer.byteLength - base6) / 8)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
          if (base6 % 4 !== 0) throw new TypeError(`list pointer [${base6}] is not aligned to 4`);
          var result6 = [];
          for (let i = 0; i < len6; i++) {
            const base = base6 + i * 8;
            var len5 = dataView(memory0).getUint32((base) + 4, true);
            var base5 = dataView(memory0).getUint32((base) + 0, true) >>> 0;
            if (base5 < 0 || len5 < 0 || len5 > 22369621 || base5 > memory0.buffer.byteLength || len5 > Math.floor((memory0.buffer.byteLength - base5) / 12)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
            if (base5 % 4 !== 0) throw new TypeError(`list pointer [${base5}] is not aligned to 4`);
            var result5 = [];
            for (let i = 0; i < len5; i++) {
              const base = base5 + i * 12;
              var ptr4 = dataView(memory0).getUint32((base) + 4, true) >>> 0;
              var len4 = dataView(memory0).getUint32((base) + 8, true);
              var result4 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr4, len4));
              result5.push({
                x: dataView(memory0).getInt32((base) + 0, true),
                label: result4,
              });
            }
            result6.push(result5);
          }
          _debugLog('[iface="echo-nested", function="echo-nested"][Instruction::Return]', {
            funcName: 'echo-nested',
            paramCount: 1,
            async: false,
            postReturn: true
          });
          task.resolve([result6]);
          const retCopy = result6;
          
          let cstate = getOrCreateAsyncState(0);
          cstate.mayLeave = false;
          postReturn9(ret);
          cstate.mayLeave = true;
          task.exit();
          return retCopy;
          
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  let exports1EchoOption;
  
  function echoOption(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1EchoOption',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (0!== null) {
      task.setReturnMemoryIdx(0);
      task.setReturnMemory((() => memory0)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          var variant2 = arg0;
          let variant2_0;
          let variant2_1;
          let variant2_2;
          let variant2_3;
          switch (variant2.tag) {
            case 'none': {
              variant2_0 = 0;
              variant2_1 = 0;
              variant2_2 = 0;
              variant2_3 = 0;
              
              break;
            }
            case 'some': {
              const e = variant2.val;
              var variant1 = e;
              let variant1_0;
              let variant1_1;
              let variant1_2;
              if (variant1 === null || variant1=== undefined) {
                variant1_0 = 0;
                variant1_1 = 0;
                variant1_2 = 0;
              } else {
                const e = variant1;
                
                var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
                var ptr0= encodeRes.ptr;
                var len0 = encodeRes.len;
                
                variant1_0 = 1;
                variant1_1 = ptr0;
                variant1_2 = len0;
              }
              variant2_0 = 1;
              variant2_1 = variant1_0;
              variant2_2 = variant1_1;
              variant2_3 = variant1_2;
              
              break;
            }
            default: {
              _debugLog("ERROR: invalid value (expected option as object with 'tag' member)", { value: variant2, valueType: typeof variant2});
              throw new TypeError('invalid variant specified for option');
            }
          }
          _debugLog('[iface="echo-option", function="echo-option"][Instruction::CallWasm] enter', {
            funcName: 'echo-option',
            paramCount: 4,
            async: false,
            postReturn: true,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1EchoOption(variant2_0, variant2_1, variant2_2, variant2_3),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          let variant5;
          switch (dataView(memory0).getUint8(((ret >>> 0)) + 0, true)) {
            case 0: {
              variant5 = { tag: 'none' };
              break;
            }
            case 1: {
              let variant4;
              switch (dataView(memory0).getUint8(((ret >>> 0)) + 4, true)) {
                case 0: {
                  variant4 = undefined;
                  break;
                }
                case 1: {
                  var ptr3 = dataView(memory0).getUint32(((ret >>> 0)) + 8, true) >>> 0;
                  var len3 = dataView(memory0).getUint32(((ret >>> 0)) + 12, true);
                  var result3 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr3, len3));
                  variant4 = result3;
                  break;
                }
                default: {
                  throw new TypeError('invalid variant discriminant for option');
                }
              }
              variant5 = {
                tag: 'some',
                val: variant4
              };
              break;
            }
            default: {
              throw new TypeError('invalid variant discriminant for option');
            }
          }
          _debugLog('[iface="echo-option", function="echo-option"][Instruction::Return]', {
            funcName: 'echo-option',
            paramCount: 1,
            async: false,
            postReturn: true
          });
          task.resolve([variant5]);
          const retCopy = variant5;
          
          let cstate = getOrCreateAsyncState(0);
          cstate.mayLeave = false;
          postReturn10(ret);
          cstate.mayLeave = true;
          task.exit();
          return retCopy;
          
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  let exports1EchoResult;
  
  function echoResult(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1EchoResult',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'throw-result-err',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (0!== null) {
      task.setReturnMemoryIdx(0);
      task.setReturnMemory((() => memory0)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          var variant7 = arg0;
          let variant7_0;
          let variant7_1;
          let variant7_2;
          let variant7_3;
          switch (variant7.tag) {
            case 'ok': {
              const e = variant7.val;
              var variant1 = e;
              let variant1_0;
              let variant1_1;
              let variant1_2;
              if (variant1 === null || variant1=== undefined) {
                variant1_0 = 0;
                variant1_1 = 0;
                variant1_2 = 0;
              } else {
                const e = variant1;
                
                var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
                var ptr0= encodeRes.ptr;
                var len0 = encodeRes.len;
                
                variant1_0 = 1;
                variant1_1 = ptr0;
                variant1_2 = len0;
              }
              variant7_0 = 0;
              variant7_1 = variant1_0;
              variant7_2 = BigInt(variant1_1);
              variant7_3 = variant1_2;
              
              break;
            }
            case 'err': {
              const e = variant7.val;
              var variant6 = e;
              let variant6_0;
              let variant6_1;
              let variant6_2;
              switch (variant6.tag) {
                case 'none': {
                  variant6_0 = 0;
                  variant6_1 = 0n;
                  variant6_2 = 0;
                  break;
                }
                case 'number': {
                  const e = variant6.val;
                  variant6_0 = 1;
                  variant6_1 = BigInt(toInt64(e));
                  variant6_2 = 0;
                  break;
                }
                case 'text': {
                  const e = variant6.val;
                  
                  var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
                  var ptr2= encodeRes.ptr;
                  var len2 = encodeRes.len;
                  
                  variant6_0 = 2;
                  variant6_1 = BigInt(ptr2);
                  variant6_2 = len2;
                  break;
                }
                case 'points': {
                  const e = variant6.val;
                  var vec5 = e;
                  var len5 = vec5.length;
                  var result5 = realloc0(0, 0, 4, len5 * 12);
                  if (result5 < 0 || len5 < 0 || len5 > 22369621 || result5 > memory0.buffer.byteLength || len5 > Math.floor((memory0.buffer.byteLength - result5) / 12)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
                  for (let i = 0; i < vec5.length; i++) {
                    const e = vec5[i];
                    const base = result5 + i * 12;var {x: v3_0, label: v3_1 } = e;
                    dataView(memory0).setInt32((base) + 0, toInt32(v3_0), true);
                    
                    var encodeRes = _utf8AllocateAndEncode(v3_1, realloc0, memory0);
                    var ptr4= encodeRes.ptr;
                    var len4 = encodeRes.len;
                    
                    dataView(memory0).setUint32((base) + 8, len4, true);
                    dataView(memory0).setUint32((base) + 4, ptr4, true);
                  }
                  variant6_0 = 3;
                  variant6_1 = BigInt(result5);
                  variant6_2 = len5;
                  break;
                }
                default: {
                  throw new TypeError(`invalid variant tag value \`${JSON.stringify(variant6.tag)}\` (received \`${variant6}\`) specified for \`Choice\``);
                }
              }
              variant7_0 = 1;
              variant7_1 = variant6_0;
              variant7_2 = variant6_1;
              variant7_3 = variant6_2;
              
              break;
            }
            default: {
              _debugLog("ERROR: invalid value (expected result as object with 'tag' member)", { value: variant7, valueType: typeof variant7});
              throw new TypeError('invalid variant specified for result');
            }
          }
          _debugLog('[iface="echo-result", function="echo-result"][Instruction::CallWasm] enter', {
            funcName: 'echo-result',
            paramCount: 4,
            async: false,
            postReturn: true,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1EchoResult(variant7_0, variant7_1, variant7_2, variant7_3),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          let variant14;
          switch (dataView(memory0).getUint8(((ret >>> 0)) + 0, true)) {
            case 0: {
              let variant9;
              switch (dataView(memory0).getUint8(((ret >>> 0)) + 8, true)) {
                case 0: {
                  variant9 = undefined;
                  break;
                }
                case 1: {
                  var ptr8 = dataView(memory0).getUint32(((ret >>> 0)) + 12, true) >>> 0;
                  var len8 = dataView(memory0).getUint32(((ret >>> 0)) + 16, true);
                  var result8 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr8, len8));
                  variant9 = result8;
                  break;
                }
                default: {
                  throw new TypeError('invalid variant discriminant for option');
                }
              }
              variant14= {
                tag: 'ok',
                val: variant9
              };
              break;
            }
            case 1: {
              let variant13;
              switch (dataView(memory0).getUint8(((ret >>> 0)) + 8, true)) {
                case 0: {
                  variant13= {
                    tag: 'none',
                  };
                  break;
                }
                case 1: {
                  variant13= {
                    tag: 'number',
                    val: dataView(memory0).getBigInt64(((ret >>> 0)) + 16, true)
                  };
                  break;
                }
                case 2: {
                  var ptr10 = dataView(memory0).getUint32(((ret >>> 0)) + 16, true) >>> 0;
                  var len10 = dataView(memory0).getUint32(((ret >>> 0)) + 20, true);
                  var result10 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr10, len10));
                  variant13= {
                    tag: 'text',
                    val: result10
                  };
                  break;
                }
                case 3: {
                  var len12 = dataView(memory0).getUint32(((ret >>> 0)) + 20, true);
                  var base12 = dataView(memory0).getUint32(((ret >>> 0)) + 16, true) >>> 0;
                  if (base12 < 0 || len12 < 0 || len12 > 22369621 || base12 > memory0.buffer.byteLength || len12 > Math.floor((memory0.buffer.byteLength - base12) / 12)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
                  if (base12 % 4 !== 0) throw new TypeError(`list pointer [${base12}] is not aligned to 4`);
                  var result12 = [];
                  for (let i = 0; i < len12; i++) {
                    const base = base12 + i * 12;
                    var ptr11 = dataView(memory0).getUint32((base) + 4, true) >>> 0;
                    var len11 = dataView(memory0).getUint32((base) + 8, true);
                    var result11 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr11, len11));
                    result12.push({
                      x: dataView(memory0).getInt32((base) + 0, true),
                      label: result11,
                    });
                  }
                  variant13= {
                    tag: 'points',
                    val: result12
                  };
                  break;
                }
                default: {
                  throw new TypeError('invalid variant discriminant for Choice');
                }
              }
              variant14= {
                tag: 'err',
                val: variant13
              };
              break;
            }
            default: {
              throw new TypeError('invalid variant discriminant for expected');
            }
          }
          _debugLog('[iface="echo-result", function="echo-result"][Instruction::Return]', {
            funcName: 'echo-result',
            paramCount: 1,
            async: false,
            postReturn: true
          });
          const retCopy = variant14;
          task.resolve([retCopy.val]);
          
          let cstate = getOrCreateAsyncState(0);
          cstate.mayLeave = false;
          postReturn11(ret);
          cstate.mayLeave = true;
          task.exit();
          
          
          
          if (typeof retCopy === 'object' && retCopy.tag === 'err') {
            throw retCopy.val;
          }
          return retCopy.val;
          
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  let exports1ResultOk;
  
  function resultOk(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1ResultOk',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'throw-result-err',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (0!== null) {
      task.setReturnMemoryIdx(0);
      task.setReturnMemory((() => memory0)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          _debugLog('[iface="result-ok", function="result-ok"][Instruction::CallWasm] enter', {
            funcName: 'result-ok',
            paramCount: 1,
            async: false,
            postReturn: false,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1ResultOk(arg0 ? 1 : 0),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          let variant0;
          switch (dataView(memory0).getUint8(((ret >>> 0)) + 0, true)) {
            case 0: {
              variant0= {
                tag: 'ok',
                val: dataView(memory0).getInt32(((ret >>> 0)) + 4, true) >>> 0
              };
              break;
            }
            case 1: {
              variant0= {
                tag: 'err',
                val: undefined
              };
              break;
            }
            default: {
              throw new TypeError('invalid variant discriminant for expected');
            }
          }
          _debugLog('[iface="result-ok", function="result-ok"][Instruction::Return]', {
            funcName: 'result-ok',
            paramCount: 1,
            async: false,
            postReturn: false
          });
          const retCopy = variant0;
          task.resolve([retCopy.val]);
          task.exit();
          
          if (typeof retCopy === 'object' && retCopy.tag === 'err') {
            throw retCopy.val;
          }
          return retCopy.val;
          
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  let exports1ResultErr;
  
  function resultErr(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1ResultErr',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'throw-result-err',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (0!== null) {
      task.setReturnMemoryIdx(0);
      task.setReturnMemory((() => memory0)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          _debugLog('[iface="result-err", function="result-err"][Instruction::CallWasm] enter', {
            funcName: 'result-err',
            paramCount: 1,
            async: false,
            postReturn: true,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1ResultErr(arg0 ? 1 : 0),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          let variant1;
          switch (dataView(memory0).getUint8(((ret >>> 0)) + 0, true)) {
            case 0: {
              variant1= {
                tag: 'ok',
                val: undefined
              };
              break;
            }
            case 1: {
              var ptr0 = dataView(memory0).getUint32(((ret >>> 0)) + 4, true) >>> 0;
              var len0 = dataView(memory0).getUint32(((ret >>> 0)) + 8, true);
              var result0 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr0, len0));
              variant1= {
                tag: 'err',
                val: result0
              };
              break;
            }
            default: {
              throw new TypeError('invalid variant discriminant for expected');
            }
          }
          _debugLog('[iface="result-err", function="result-err"][Instruction::Return]', {
            funcName: 'result-err',
            paramCount: 1,
            async: false,
            postReturn: true
          });
          const retCopy = variant1;
          task.resolve([retCopy.val]);
          
          let cstate = getOrCreateAsyncState(0);
          cstate.mayLeave = false;
          postReturn12(ret);
          cstate.mayLeave = true;
          task.exit();
          
          
          
          if (typeof retCopy === 'object' && retCopy.tag === 'err') {
            throw retCopy.val;
          }
          return retCopy.val;
          
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  
  function resultUnit(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1EchoBool',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'throw-result-err',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (null!== null) {
      task.setReturnMemoryIdx(null);
      task.setReturnMemory((() => null)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          _debugLog('[iface="result-unit", function="result-unit"][Instruction::CallWasm] enter', {
            funcName: 'result-unit',
            paramCount: 1,
            async: false,
            postReturn: false,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1EchoBool(arg0 ? 1 : 0),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          let variant0;
          switch (ret) {
            case 0: {
              variant0= {
                tag: 'ok',
                val: undefined
              };
              break;
            }
            case 1: {
              variant0= {
                tag: 'err',
                val: undefined
              };
              break;
            }
            default: {
              throw new TypeError('invalid variant discriminant for expected');
            }
          }
          _debugLog('[iface="result-unit", function="result-unit"][Instruction::Return]', {
            funcName: 'result-unit',
            paramCount: 1,
            async: false,
            postReturn: false
          });
          const retCopy = variant0;
          task.resolve([retCopy.val]);
          task.exit();
          
          if (typeof retCopy === 'object' && retCopy.tag === 'err') {
            throw retCopy.val;
          }
          return retCopy.val;
          
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  
  function echoIdentifier(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1EchoIdentifier',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (null!== null) {
      task.setReturnMemoryIdx(null);
      task.setReturnMemory((() => null)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          _debugLog('[iface="echo-identifier", function="echo-identifier"][Instruction::CallWasm] enter', {
            funcName: 'echo-identifier',
            paramCount: 1,
            async: false,
            postReturn: false,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1EchoIdentifier(toUint64(arg0)),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          _debugLog('[iface="echo-identifier", function="echo-identifier"][Instruction::Return]', {
            funcName: 'echo-identifier',
            paramCount: 1,
            async: false,
            postReturn: false
          });
          task.resolve([BigInt.asUintN(64, BigInt(ret))]);
          task.exit();
          return BigInt.asUintN(64, BigInt(ret));
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  
  function charCode(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1CharCode',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (null!== null) {
      task.setReturnMemoryIdx(null);
      task.setReturnMemory((() => null)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          _debugLog('[iface="char-code", function="char-code"][Instruction::CallWasm] enter', {
            funcName: 'char-code',
            paramCount: 1,
            async: false,
            postReturn: false,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1CharCode(validateHostChar(arg0)),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          _debugLog('[iface="char-code", function="char-code"][Instruction::Return]', {
            funcName: 'char-code',
            paramCount: 1,
            async: false,
            postReturn: false
          });
          task.resolve([ret >>> 0]);
          task.exit();
          return ret >>> 0;
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  let exports1StringCodes;
  
  function stringCodes(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1StringCodes',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (0!== null) {
      task.setReturnMemoryIdx(0);
      task.setReturnMemory((() => memory0)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          
          var encodeRes = _utf8AllocateAndEncode(arg0, realloc0, memory0);
          var ptr0= encodeRes.ptr;
          var len0 = encodeRes.len;
          
          _debugLog('[iface="string-codes", function="string-codes"][Instruction::CallWasm] enter', {
            funcName: 'string-codes',
            paramCount: 2,
            async: false,
            postReturn: true,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1StringCodes(ptr0, len0),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          var ptr1 = dataView(memory0).getUint32(((ret >>> 0)) + 0, true) >>> 0;
          var len1 = dataView(memory0).getUint32(((ret >>> 0)) + 4, true);
          if (ptr1 < 0 || len1 < 0 || len1 > 67108863 || ptr1 > memory0.buffer.byteLength || len1 > Math.floor((memory0.buffer.byteLength - ptr1) / 4)) throw new WebAssemblyRuntimeError('wasm trap: out of bounds memory access');
          if (ptr1 % 4 !== 0) throw new TypeError(`list pointer [${ptr1}] is not aligned to 4`);
          var result1 = new Uint32Array(memory0.buffer.slice(ptr1, ptr1 + len1 * 4));
          _debugLog('[iface="string-codes", function="string-codes"][Instruction::Return]', {
            funcName: 'string-codes',
            paramCount: 1,
            async: false,
            postReturn: true
          });
          task.resolve([result1]);
          const retCopy = result1;
          
          let cstate = getOrCreateAsyncState(0);
          cstate.mayLeave = false;
          postReturn3(ret);
          cstate.mayLeave = true;
          task.exit();
          return retCopy;
          
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  let exports1BitsF32;
  
  function bitsF32(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1BitsF32',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (null!== null) {
      task.setReturnMemoryIdx(null);
      task.setReturnMemory((() => null)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          _debugLog('[iface="bits-f32", function="bits-f32"][Instruction::CallWasm] enter', {
            funcName: 'bits-f32',
            paramCount: 1,
            async: false,
            postReturn: false,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1BitsF32(+arg0),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          _debugLog('[iface="bits-f32", function="bits-f32"][Instruction::Return]', {
            funcName: 'bits-f32',
            paramCount: 1,
            async: false,
            postReturn: false
          });
          task.resolve([ret >>> 0]);
          task.exit();
          return ret >>> 0;
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  let exports1BitsF64;
  
  function bitsF64(arg0) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1BitsF64',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (null!== null) {
      task.setReturnMemoryIdx(null);
      task.setReturnMemory((() => null)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          _debugLog('[iface="bits-f64", function="bits-f64"][Instruction::CallWasm] enter', {
            funcName: 'bits-f64',
            paramCount: 1,
            async: false,
            postReturn: false,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1BitsF64(+arg0),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          _debugLog('[iface="bits-f64", function="bits-f64"][Instruction::Return]', {
            funcName: 'bits-f64',
            paramCount: 1,
            async: false,
            postReturn: false
          });
          task.resolve([BigInt.asUintN(64, BigInt(ret))]);
          task.exit();
          return BigInt.asUintN(64, BigInt(ret));
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  let exports1NoArgs;
  
  function noArgs() {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1NoArgs',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (0!== null) {
      task.setReturnMemoryIdx(0);
      task.setReturnMemory((() => memory0)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          _debugLog('[iface="no-args", function="no-args"][Instruction::CallWasm] enter', {
            funcName: 'no-args',
            paramCount: 0,
            async: false,
            postReturn: true,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1NoArgs(),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          var ptr0 = dataView(memory0).getUint32(((ret >>> 0)) + 0, true) >>> 0;
          var len0 = dataView(memory0).getUint32(((ret >>> 0)) + 4, true);
          var result0 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr0, len0));
          _debugLog('[iface="no-args", function="no-args"][Instruction::Return]', {
            funcName: 'no-args',
            paramCount: 1,
            async: false,
            postReturn: true
          });
          task.resolve([result0]);
          const retCopy = result0;
          
          let cstate = getOrCreateAsyncState(0);
          cstate.mayLeave = false;
          postReturn0(ret);
          cstate.mayLeave = true;
          task.exit();
          return retCopy;
          
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  let exports1NoResult;
  
  function noResult() {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1NoResult',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (null!== null) {
      task.setReturnMemoryIdx(null);
      task.setReturnMemory((() => null)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          _debugLog('[iface="no-result", function="no-result"][Instruction::CallWasm] enter', {
            funcName: 'no-result',
            paramCount: 0,
            async: false,
            postReturn: false,
          });
          
          let ret;
          
          try {
            _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1NoResult(),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          _debugLog('[iface="no-result", function="no-result"][Instruction::Return]', {
            funcName: 'no-result',
            paramCount: 0,
            async: false,
            postReturn: false
          });
          task.resolve([ret]);
          task.exit();
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  let exports1Flat16;
  
  function flat16(arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9, arg10, arg11, arg12, arg13, arg14, arg15) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1Flat16',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (null!== null) {
      task.setReturnMemoryIdx(null);
      task.setReturnMemory((() => null)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          _debugLog('[iface="flat-16", function="flat-16"][Instruction::CallWasm] enter', {
            funcName: 'flat-16',
            paramCount: 16,
            async: false,
            postReturn: false,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1Flat16(toUint32(arg0), toUint32(arg1), toUint32(arg2), toUint32(arg3), toUint32(arg4), toUint32(arg5), toUint32(arg6), toUint32(arg7), toUint32(arg8), toUint32(arg9), toUint32(arg10), toUint32(arg11), toUint32(arg12), toUint32(arg13), toUint32(arg14), toUint32(arg15)),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          _debugLog('[iface="flat-16", function="flat-16"][Instruction::Return]', {
            funcName: 'flat-16',
            paramCount: 1,
            async: false,
            postReturn: false
          });
          task.resolve([ret >>> 0]);
          task.exit();
          return ret >>> 0;
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  let exports1Flat17;
  
  function flat17(arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9, arg10, arg11, arg12, arg13, arg14, arg15, arg16) {
    
    const hostProvided = false;
    getOrCreateAsyncState(0).throwIfTrapped();
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      preserveFutureResult: false,
      entryFnName: 'exports1Flat17',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    task.setCalleeIsAsync(false);
    
    const started = task.enterSync();
    CURRENT_TASK_MAY_BLOCK.value = task.mayBlock() ? 1 : 0;
    
    if (0!== null) {
      task.setReturnMemoryIdx(0);
      task.setReturnMemory((() => memory0)());
    }
    
    
    return _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => {
        try {
          
          var ptr0 = realloc0(0, 0, 4, 68);
          dataView(memory0).setInt32((ptr0) + 0, toUint32(arg0), true);
          dataView(memory0).setInt32((ptr0) + 4, toUint32(arg1), true);
          dataView(memory0).setInt32((ptr0) + 8, toUint32(arg2), true);
          dataView(memory0).setInt32((ptr0) + 12, toUint32(arg3), true);
          dataView(memory0).setInt32((ptr0) + 16, toUint32(arg4), true);
          dataView(memory0).setInt32((ptr0) + 20, toUint32(arg5), true);
          dataView(memory0).setInt32((ptr0) + 24, toUint32(arg6), true);
          dataView(memory0).setInt32((ptr0) + 28, toUint32(arg7), true);
          dataView(memory0).setInt32((ptr0) + 32, toUint32(arg8), true);
          dataView(memory0).setInt32((ptr0) + 36, toUint32(arg9), true);
          dataView(memory0).setInt32((ptr0) + 40, toUint32(arg10), true);
          dataView(memory0).setInt32((ptr0) + 44, toUint32(arg11), true);
          dataView(memory0).setInt32((ptr0) + 48, toUint32(arg12), true);
          dataView(memory0).setInt32((ptr0) + 52, toUint32(arg13), true);
          dataView(memory0).setInt32((ptr0) + 56, toUint32(arg14), true);
          dataView(memory0).setInt32((ptr0) + 60, toUint32(arg15), true);
          dataView(memory0).setInt32((ptr0) + 64, toUint32(arg16), true);
          _debugLog('[iface="flat-17", function="flat-17"][Instruction::CallWasm] enter', {
            funcName: 'flat-17',
            paramCount: 1,
            async: false,
            postReturn: false,
          });
          
          let ret;
          
          try {
            ret =  _withGlobalCurrentTaskMeta({
              taskID: task.id(),
              componentIdx: task.componentIdx(),
              fn: () => exports1Flat17(ptr0),
            });
          } catch (err) {
            
            _debugLog('[Instruction::CallWasm] error during sync call', {
              taskID: task.id(),
              err,
            });
            getOrCreateAsyncState(0).markTrapped(err);
            task.setErrored(err);
            task.reject(err);
            task.exit();
            throw err;
            
          }
          
          _debugLog('[iface="flat-17", function="flat-17"][Instruction::Return]', {
            funcName: 'flat-17',
            paramCount: 1,
            async: false,
            postReturn: false
          });
          task.resolve([ret >>> 0]);
          task.exit();
          return ret >>> 0;
          
        } catch (err) {
          if (!task.isResolvedState()) {
            task.setErrored(err);
            task.reject(err);
          }
          if (!task.isExited()) { task.exit({ skipExclusiveLockCheck: true }); }
          throw err;
        }
      },
    });
    
  }
  let trampoline0 = _trampoline0.manuallyAsync ? new WebAssembly.Suspending(_suspendingImport(0, _lowerImportBackwardsCompat.bind(
  null,
  {
    trampolineIdx: 0,
    componentIdx: 0,
    isAsync: false,
    isManualAsync: _trampoline0.manuallyAsync,
    paramLiftFns: [_liftFlatRecord({ fieldMetas: [['id', _liftFlatU64, 8, 8],['name', _liftFlatStringAny, 8, 4],['enabled', _liftFlatBool, 1, 1],['anchor', _liftFlatRecord({ fieldMetas: [['x', _liftFlatS32, 4, 4],['label', _liftFlatStringAny, 8, 4],], size32: 12, align32: 4 }), 12, 4],['values', _liftFlatList({
      elemLiftFn: _liftFlatRecord({ fieldMetas: [['x', _liftFlatS32, 4, 4],['label', _liftFlatStringAny, 8, 4],], size32: 12, align32: 4 }),
      elemAlign32: 4,
      elemSize32: 12,
      typedArray: undefined,
    }), 8, 4],['choices', _liftFlatList({
      elemLiftFn: _liftFlatVariant({
        caseMetas: [['none', null, 0, 0, 0, []],['number', _liftFlatS64, 8, 8, 1, ['i64']],['text', _liftFlatStringAny, 8, 4, 2, ['i32','i32']],['points', _liftFlatList({
          elemLiftFn: _liftFlatRecord({ fieldMetas: [['x', _liftFlatS32, 4, 4],['label', _liftFlatStringAny, 8, 4],], size32: 12, align32: 4 }),
          elemAlign32: 4,
          elemSize32: 12,
          typedArray: undefined,
        }), 8, 4, 2, ['i32','i32']],],
        variantSize32: 16,
        variantAlign32: 8,
        variantPayloadOffset32: 8,
        variantFlatCount: 3,
        variantPayloadFlatTypes: ['i64','i32'],
      } ),
      elemAlign32: 8,
      elemSize32: 16,
      typedArray: undefined,
    }), 8, 4],['optional', 
    _liftFlatOption({
      caseMetas: [
      ['none', null, 0, 0, 0, [] ],
      ['some', 
      _liftFlatOption({
        caseMetas: [
        ['none', null, 0, 0, 0, [] ],
        ['some', _liftFlatStringAny, 8, 4, 2, ['i32','i32'] ],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
        variantPayloadFlatTypes: ['i32','i32'],
        payloadMaybeNull: false,
      })
      , 12, 4, 3, ['i32','i32','i32'] ],
      ],
      variantSize32: 16,
      variantAlign32: 4,
      variantPayloadOffset32: 4,
      variantFlatCount: 4,
      variantPayloadFlatTypes: ['i32','i32','i32'],
      payloadMaybeNull: true,
    })
    , 16, 4],['verdicts', _liftFlatList({
      elemLiftFn: 
      _liftFlatResult({
        caseMetas: [['ok', _liftFlatU32, 4, 4, 1, ['i32']],['err', _liftFlatStringAny, 8, 4, 2, ['i32','i32']],],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
        variantPayloadFlatTypes: ['i32','i32'],
      })
      ,
      elemAlign32: 4,
      elemSize32: 12,
      typedArray: undefined,
    }), 8, 4],['pair', _liftFlatTuple({ elemLiftFns: [[_liftFlatFloat64, 8, 8],[_liftFlatStringAny, 8, 4],], size32: 16, align32: 8 }), 16, 8],['shade', 
    _liftFlatEnum({
      caseMetas: [['red', null, 1, 1, 1],['green', null, 1, 1, 1],['blue', null, 1, 1, 1],],
      variantSize32: 1,
      variantAlign32: 1,
      variantPayloadOffset32: 1,
      variantFlatCount: 1,
    })
    , 1, 1],['bytes', _liftFlatList({
      elemLiftFn: _liftFlatU8,
      elemAlign32: 1,
      elemSize32: 1,
      typedArray: Uint8Array,
    }), 8, 4],], size32: 104, align32: 8 })],
    resultLowerFns: [_lowerFlatRecord({ fieldMetas: [['id', _lowerFlatU64, 8, 8 ],['name', _lowerFlatStringAny, 8, 4 ],['enabled', _lowerFlatBool, 1, 1 ],['anchor', _lowerFlatRecord({ fieldMetas: [['x', _lowerFlatS32, 4, 4 ],['label', _lowerFlatStringAny, 8, 4 ],], size32: 12, align32: 4 }), 12, 4 ],['values', _lowerFlatList({
      elemLowerFn: _lowerFlatRecord({ fieldMetas: [['x', _lowerFlatS32, 4, 4 ],['label', _lowerFlatStringAny, 8, 4 ],], size32: 12, align32: 4 }),
      elemSize32: 12,
      elemAlign32: 4,
    }), 8, 4 ],['choices', _lowerFlatList({
      elemLowerFn: _lowerFlatVariant({
        caseMetas: [[ 'none', null, 0, 0, 0 ],[ 'number', _lowerFlatS64, 8, 8, 1 ],[ 'text', _lowerFlatStringAny, 8, 4, 2 ],[ 'points', _lowerFlatList({
          elemLowerFn: _lowerFlatRecord({ fieldMetas: [['x', _lowerFlatS32, 4, 4 ],['label', _lowerFlatStringAny, 8, 4 ],], size32: 12, align32: 4 }),
          elemSize32: 12,
          elemAlign32: 4,
        }), 8, 4, 2 ],],
        variantSize32: 16,
        variantAlign32: 8,
        variantPayloadOffset32: 8,
        variantFlatCount: 3,
      } ),
      elemSize32: 16,
      elemAlign32: 8,
    }), 8, 4 ],['optional', 
    _lowerFlatOption({
      caseMetas: [
      [ 'none', null, 0, 0, 0 ],
      [ 'some', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatStringAny, 8, 4, 2],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
        payloadMaybeNull: false,
      })
      , 12, 4, 3],
      ],
      variantSize32: 16,
      variantAlign32: 4,
      variantPayloadOffset32: 4,
      variantFlatCount: 4,
      payloadMaybeNull: true,
    })
    , 16, 4 ],['verdicts', _lowerFlatList({
      elemLowerFn: 
      _lowerFlatResult({
        caseMetas: [
        [ 'ok', _lowerFlatU32, 12, 4, 4 ],
        [ 'err', _lowerFlatStringAny, 12, 4, 4 ],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      ,
      elemSize32: 12,
      elemAlign32: 4,
    }), 8, 4 ],['pair', _lowerFlatTuple({ elemLowerMetas: [[_lowerFlatFloat64, 8, 8],[_lowerFlatStringAny, 8, 4],], size32: 16, align32: 8 }), 16, 8 ],['shade', 
    _lowerFlatEnum({
      caseMetas: [['red', null, 1, 1, 1],['green', null, 1, 1, 1],['blue', null, 1, 1, 1],],
      variantSize32: 1,
      variantAlign32: 1,
      variantPayloadOffset32: 1,
      variantFlatCount: 1,
    })
    , 1, 1 ],['bytes', _lowerFlatList({
      elemLowerFn: _lowerFlatU8,
      elemSize32: 1,
      elemAlign32: 1,
    }), 8, 4 ],], size32: 104, align32: 8 })],
    hasResultPointer: true,
    funcTypeIsAsync: false,
    getCallbackFn: () => null,
    getPostReturnFn: () => null,
    isCancellable: false,
    memoryIdx: 0,
    stringEncoding: 'utf8',
    getMemoryFn: () => memory0,
    getReallocFn: () => realloc0,
    importFn: _trampoline0,
  },
  ))) : _lowerImportBackwardsCompat.bind(
  null,
  {
    trampolineIdx: 0,
    componentIdx: 0,
    isAsync: false,
    isManualAsync: _trampoline0.manuallyAsync,
    paramLiftFns: [_liftFlatRecord({ fieldMetas: [['id', _liftFlatU64, 8, 8],['name', _liftFlatStringAny, 8, 4],['enabled', _liftFlatBool, 1, 1],['anchor', _liftFlatRecord({ fieldMetas: [['x', _liftFlatS32, 4, 4],['label', _liftFlatStringAny, 8, 4],], size32: 12, align32: 4 }), 12, 4],['values', _liftFlatList({
      elemLiftFn: _liftFlatRecord({ fieldMetas: [['x', _liftFlatS32, 4, 4],['label', _liftFlatStringAny, 8, 4],], size32: 12, align32: 4 }),
      elemAlign32: 4,
      elemSize32: 12,
      typedArray: undefined,
    }), 8, 4],['choices', _liftFlatList({
      elemLiftFn: _liftFlatVariant({
        caseMetas: [['none', null, 0, 0, 0, []],['number', _liftFlatS64, 8, 8, 1, ['i64']],['text', _liftFlatStringAny, 8, 4, 2, ['i32','i32']],['points', _liftFlatList({
          elemLiftFn: _liftFlatRecord({ fieldMetas: [['x', _liftFlatS32, 4, 4],['label', _liftFlatStringAny, 8, 4],], size32: 12, align32: 4 }),
          elemAlign32: 4,
          elemSize32: 12,
          typedArray: undefined,
        }), 8, 4, 2, ['i32','i32']],],
        variantSize32: 16,
        variantAlign32: 8,
        variantPayloadOffset32: 8,
        variantFlatCount: 3,
        variantPayloadFlatTypes: ['i64','i32'],
      } ),
      elemAlign32: 8,
      elemSize32: 16,
      typedArray: undefined,
    }), 8, 4],['optional', 
    _liftFlatOption({
      caseMetas: [
      ['none', null, 0, 0, 0, [] ],
      ['some', 
      _liftFlatOption({
        caseMetas: [
        ['none', null, 0, 0, 0, [] ],
        ['some', _liftFlatStringAny, 8, 4, 2, ['i32','i32'] ],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
        variantPayloadFlatTypes: ['i32','i32'],
        payloadMaybeNull: false,
      })
      , 12, 4, 3, ['i32','i32','i32'] ],
      ],
      variantSize32: 16,
      variantAlign32: 4,
      variantPayloadOffset32: 4,
      variantFlatCount: 4,
      variantPayloadFlatTypes: ['i32','i32','i32'],
      payloadMaybeNull: true,
    })
    , 16, 4],['verdicts', _liftFlatList({
      elemLiftFn: 
      _liftFlatResult({
        caseMetas: [['ok', _liftFlatU32, 4, 4, 1, ['i32']],['err', _liftFlatStringAny, 8, 4, 2, ['i32','i32']],],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
        variantPayloadFlatTypes: ['i32','i32'],
      })
      ,
      elemAlign32: 4,
      elemSize32: 12,
      typedArray: undefined,
    }), 8, 4],['pair', _liftFlatTuple({ elemLiftFns: [[_liftFlatFloat64, 8, 8],[_liftFlatStringAny, 8, 4],], size32: 16, align32: 8 }), 16, 8],['shade', 
    _liftFlatEnum({
      caseMetas: [['red', null, 1, 1, 1],['green', null, 1, 1, 1],['blue', null, 1, 1, 1],],
      variantSize32: 1,
      variantAlign32: 1,
      variantPayloadOffset32: 1,
      variantFlatCount: 1,
    })
    , 1, 1],['bytes', _liftFlatList({
      elemLiftFn: _liftFlatU8,
      elemAlign32: 1,
      elemSize32: 1,
      typedArray: Uint8Array,
    }), 8, 4],], size32: 104, align32: 8 })],
    resultLowerFns: [_lowerFlatRecord({ fieldMetas: [['id', _lowerFlatU64, 8, 8 ],['name', _lowerFlatStringAny, 8, 4 ],['enabled', _lowerFlatBool, 1, 1 ],['anchor', _lowerFlatRecord({ fieldMetas: [['x', _lowerFlatS32, 4, 4 ],['label', _lowerFlatStringAny, 8, 4 ],], size32: 12, align32: 4 }), 12, 4 ],['values', _lowerFlatList({
      elemLowerFn: _lowerFlatRecord({ fieldMetas: [['x', _lowerFlatS32, 4, 4 ],['label', _lowerFlatStringAny, 8, 4 ],], size32: 12, align32: 4 }),
      elemSize32: 12,
      elemAlign32: 4,
    }), 8, 4 ],['choices', _lowerFlatList({
      elemLowerFn: _lowerFlatVariant({
        caseMetas: [[ 'none', null, 0, 0, 0 ],[ 'number', _lowerFlatS64, 8, 8, 1 ],[ 'text', _lowerFlatStringAny, 8, 4, 2 ],[ 'points', _lowerFlatList({
          elemLowerFn: _lowerFlatRecord({ fieldMetas: [['x', _lowerFlatS32, 4, 4 ],['label', _lowerFlatStringAny, 8, 4 ],], size32: 12, align32: 4 }),
          elemSize32: 12,
          elemAlign32: 4,
        }), 8, 4, 2 ],],
        variantSize32: 16,
        variantAlign32: 8,
        variantPayloadOffset32: 8,
        variantFlatCount: 3,
      } ),
      elemSize32: 16,
      elemAlign32: 8,
    }), 8, 4 ],['optional', 
    _lowerFlatOption({
      caseMetas: [
      [ 'none', null, 0, 0, 0 ],
      [ 'some', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatStringAny, 8, 4, 2],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
        payloadMaybeNull: false,
      })
      , 12, 4, 3],
      ],
      variantSize32: 16,
      variantAlign32: 4,
      variantPayloadOffset32: 4,
      variantFlatCount: 4,
      payloadMaybeNull: true,
    })
    , 16, 4 ],['verdicts', _lowerFlatList({
      elemLowerFn: 
      _lowerFlatResult({
        caseMetas: [
        [ 'ok', _lowerFlatU32, 12, 4, 4 ],
        [ 'err', _lowerFlatStringAny, 12, 4, 4 ],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      ,
      elemSize32: 12,
      elemAlign32: 4,
    }), 8, 4 ],['pair', _lowerFlatTuple({ elemLowerMetas: [[_lowerFlatFloat64, 8, 8],[_lowerFlatStringAny, 8, 4],], size32: 16, align32: 8 }), 16, 8 ],['shade', 
    _lowerFlatEnum({
      caseMetas: [['red', null, 1, 1, 1],['green', null, 1, 1, 1],['blue', null, 1, 1, 1],],
      variantSize32: 1,
      variantAlign32: 1,
      variantPayloadOffset32: 1,
      variantFlatCount: 1,
    })
    , 1, 1 ],['bytes', _lowerFlatList({
      elemLowerFn: _lowerFlatU8,
      elemSize32: 1,
      elemAlign32: 1,
    }), 8, 4 ],], size32: 104, align32: 8 })],
    hasResultPointer: true,
    funcTypeIsAsync: false,
    getCallbackFn: () => null,
    getPostReturnFn: () => null,
    isCancellable: false,
    memoryIdx: 0,
    stringEncoding: 'utf8',
    getMemoryFn: () => memory0,
    getReallocFn: () => realloc0,
    importFn: _trampoline0,
  },
  );
  Promise.all([module0, module1, module2]).catch(() => {});
  ({ exports: exports0 } = yield instantiateCore(yield module1));
  ({ exports: exports1 } = yield instantiateCore(yield module0, {
    $root: {
      observe: Object.assign(exports0['0'], { _jcoMaySuspend: false }),
    },
  }));
  memory0 = exports1.memory;
  realloc0 = (oldPtr, oldSize, align, newSize) => exports1.cabi_realloc(oldPtr, oldSize, align, newSize) >>> 0;
  
  try {
    const realloc0Promising = WebAssembly.promising(exports1.cabi_realloc);
    realloc0Async = async (oldPtr, oldSize, align, newSize) => (await realloc0Promising(oldPtr, oldSize, align, newSize)) >>> 0;
  } catch(err) {
    realloc0Async = realloc0;
  }
  
  ({ exports: exports2 } = yield instantiateCore(yield module2, {
    actual: {
      '0': Object.assign(trampoline0, { _jcoMaySuspend: false }),
    },
    shim: {
      $imports: exports0.$imports,
    },
  }));
  postReturn0 = exports1['cabi_post_echo-string'];
  
  try {
    postReturn0Async = WebAssembly.promising(exports1['cabi_post_echo-string']);
  } catch(err) {
    postReturn0Async = exports1['cabi_post_echo-string'];
  }
  
  postReturn1 = exports1['cabi_post_list-aligned'];
  
  try {
    postReturn1Async = WebAssembly.promising(exports1['cabi_post_list-aligned']);
  } catch(err) {
    postReturn1Async = exports1['cabi_post_list-aligned'];
  }
  
  postReturn2 = exports1['cabi_post_list-s16'];
  
  try {
    postReturn2Async = WebAssembly.promising(exports1['cabi_post_list-s16']);
  } catch(err) {
    postReturn2Async = exports1['cabi_post_list-s16'];
  }
  
  postReturn3 = exports1['cabi_post_list-char'];
  
  try {
    postReturn3Async = WebAssembly.promising(exports1['cabi_post_list-char']);
  } catch(err) {
    postReturn3Async = exports1['cabi_post_list-char'];
  }
  
  postReturn4 = exports1['cabi_post_list-f64'];
  
  try {
    postReturn4Async = WebAssembly.promising(exports1['cabi_post_list-f64']);
  } catch(err) {
    postReturn4Async = exports1['cabi_post_list-f64'];
  }
  
  postReturn5 = exports1['cabi_post_list-string'];
  
  try {
    postReturn5Async = WebAssembly.promising(exports1['cabi_post_list-string']);
  } catch(err) {
    postReturn5Async = exports1['cabi_post_list-string'];
  }
  
  postReturn6 = exports1['cabi_post_echo-choice'];
  
  try {
    postReturn6Async = WebAssembly.promising(exports1['cabi_post_echo-choice']);
  } catch(err) {
    postReturn6Async = exports1['cabi_post_echo-choice'];
  }
  
  postReturn7 = exports1['cabi_post_echo-packet'];
  
  try {
    postReturn7Async = WebAssembly.promising(exports1['cabi_post_echo-packet']);
  } catch(err) {
    postReturn7Async = exports1['cabi_post_echo-packet'];
  }
  
  postReturn8 = exports1['cabi_post_echo-tuple'];
  
  try {
    postReturn8Async = WebAssembly.promising(exports1['cabi_post_echo-tuple']);
  } catch(err) {
    postReturn8Async = exports1['cabi_post_echo-tuple'];
  }
  
  postReturn9 = exports1['cabi_post_echo-nested'];
  
  try {
    postReturn9Async = WebAssembly.promising(exports1['cabi_post_echo-nested']);
  } catch(err) {
    postReturn9Async = exports1['cabi_post_echo-nested'];
  }
  
  postReturn10 = exports1['cabi_post_echo-option'];
  
  try {
    postReturn10Async = WebAssembly.promising(exports1['cabi_post_echo-option']);
  } catch(err) {
    postReturn10Async = exports1['cabi_post_echo-option'];
  }
  
  postReturn11 = exports1['cabi_post_echo-result'];
  
  try {
    postReturn11Async = WebAssembly.promising(exports1['cabi_post_echo-result']);
  } catch(err) {
    postReturn11Async = exports1['cabi_post_echo-result'];
  }
  
  postReturn12 = exports1['cabi_post_result-err'];
  
  try {
    postReturn12Async = WebAssembly.promising(exports1['cabi_post_result-err']);
  } catch(err) {
    postReturn12Async = exports1['cabi_post_result-err'];
  }
  
  exports1EchoScalarValue = exports1['echo-scalar-value'];
  exports1InspectScalarValue = exports1['inspect-scalar-value'];
  exports1EchoAligned = exports1['echo-aligned'];
  exports1ListAligned = exports1['list-aligned'];
  exports1EchoU8 = exports1['echo-u8'];
  exports1Enum257 = exports1['enum-257'];
  exports1EchoBool = exports1['echo-bool'];
  exports1EchoS8 = exports1['echo-s8'];
  exports1EchoU16 = exports1['echo-u16'];
  exports1EchoS16 = exports1['echo-s16'];
  exports1EchoS32 = exports1['echo-s32'];
  exports1EchoIdentifier = exports1['echo-identifier'];
  exports1EchoF32 = exports1['echo-f32'];
  exports1EchoF64 = exports1['echo-f64'];
  exports1CharCode = exports1['char-code'];
  exports1EchoString = exports1['echo-string'];
  exports1ListBool = exports1['list-bool'];
  exports1ListU8 = exports1['list-u8'];
  exports1ListS8 = exports1['list-s8'];
  exports1ListU16 = exports1['list-u16'];
  exports1ListS16 = exports1['list-s16'];
  exports1ListU32 = exports1['list-u32'];
  exports1ListS32 = exports1['list-s32'];
  exports1ListS64 = exports1['list-s64'];
  exports1ListF32 = exports1['list-f32'];
  exports1ListF64 = exports1['list-f64'];
  exports1ListChar = exports1['list-char'];
  exports1ListString = exports1['list-string'];
  exports1EchoShade = exports1['echo-shade'];
  exports1EchoChoice = exports1['echo-choice'];
  exports1EchoPacket = exports1['echo-packet'];
  exports1InspectPacket = exports1['inspect-packet'];
  exports1ThroughHost = exports1['through-host'];
  exports1EchoTuple = exports1['echo-tuple'];
  exports1EchoNested = exports1['echo-nested'];
  exports1EchoOption = exports1['echo-option'];
  exports1EchoResult = exports1['echo-result'];
  exports1ResultOk = exports1['result-ok'];
  exports1ResultErr = exports1['result-err'];
  exports1StringCodes = exports1['string-codes'];
  exports1BitsF32 = exports1['bits-f32'];
  exports1BitsF64 = exports1['bits-f64'];
  exports1NoArgs = exports1['no-args'];
  exports1NoResult = exports1['no-result'];
  exports1Flat16 = exports1['flat-16'];
  exports1Flat17 = exports1['flat-17'];
  
  return { bitsF32, bitsF64, charCode, echoAligned, echoBool, echoChar, echoChoice, echoF32, echoF64, echoIdentifier, echoNested, echoOption, echoPacket, echoResult, echoS16, echoS32, echoS64, echoS8, echoScalarValue, echoShade, echoString, echoTuple, echoU16, echoU32, echoU64, echoU8, enum256, enum257, flags1, flags16, flags17, flags32, flags8, flags9, flat16, flat17, inspectPacket, inspectScalarValue, listAligned, listBool, listChar, listF32, listF64, listS16, listS32, listS64, listS8, listString, listU16, listU32, listU64, listU8, noArgs, noResult, resultErr, resultOk, resultUnit, stringCodes, throughHost,  };
})();
let promise, resolve, reject;
function normalizeInstantiationError(e) {
  // Native JSPI rejects a suspending import called from a
  // core start function before entering its JS wrapper.
  // At component instantiation time that always means the
  // implicit synchronous task attempted to block.
  if (typeof WebAssembly.SuspendError === 'function' && e instanceof WebAssembly.SuspendError) {
    return new WebAssembly.RuntimeError('cannot block a synchronous task before returning');
  }
  return e;
}
function runNext(value) {
  try {
    let done;
    do {
      ({ value, done } = gen.next(value));
    } while (!(value instanceof Promise) && !done);
    if (done) {
      if (resolve) return resolve(value);
      else return value;
    }
    if (!promise) promise = new Promise((_resolve, _reject) => (resolve = _resolve, reject= _reject));
    value.then(nextVal => done ? resolve() : runNext(nextVal), e => reject(normalizeInstantiationError(e)));
  }
  catch (e) {
    e = normalizeInstantiationError(e);
    if (reject) reject(e);
    else throw e;
  }
}
const maybeSyncReturn = runNext(null);
return promise || maybeSyncReturn;
};

export const _util = {
  
}

