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
export { PLG_ERRORS, isPluginError } from "@/plugin/error.ts";
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

export { STP_ERRORS, isStepError } from "@/step/error.ts";
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

export { PIP_ERRORS, isPipeError } from "@/pipe/error.ts";
export { pipe } from "@/pipe/factory.ts";
export type {
  PipeError,
  PipeErrorCode,
  PipeErrorOf,
} from "@/pipe/error.ts";
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
