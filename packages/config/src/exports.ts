// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS API
// Named types and helper factories for declaring class exports.
//
// The TS-facing API follows the same structural shape as wrangler upload
// metadata, with two stylistic transforms:
//
//   - property names are camelCased (`renamedTo`, `transferredTo`,
//     `transferFrom`),
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
export interface DurableObjectCreatedExportOptions {
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
 * Retire a provisioned Durable Object namespace whose class has
 * been removed from code.
 *
 * During deploy, the class must not be exported in the uploaded code, and no
 * other Worker may hold a `durableObject` binding to the namespace.
 */
export interface DurableObjectDeletedExportOptions {
	state: "deleted";
}

/**
 * Rename a provisioned Durable Object namespace's class. The
 * `renamedTo` value must also appear as a live (`state: "created"`)
 * `durableObject` entry in the same `exports` map.
 */
export interface DurableObjectRenamedExportOptions {
	state: "renamed";
	/**
	 * The destination class name. Must be a valid JavaScript identifier and
	 * must appear as a live (`state: "created"`) `durableObject` entry in the
	 * same `exports` map.
	 */
	renamedTo: string;
}

/**
 * Transfer ownership of a Durable Object namespace to another Worker in the same account.
 * The target Worker must first deploy an `expectingTransfer` entry naming this Worker via `transferFrom`.
 */
export interface DurableObjectTransferredExportOptions {
	state: "transferred";
	/**
	 * The destination Worker. Must reference a Worker in the same account.
	 */
	transferredTo: string;
}

/**
 * Prepare to receive cross-Worker Durable Object transfer.
 * Once the source Worker's `transferred` export is deployed, this entry becomes a normal live `durable-object` export.
 */
export interface DurableObjectExpectingTransferExportOptions {
	state: "expecting-transfer";
	storage: "sqlite" | "legacy-kv";
	/**
	 * The source Worker for the two-phase cross-Worker transfer.
	 */
	transferFrom: string;
}

export interface DurableObjectCreatedExport extends DurableObjectCreatedExportOptions {
	type: "durable-object";
}
export interface DurableObjectDeletedExport extends DurableObjectDeletedExportOptions {
	type: "durable-object";
}
export interface DurableObjectRenamedExport extends DurableObjectRenamedExportOptions {
	type: "durable-object";
}
export interface DurableObjectTransferredExport extends DurableObjectTransferredExportOptions {
	type: "durable-object";
}

export interface DurableObjectExpectingTransferExport extends DurableObjectExpectingTransferExportOptions {
	type: "durable-object";
}

export type DurableObjectExportOptions =
	| DurableObjectCreatedExportOptions
	| DurableObjectDeletedExportOptions
	| DurableObjectRenamedExportOptions
	| DurableObjectTransferredExportOptions
	| DurableObjectExpectingTransferExportOptions;

type DurableObjectExports =
	| DurableObjectCreatedExport
	| DurableObjectDeletedExport
	| DurableObjectRenamedExport
	| DurableObjectTransferredExport
	| DurableObjectExpectingTransferExport;

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
		options: DurableObjectCreatedExportOptions
	): DurableObjectCreatedExport;
	/**
	 * Retire a provisioned Durable Object namespace whose class has been removed from code.
	 */
	durableObject(
		options: DurableObjectDeletedExportOptions
	): DurableObjectDeletedExport;
	/**
	 * Rename a provisioned Durable Object namespace's class.
	 */
	durableObject(
		options: DurableObjectRenamedExportOptions
	): DurableObjectRenamedExport;
	/**
	 * Transfer ownership of a Durable Object namespace to another Worker in the same account.
	 */
	durableObject(
		options: DurableObjectTransferredExportOptions
	): DurableObjectTransferredExport;
	/**
	 * Prepare to receive cross-Worker Durable Object transfer.
	 * The source Worker must follow up with a deployment containing a `transferred` export to commit the transfer.
	 */
	durableObject(
		options: DurableObjectExpectingTransferExportOptions
	): DurableObjectExpectingTransferExport;
}

function durableObject(
	options: DurableObjectCreatedExportOptions
): DurableObjectCreatedExport;
function durableObject(
	options: DurableObjectDeletedExportOptions
): DurableObjectDeletedExport;
function durableObject(
	options: DurableObjectRenamedExportOptions
): DurableObjectRenamedExport;
function durableObject(
	options: DurableObjectTransferredExportOptions
): DurableObjectTransferredExport;
function durableObject(
	options: DurableObjectExpectingTransferExportOptions
): DurableObjectExpectingTransferExport;
function durableObject(
	options: DurableObjectExportOptions
): DurableObjectExports {
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
 *     Outgoing:        exports.durableObject({ state: "transferred", transferredTo: "target-worker" }),
 *     Incoming:        exports.durableObject({ state: "expecting-transfer", storage: "sqlite", transferFrom: "source-worker" }),
 *   },
 * });
 * ```
 */
export const exports: Exports = {
	durableObject,
};
