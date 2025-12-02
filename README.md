# convee

A TypeScript library for building composable processing pipelines with plugin support and metadata tracking.

## Installation

```bash
# Using JSR
deno add @fifo/convee

# Or import directly
import { ProcessEngine, Pipeline, Plugin } from "jsr:@fifo/convee";
```

## Core Concepts

Convee provides three main building blocks:

- **ProcessEngine** - A single processing unit that transforms input to output
- **Pipeline** - Chains multiple ProcessEngines or functions together
- **Plugin** - Hooks that run before input, after output, or on errors

All components share a `MetadataHelper` that allows you to collect and pass data through the processing chain.

## Quick Start

### ProcessEngine

A ProcessEngine wraps a function and adds plugin support:

```typescript
import { ProcessEngine } from "@fifo/convee";

const double = ProcessEngine.create((n: number) => n * 2, {
  name: "DoubleProcessor",
});

const result = await double.run(5); // 10
```

### Pipeline

Chain multiple steps together:

```typescript
import { ProcessEngine, Pipeline } from "@fifo/convee";

const addTax = ProcessEngine.create((price: number) => price * 1.1, {
  name: "AddTax",
});

const applyDiscount = ProcessEngine.create((price: number) => price * 0.9, {
  name: "ApplyDiscount",
});

const pricePipeline = Pipeline.create([applyDiscount, addTax], {
  name: "PricePipeline",
});

const finalPrice = await pricePipeline.run(100); // 99
```

Pipelines also accept simple functions:

```typescript
const pipeline = Pipeline.create(
  [(n: number) => n * 2, (n: number) => n + 10],
  { name: "SimplePipeline" }
);

await pipeline.run(5); // 20
```

### Plugins

Plugins hook into the processing lifecycle:

```typescript
import { ProcessEngine, Plugin, MetadataHelper } from "@fifo/convee";

// Input plugin - runs before the process
const logInput = Plugin.create({
  name: "LogInput",
  processInput: (input: number, metadata: MetadataHelper) => {
    metadata.add("originalInput", input);
    console.log(`Processing: ${input}`);
    return input;
  },
});

// Output plugin - runs after the process
const logOutput = Plugin.create({
  name: "LogOutput",
  processOutput: (output: number, metadata: MetadataHelper) => {
    console.log(`Result: ${output}`);
    return output;
  },
});

// Error plugin - handles errors
const handleError = Plugin.create({
  name: "HandleError",
  processError: (error, metadata: MetadataHelper) => {
    console.error(`Error occurred: ${error.message}`);
    return 0; // Return fallback value
  },
});

const process = ProcessEngine.create((n: number) => n * 2, {
  name: "DoubleWithPlugins",
  plugins: [logInput, logOutput, handleError],
});
```

### Metadata

The `MetadataHelper` allows you to share data across plugins and processes:

```typescript
import { ProcessEngine, MetadataHelper } from "@fifo/convee";

const process = ProcessEngine.create(
  (input: number, metadata: MetadataHelper) => {
    // Access metadata set by input plugins
    const startTime = metadata.get("startTime");

    // Add your own metadata
    metadata.add("processedAt", new Date());

    return input * 2;
  },
  { name: "MetadataExample" }
);
```

In pipelines, metadata flows through all steps:

```typescript
const step1 = ProcessEngine.create(
  (n: number, metadata: MetadataHelper) => {
    metadata.add("step1Result", n * 2);
    return n * 2;
  },
  { name: "Step1" }
);

const step2 = ProcessEngine.create(
  (n: number, metadata: MetadataHelper) => {
    const step1Result = metadata.get("step1Result"); // Access from step1
    return n + 10;
  },
  { name: "Step2" }
);

const pipeline = Pipeline.create([step1, step2], { name: "MetadataPipeline" });
```

### Single-Use Plugins

Apply plugins for a single execution without modifying the process:

```typescript
const process = ProcessEngine.create((n: number) => n * 2, { name: "Double" });

// Apply a one-time plugin
const result = await process.run(10, {
  singleUsePlugins: [
    {
      name: "AddBonus",
      processOutput: (output: number) => output + 5,
    },
  ],
});
// result: 25
```

### Dynamic Plugin Management

Add or remove plugins at runtime:

```typescript
const process = ProcessEngine.create((n: number) => n, { name: "Dynamic" });

// Add plugin
process.addPlugin({
  name: "Logger",
  processInput: (n: number, metadata: MetadataHelper) => {
    console.log(n);
    return n;
  },
});

// Remove plugin
process.removePlugin("Logger");
```

For pipelines, you can target specific steps:

```typescript
const pipeline = Pipeline.create([step1, step2], { name: "MyPipeline" });

// Add to pipeline level
pipeline.addPlugin(plugin, "MyPipeline");

// Add to specific step
pipeline.addPlugin(plugin, "Step1");
```

## API Reference

### ProcessEngine

```typescript
ProcessEngine.create(
  process: (input: I, metadata?: MetadataHelper) => O | Promise<O>,
  options?: {
    name?: string;
    id?: string;
    plugins?: Plugin[];
  }
)
```

### Pipeline

```typescript
Pipeline.create(
  steps: Array<ProcessEngine | Function>,
  options: {
    name: string;
    id?: string;
  }
)
```

### Plugin

```typescript
Plugin.create({
  name: string;
  processInput?: (input: I, metadata: MetadataHelper) => I;
  processOutput?: (output: O, metadata: MetadataHelper) => O;
  processError?: (error: ConveeError, metadata: MetadataHelper) => O | ConveeError;
})
```

### MetadataHelper

```typescript
metadata.add(key: string, value: unknown): void
metadata.get(key: string): unknown
metadata.getAll(): Record<string, unknown>
```

## Testing

```bash
deno test
```

## License

MIT
