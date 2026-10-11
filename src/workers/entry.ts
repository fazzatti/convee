import { bootstrap } from "@/workers/bootstrap.ts";

// Application code is loaded as a module; functions are never stringified/evaluated.
await bootstrap(async (url) => (await import(url)).default);
