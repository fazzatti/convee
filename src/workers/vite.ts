import {
  freshName,
  insertSource,
  sourceIntervals,
} from "@/workers/source-edit.ts";
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
function walk(
  value: Node,
  visit: (value: Node, parents: Node[]) => void,
  parents: Node[] = [],
): void {
  visit(value, parents);
  parents.push(value);
  for (const child of Object.values(value)) {
    if (node(child)) walk(child, visit, parents);
    else if (Array.isArray(child)) {
      for (const element of child) {
        if (node(element)) walk(element, visit, parents);
      }
    }
  }
  parents.pop();
}

function boundNames(pattern: Node, add: (name: string) => void): void {
  switch (pattern.type) {
    case "Identifier":
      add(String(pattern.name));
      break;
    case "RestElement":
      boundNames(pattern.argument as Node, add);
      break;
    case "AssignmentPattern":
      boundNames(pattern.left as Node, add);
      break;
    case "ArrayPattern":
      for (const element of pattern.elements as (Node | null)[]) {
        if (element) boundNames(element, add);
      }
      break;
    case "ObjectPattern":
      for (const prop of pattern.properties as Node[]) {
        boundNames(prop.type === "Property" ? prop.value as Node : prop, add);
      }
  }
}
const functions = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
]);
const blocks = new Set([
  "Program",
  "BlockStatement",
  "StaticBlock",
  "ForStatement",
  "ForOfStatement",
  "ForInStatement",
  "SwitchStatement",
]);
/** Record the full lexical extent, including uses preceding the declaration. */
function localBindings(
  value: Node,
  parents: Node[],
  hide: (pattern: Node, scope: Node) => void,
): void {
  const enclosingBlock = () =>
    parents.findLast((parent) => blocks.has(parent.type))!;
  if (functions.has(value.type)) {
    for (const param of value.params as Node[]) hide(param, value);
    if (node(value.id)) {
      hide(
        value.id,
        value.type === "FunctionDeclaration" ? enclosingBlock() : value,
      );
    }
  } else if (value.type === "VariableDeclaration") {
    const owner = value.kind === "var"
      ? parents.findLast((parent) =>
        functions.has(parent.type) || parent.type === "StaticBlock" ||
        parent.type === "Program"
      )!
      : enclosingBlock();
    const scope = functions.has(owner.type) ? owner.body as Node : owner;
    for (const declaration of value.declarations as Node[]) {
      hide(declaration.id as Node, scope);
    }
  } else if (value.type === "CatchClause" && node(value.param)) {
    hide(value.param, value);
  } else if (
    value.type === "ClassDeclaration" || value.type === "ClassExpression"
  ) {
    if (node(value.id)) {
      hide(
        value.id,
        value.type === "ClassDeclaration" ? enclosingBlock() : value,
      );
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
 * with module: import.meta.url. Later explicit entry properties take precedence.
 * A later spread or computed key can override module, so that form is left to the caller.
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
      const shadows = new Map<string, { start: number; end: number }[]>();
      walk(ast, (value, parents) => {
        localBindings(value, parents, (pattern, scope) => {
          // Switch cases share a scope. The discriminant is evaluated outside it.
          const start = scope.type === "SwitchStatement"
            ? (scope.cases as Node[])[0].start
            : scope.start;
          boundNames(pattern, (name) => {
            const ranges = shadows.get(name) ?? [];
            ranges.push({ start, end: scope.end });
            shadows.set(name, ranges);
          });
        });
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
        if (value.type !== "CallExpression") return;
        const callee = value.callee as Node;
        if (
          callee.type !== "Identifier" || !bindings.has(String(callee.name))
        ) return;
        if (
          shadows.get(String(callee.name))?.some(({ start, end }) =>
            start <= callee.start && callee.end <= end
          )
        ) return;
        const options = (value.arguments as Node[])[1];
        if (!options || options.type !== "ObjectExpression") return;
        // Object properties are evaluated left to right. Only the last possible
        // writer of module can establish the static URL.
        const lastModule = (options.properties as Node[]).findLast((property) =>
          property.type === "SpreadElement" || property.computed === true ||
          ((property.key as Node).name ?? (property.key as Node).value) ===
            "module"
        );
        if (
          lastModule?.type === "Property" && !lastModule.computed &&
          moduleUrl(lastModule.value as Node)
        ) {
          edits.push(options.start + 1);
        }
      });
      if (!edits.length) return;
      const binding = freshName(
        "__convee_worker_entry_" + edits[0],
        identifiers,
      );
      const insertion = `entry: ${binding},`;
      code = edits.length === 1
        ? insertSource(code, edits[0], insertion)
        : sourceIntervals(code, edits.sort((a, b) => a - b)).join(insertion);
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
