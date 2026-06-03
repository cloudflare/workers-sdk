// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS API
// Named types and helper factories for declaring class exports.
// ═══════════════════════════════════════════════════════════════════════════

interface DurableObjectExportOptions {
	/**
	 * Storage backend for the Durable Object.
	 *
	 * - `"sqlite"`: selects the SQLite-backed storage engine
	 *   (recommended for new classes).
	 * - `"legacy-kv"`: selects the legacy key-value storage engine.
	 */
	storage: "sqlite" | "legacy-kv";
}

/**
 * Declares a Durable Object class defined by this Worker.
 *
 * For more information about Durable Objects, see the documentation at
 * https://developers.cloudflare.com/workers/learning/using-durable-objects
 *
 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#durable-objects
 */
export interface DurableObjectExport extends DurableObjectExportOptions {
	type: "durable-object";
}

interface WorkflowExportOptions {
	/** The name of the Workflow. */
	name: string;
	/** Optional limits for the Workflow. */
	limits?: {
		/** Maximum number of steps a Workflow instance can execute. */
		steps?: number;
	};
	/** Optional cron schedules for automatically triggering workflow instances. */
	schedules?: string[];
}

/** Declares a Workflow defined by this Worker. */
export interface WorkflowExport extends WorkflowExportOptions {
	type: "workflow";
}

/**
 * Configuration for named exports declared by the Worker. Each entry's
 * key is the exported class name; the value configures the export.
 */
export interface Exports {
	/**
	 * Declares a Durable Object class defined by this Worker.
	 *
	 * For more information about Durable Objects, see the documentation at
	 * https://developers.cloudflare.com/workers/learning/using-durable-objects
	 *
	 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#durable-objects
	 */
	durableObject(options: DurableObjectExportOptions): DurableObjectExport;
	// TODO: support Workflows
	// /** Declares a Workflow defined by this Worker. */
	// workflow(options: WorkflowExportOptions): WorkflowExport;
}

/**
 * Exports builder for configuring Worker exports.
 *
 * @example
 * ```typescript
 * import { defineWorker, exports } from "@cloudflare/config";
 *
 * export default defineWorker({
 *   exports: {
 *     MyDurableObject: exports.durableObject({ storage: "sqlite" }),
 *   },
 * });
 * ```
 */
export const exports: Exports = {
	durableObject: (options) => ({ type: "durable-object", ...options }),
	// TODO: support Workflows
	// workflow: (options) => ({ type: "workflow", ...options }),
};
