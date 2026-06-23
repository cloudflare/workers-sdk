// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS API
// Named types and helper factories for declaring class exports.
//
// The TS-facing API follows the same structural shape as wrangler upload
// metadata, with two stylistic transforms:
//
//   - property names are camelCased (`renamedTo`, `transferredTo`,
//     `transferFrom`),
//   - enumeration values are kebab-cased (`type: "durable-object"`,
//     `state: "expecting-transfer"`, `storage: "legacy-kv"`).
//
// `convert.ts` performs the snake_case / underscore conversion at the
// wrangler boundary.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Declares a provisioned Durable Object class exported from this Worker.
 *
 * For more information about Durable Objects, see the documentation at
 * https://developers.cloudflare.com/workers/learning/using-durable-objects
 *
 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#durable-objects
 */
export interface DurableObjectExport {
	type: "durable-object";
	state?: "created";
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
 * Tombstone: retire a provisioned Durable Object namespace whose class has
 * been removed from code.
 *
 * During deploy, the class must not be exported in the uploaded code, and no
 * other Worker may hold a `durableObject` binding to the namespace.
 */
export interface DurableObjectDeletedExport {
	type: "durable-object";
	state: "deleted";
}

/**
 * Tombstone: rename a provisioned Durable Object namespace's class. The
 * `renamedTo` value must also appear as a live (`state: "created"`)
 * `durableObject` entry in the same `exports` map.
 */
export interface DurableObjectRenamedExport {
	type: "durable-object";
	state: "renamed";
	/**
	 * The destination class name. Must be a valid JavaScript identifier and
	 * must appear as a live (`state: "created"`) `durableObject` entry in the
	 * same `exports` map.
	 */
	renamedTo: string;
}

/**
 * Tombstone: transfer ownership of a Durable Object namespace to another
 * script in the same account. Two-phase commit: the target script must first
 * deploy an `expectingTransfer` entry naming this script via `transferFrom`.
 */
export interface DurableObjectTransferredExport {
	type: "durable-object";
	state: "transferred";
	/**
	 * The destination script. Must reference a script in the same account.
	 * Cross-dispatch-namespace transfers are rejected.
	 */
	transferredTo: string;
}

/**
 * Live entry that names the receiving side of a two-phase cross-script
 * Durable Object transfer. Both `storage` and `transferFrom` are required.
 * Once the source script's `transferred` tombstone commits, this entry
 * becomes a normal live `durable-object` export.
 */
export interface DurableObjectExpectingTransferExport {
	type: "durable-object";
	state: "expecting-transfer";
	/** Storage backend for the Durable Object. */
	storage: DurableObjectExport["storage"];
	/**
	 * The source script for the two-phase cross-script transfer. The source
	 * script will follow up with a `transferred` tombstone naming this script
	 * to commit the transfer.
	 */
	transferFrom: string;
}

/** Declares a Workflow defined by this Worker. */
export interface WorkflowExport {
	type: "workflow";
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

type DurableObjectExportOptions =
	| Omit<DurableObjectExport, "type">
	| Omit<DurableObjectDeletedExport, "type">
	| Omit<DurableObjectRenamedExport, "type">
	| Omit<DurableObjectTransferredExport, "type">
	| Omit<DurableObjectExpectingTransferExport, "type">;

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
	durableObject(
		options: Omit<DurableObjectExport, "type">
	): DurableObjectExport;
	/**
	 * Tombstone: retire a provisioned Durable Object namespace whose class
	 * has been removed from code.
	 */
	durableObject(
		options: Omit<DurableObjectDeletedExport, "type">
	): DurableObjectDeletedExport;
	/**
	 * Tombstone: rename a provisioned Durable Object namespace's class.
	 */
	durableObject(
		options: Omit<DurableObjectRenamedExport, "type">
	): DurableObjectRenamedExport;
	/**
	 * Tombstone: transfer ownership of a Durable Object namespace to another
	 * script in the same account.
	 */
	durableObject(
		options: Omit<DurableObjectTransferredExport, "type">
	): DurableObjectTransferredExport;
	/**
	 * Receiving side of a two-phase cross-script Durable Object transfer.
	 * The source script must follow up with a `transferred` tombstone to
	 * commit the transfer.
	 */
	durableObject(
		options: Omit<DurableObjectExpectingTransferExport, "type">
	): DurableObjectExpectingTransferExport;
}

function durableObject(
	options: Omit<DurableObjectExport, "type">
): DurableObjectExport;
function durableObject(
	options: Omit<DurableObjectDeletedExport, "type">
): DurableObjectDeletedExport;
function durableObject(
	options: Omit<DurableObjectRenamedExport, "type">
): DurableObjectRenamedExport;
function durableObject(
	options: Omit<DurableObjectTransferredExport, "type">
): DurableObjectTransferredExport;
function durableObject(
	options: Omit<DurableObjectExpectingTransferExport, "type">
): DurableObjectExpectingTransferExport;
function durableObject(
	options: DurableObjectExportOptions
):
	| DurableObjectExport
	| DurableObjectDeletedExport
	| DurableObjectRenamedExport
	| DurableObjectTransferredExport
	| DurableObjectExpectingTransferExport {
	return { type: "durable-object", ...options };
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
 *     OldClass:        exports.durableObject({ state: "deleted" }),
 *     OldName:         exports.durableObject({ state: "renamed", renamedTo: "NewName" }),
 *     Movee:           exports.durableObject({ state: "transferred", transferredTo: "target-worker" }),
 *     Incoming:        exports.durableObject({ state: "expecting-transfer", storage: "sqlite", transferFrom: "source-worker" }),
 *   },
 * });
 * ```
 */
export const exports: Exports = {
	durableObject,
};
