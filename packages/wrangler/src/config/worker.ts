/**
 * Programmatic configuration types for Cloudflare Workers.
 *
 * This module re-exports the programmatic config types from @cloudflare/workers-utils
 * via the `wrangler/config` subpath.
 *
 * @example
 * ```ts
 * // cf.config.ts
 * import { defineConfig } from "wrangler/config";
 *
 * export default defineConfig((ctx) => ({
 *   name: `my-app-${ctx.env ?? "dev"}`,
 *   entrypoint: "./src/index.ts",
 *   compatibilityDate: "2025-02-05",
 * }));
 * ```
 */

// Re-export all programmatic config types and helpers
export {
	defineConfig,
	type WorkerConfig,
	type WorkerConfigContext,
	type WorkerConfigFn,
} from "@cloudflare/workers-utils/programmatic";

// Re-export the Binding and Trigger types that WorkerConfig uses
export type { Binding, Trigger } from "@cloudflare/workers-utils";
