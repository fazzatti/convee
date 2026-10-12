/**
 * Dedicated-worker bootstrap entry used by Convee's runtime transports.
 * This subpath is loadable as a worker entry, not as a caller-side library import.
 * It loads the assigned default-exported definition and handles the worker protocol.
 * Importing it outside a supported worker fails or lacks the required host transport.
 * @module
 */
import { bootstrap } from "@/workers/bootstrap.ts";

// Application code is loaded as a module; functions are never stringified/evaluated.
await bootstrap(async (url) => (await import(url)).default);
