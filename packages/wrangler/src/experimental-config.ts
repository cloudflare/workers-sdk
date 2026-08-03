/**
 * Experimental subpath entry — `wrangler/experimental-config`.
 *
 * Re-exports the Worker config API from `@cloudflare/config/public` (used by
 * `cloudflare.config.ts`), and the new tooling config API
 * (`defineWranglerConfig`) used by `wrangler.config.ts`.
 *
 * Importing example:
 *
 * ```ts
 * import {
 *   defineWorker,
 *   defineWranglerConfig,
 *   bindings,
 *   triggers,
 * } from "wrangler/experimental-config";
 * ```
 */

export * from "@cloudflare/config/public";
export * from "./experimental-config/public";
