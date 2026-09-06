export { createRunContext } from "@/context/runtime.ts";
export type {
  ContextStore,
  ContextValues,
  PluginSnapshot,
  PluginThis,
  RunContext,
  RunContextCapture,
  RunContextOptions,
  StepSnapshot,
  StepThis,
} from "@/context/types.ts";

export {
  ConveeError,
  conveeError,
  conveeErrorFromUnknown,
  isConveeError,
  isConveeErrorOf,
  unexpectedConveeError,
} from "@/error/index.ts";
export type {
  BaseMeta,
  ConveeErrorContext,
  ConveeErrorDomain,
  ConveeErrorShape,
  ConveeErrorTrace,
  ConveeTraceFrame,
  ConveeTraceFrameKind,
  ConveeTracePhase,
  Diagnostic,
} from "@/error/index.ts";

export { hasError, hasInput, hasOutput } from "@/plugin/guards.ts";
export { isPluginError, PLG_ERRORS } from "@/plugin/error.ts";
export { plugin, pluginFor, syncPluginFor } from "@/plugin/factory.ts";
export type {
  PluginError,
  PluginErrorCode,
  PluginErrorOf,
} from "@/plugin/error.ts";
export type {
  AnyPlugin,
  AnySyncPlugin,
  ContextualPluginFactory,
  ContextualPluginSyncFactory,
  ErrorPlugin,
  InputPlugin,
  OutputPlugin,
  Plugin,
  PluginArgs,
  PluginCapability,
  PluginDefinition,
  PluginErrorHook,
  PluginFactory,
  PluginFactoryOptions,
  PluginIdentity,
  PluginInputHook,
  PluginInputResult,
  PluginOutputHook,
  PluginSyncFactory,
  SyncErrorPlugin,
  SyncInputPlugin,
  SyncOutputPlugin,
  SyncPlugin,
  SyncPluginDefinition,
  SyncPluginErrorHook,
  SyncPluginHooks,
  SyncPluginInputHook,
  SyncPluginOutputHook,
  SyncTypedPluginFactory,
  TypedPluginFactory,
} from "@/plugin/types.ts";

export { isStepError, STP_ERRORS } from "@/step/error.ts";
export { step } from "@/step/factory.ts";
export type {
  StepError,
  StepErrorCode,
  StepErrorOf,
  StepInvalidInputPluginResultMeta,
  StepUnknownThrownMeta,
} from "@/step/error.ts";
export type {
  ContextualStepFactory,
  ContextualSyncStepFactory,
  Step,
  StepArgs,
  StepFactory,
  StepFn,
  StepIdentity,
  StepInstance,
  StepPlugin,
  StepRunOptions,
  SyncStep,
  SyncStepFactory,
  SyncStepFn,
  SyncStepInstance,
  SyncStepPlugin,
  SyncStepRunOptions,
} from "@/step/types.ts";

export { isPipeError, PIP_ERRORS } from "@/pipe/error.ts";
export { pipe } from "@/pipe/factory.ts";
export type { PipeError, PipeErrorCode, PipeErrorOf } from "@/pipe/error.ts";
export type {
  ContextualPipeFactory,
  ContextualSyncPipeFactory,
  Pipe,
  PipeAttachablePlugin,
  PipeCompatibleStep,
  PipeContext,
  PipeFactory,
  PipeIdentity,
  PipeInput,
  PipeInstance,
  PipeLevelPlugin,
  PipeOptions,
  PipePlugin,
  PipeResult,
  PipeRunOptions,
  PipeStepPlugin,
  PipeTargetIds,
  SyncPipe,
  SyncPipeAttachablePlugin,
  SyncPipeCompatibleStep,
  SyncPipeFactory,
  SyncPipeInstance,
  SyncPipeLevelPlugin,
  SyncPipeOptions,
  SyncPipePlugin,
  SyncPipeRunOptions,
  SyncPipeStepPlugin,
} from "@/pipe/types.ts";

/** Advanced type utilities used by the public factory signatures. */
export type * from "@/core/types.ts";
export type * from "@/context/types.ts";
export type * from "@/error/index.ts";
export type * from "@/error/types.ts";
export type * from "@/pipe/types.ts";
export type * from "@/pipe/error.ts";
export type * from "@/plugin/types.ts";
export type * from "@/plugin/error.ts";
export type * from "@/step/types.ts";
export type * from "@/step/error.ts";
export type { PluginEngine } from "@/plugin/plugin.ts";
