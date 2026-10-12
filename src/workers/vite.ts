import type { Plugin } from "npm:vite@8.3.4";
import { moduleUrl as runtimeModuleUrl } from "@/workers/module-url.ts";

/** Minimal AST nodes used from Vite's parser; no parser is loaded into the SDK. */
interface Node {
  type: string;
  start: number;
  end: number;
  [key: string]: unknown;
}
/** Vite's own plugin contract, including its worker build hooks. */
export type ConveeWorkersPlugin = Plugin;
const SUFFIX = ".convee-worker.js";
const INNER = "convee-worker-definition";
function node(value: unknown): value is Node {
  return value !== null && typeof value === "object" &&
    typeof Reflect.get(value, "type") === "string";
}
function walk(value: Node, visit: (value: Node) => void): void {
  visit(value);
  for (const child of Object.values(value)) {
    if (node(child)) walk(child, visit);
    else if (Array.isArray(child)) {
      for (const element of child) if (node(element)) walk(element, visit);
    }
  }
}
function moduleUrl(value: Node): boolean {
  const object = value.object as Node, property = value.property as Node;
  return value.type === "MemberExpression" && !value.computed &&
    object.type === "MetaProperty" && (object.meta as Node).name === "import" &&
    property.name === "url";
}
/**
 * Keep Convee's ordinary worker-file syntax in Vite development and production.
 *
 * Add `conveeWorkers()` to Vite's plugins. The integration recognizes imports of
 * worker from @fifo/convee/workers, @jsr/fifo__convee/workers or @convee/workers
 * (including aliases of the imported function), and a literal options object
 * with module: import.meta.url.
 * It emits separate bootstraps, installs their loader for worker builds, and
 * preserves the application's existing worker plugins. No companion files,
 * caller-side execution fallback or serialized functions are generated.
 * Shared package imports remain unbundled during dependency optimization so
 * worker hosts and SDK-owned pipelines retain one native run-context identity.
 *
 * @returns A Vite plugin. Construction has no runtime worker or filesystem effects.
 * @throws Invalid source or unsupported build configuration produces Vite build
 * errors. This integration does not make platform-specific application imports
 * browser-compatible; use module-safe dependencies in the worker definition.
 */
export function conveeWorkers(): ConveeWorkersPlugin {
  return {
    name: "convee-workers",
    enforce: "post",
    config(config) {
      const plugins = config.worker?.plugins;
      return {
        optimizeDeps: {
          exclude: ["@fifo/convee", "@jsr/fifo__convee", "@convee"],
        },
        worker: { plugins: () => [...(plugins?.() ?? []), conveeWorkers()] },
      };
    },
    resolveId(id) {
      if (id.split("?")[0].endsWith(SUFFIX)) return id;
    },
    load(id) {
      const path = id.split("?")[0];
      if (!path.endsWith(SUFFIX)) return;
      const definition = path.slice(0, -SUFFIX.length) + "?" + INNER;
      const bootstrap = decodeURIComponent(
        runtimeModuleUrl("bootstrap", import.meta.url).pathname,
      );
      return `import definition from ${
        JSON.stringify(definition)
      };\nimport { bootstrap } from ${
        JSON.stringify(bootstrap)
      };\nvoid bootstrap(async () => definition);\n`;
    },
    transform(code, id) {
      if (
        id.includes(INNER) || id.split("?")[0].endsWith(SUFFIX) ||
        !code.includes("worker")
      ) return;
      const ast = this.parse(code) as unknown as Node;
      const bindings = new Set<string>();
      const identifiers = new Set<string>();
      walk(ast, (value) => {
        if (value.type === "Identifier") identifiers.add(String(value.name));
        if (value.type !== "ImportDeclaration") return;
        const source = String((value.source as Node).value);
        if (
          ![
            "@fifo/convee/workers",
            "@jsr/fifo__convee/workers",
            "@convee/workers",
            "jsr:@fifo/convee/workers",
          ].includes(source)
        ) return;
        for (const specifier of value.specifiers as Node[]) {
          if (
            specifier.type === "ImportSpecifier" &&
            ((specifier.imported as Node).name ??
                (specifier.imported as Node).value) === "worker"
          ) bindings.add(String((specifier.local as Node).name));
        }
      });
      const edits: number[] = [];
      walk(ast, (value) => {
        if (
          value.type !== "CallExpression" ||
          !bindings.has(String((value.callee as Node).name))
        ) return;
        const options = (value.arguments as Node[])[1];
        if (!options || options.type !== "ObjectExpression") return;
        for (const property of options.properties as Node[]) {
          if (
            property.type === "Property" && !property.computed &&
            ((property.key as Node).name === "module" ||
              (property.key as Node).value === "module") &&
            moduleUrl(property.value as Node)
          ) edits.push(options.start + 1);
        }
      });
      if (!edits.length) return;
      let binding = "__convee_worker_entry_" + edits[0];
      while (identifiers.has(binding)) binding += "_";
      for (const offset of edits.sort((a, b) => b - a)) {
        code = code.slice(0, offset) + `entry: ${binding},` +
          code.slice(offset);
      }
      return {
        code:
          `import ${binding} from ${
            JSON.stringify(id.split("?")[0] + SUFFIX + "?worker&url")
          };\n` + code,
        map: null,
      };
    },
  };
}
