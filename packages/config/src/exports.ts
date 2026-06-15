// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS API
// Named types and helper factories for declaring class exports.
//
// The TS-facing API follows the same structural shape as the wrangler /
// EWC wire format, with two stylistic transforms:
//
//   - property names are camelCased (`renamedTo`, `transferTo`,
//     `transferFrom`),
//   - enumeration values are kebab-cased (`type: "durable-object"`,
//     `state: "expecting-transfer"`, `storage: "legacy-kv"`).
//
// `convert.ts` performs the snake_case / underscore conversion at the
// wrangler boundary.
// ═══════════════════════════════════════════════════════════════════════════

interface DurableObjectLiveExportOptions {
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
 * Declares a Durable Object class defined by this Worker. This is the
 * "live" variant — `state` defaults to `"created"` when omitted on the wire.
 *
 * For more information about Durable Objects, see the documentation at
 * https://developers.cloudflare.com/workers/learning/using-durable-objects
 *
 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#durable-objects
 */
export interface DurableObjectExport extends DurableObjectLiveExportOptions {
	type: "durable-object";
	state?: "created";
}

/**
 * Tombstone: retire a provisioned Durable Object namespace whose class has
 * been removed from code.
 *
 * Preconditions (enforced by EWC during deploy):
 *  - the class must NOT be exported in the uploaded code
 *  - no other Worker may hold a `durableObject` binding to the namespace
 *
 * See the spec's "Tombstones" section:
 * https://wiki.cfdata.org/spaces/WX/pages/1396640001
 */
export interface DurableObjectDeletedExport {
	type: "durable-object";
	state: "deleted";
}

interface DurableObjectRenamedExportOptions {
	/**
	 * The destination class name. Must be a valid JavaScript identifier and
	 * must appear as a live (`state: "created"`) `durableObject` entry in the
	 * same `exports` map.
	 */
	renamedTo: string;
}

/**
 * Tombstone: rename a provisioned Durable Object namespace's class. The
 * `renamedTo` value must also appear as a live (`state: "created"`)
 * `durableObject` entry in the same `exports` map.
 */
export interface DurableObjectRenamedExport extends DurableObjectRenamedExportOptions {
	type: "durable-object";
	state: "renamed";
}

interface DurableObjectTransferredExportOptions {
	/**
	 * The destination script. Must reference a script in the same account.
	 * Cross-dispatch-namespace transfers are rejected.
	 */
	transferTo: string;
}

/**
 * Tombstone: transfer ownership of a Durable Object namespace to another
 * script in the same account. Two-phase commit: the target script must first
 * deploy an `expectingTransfer` entry naming this script via `transferFrom`.
 */
export interface DurableObjectTransferredExport extends DurableObjectTransferredExportOptions {
	type: "durable-object";
	state: "transferred";
}

interface DurableObjectExpectingTransferExportOptions extends DurableObjectLiveExportOptions {
	/**
	 * The source script for the two-phase cross-script transfer. The source
	 * script will follow up with a `transferred` tombstone naming this script
	 * to commit the transfer. See the spec:
	 * https://wiki.cfdata.org/spaces/WX/pages/1396640001
	 */
	transferFrom: string;
}

/**
 * Live entry that names the receiving side of a two-phase cross-script
 * Durable Object transfer. Both `storage` and `transferFrom` are required.
 * Once the source script's `transferred` tombstone commits, this entry
 * becomes a normal live `durable-object` export.
 */
export interface DurableObjectExpectingTransferExport extends DurableObjectExpectingTransferExportOptions {
	type: "durable-object";
	state: "expecting-transfer";
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
	durableObject(options: DurableObjectLiveExportOptions): DurableObjectExport;
	/**
	 * Tombstone: retire a provisioned Durable Object namespace whose class
	 * has been removed from code.
	 */
	deleted(): DurableObjectDeletedExport;
	/**
	 * Tombstone: rename a provisioned Durable Object namespace's class.
	 */
	renamed(
		options: DurableObjectRenamedExportOptions
	): DurableObjectRenamedExport;
	/**
	 * Tombstone: transfer ownership of a Durable Object namespace to another
	 * script in the same account.
	 */
	transferred(
		options: DurableObjectTransferredExportOptions
	): DurableObjectTransferredExport;
	/**
	 * Receiving side of a two-phase cross-script Durable Object transfer.
	 * The source script must follow up with a `transferred` tombstone to
	 * commit the transfer.
	 */
	expectingTransfer(
		options: DurableObjectExpectingTransferExportOptions
	): DurableObjectExpectingTransferExport;
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
 *     OldClass:        exports.deleted(),
 *     OldName:         exports.renamed({ renamedTo: "NewName" }),
 *     Movee:           exports.transferred({ transferTo: "target-worker" }),
 *     Incoming:        exports.expectingTransfer({ storage: "sqlite", transferFrom: "source-worker" }),
 *   },
 * });
 * ```
 */
export const exports: Exports = {
	durableObject: (options) => ({ type: "durable-object", ...options }),
	deleted: () => ({ type: "durable-object", state: "deleted" }),
	renamed: ({ renamedTo }) => ({
		type: "durable-object",
		state: "renamed",
		renamedTo,
	}),
	transferred: ({ transferTo }) => ({
		type: "durable-object",
		state: "transferred",
		transferTo,
	}),
	expectingTransfer: ({ storage, transferFrom }) => ({
		type: "durable-object",
		state: "expecting-transfer",
		storage,
		transferFrom,
	}),
	// TODO: support Workflows
	// workflow: (options) => ({ type: "workflow", ...options }),
};
