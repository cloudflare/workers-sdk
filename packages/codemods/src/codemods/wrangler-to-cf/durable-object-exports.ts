import {
	getRecord,
	getRecords,
	getStrings,
	isRecord,
	type UnknownRecord,
} from "./converter-helpers";
import { DURABLE_OBJECT_EXPORTS_DOCS_URL, createFollowUp } from "./follow-ups";
import type { MigrationFollowUp } from "./types";

/**
 * Replays Wrangler migration history into declarative Durable Object exports.
 * Explicit exports take precedence, and bindings to other Workers do not
 * declare exports in this Worker.
 *
 * @param source Raw Worker configuration, with environment overrides applied.
 * @param sourcePrefix The source environment's path for follow-up diagnostics.
 * @param report Reports configuration that cannot be inferred automatically.
 * @returns Inferred lifecycle declarations merged with explicit exports.
 */
export function inferDurableObjectExports(
	source: UnknownRecord,
	sourcePrefix: string,
	report: (followUp: MigrationFollowUp) => void
): UnknownRecord {
	const prefix = sourcePrefix ? `${sourcePrefix}.` : "";
	const { inferred, locations } = replayDurableObjectMigrations(source, prefix);
	const configured = getRecord(source, "exports") ?? {};
	const exports = { ...Object.fromEntries(inferred), ...configured };

	reportMissingStorage(exports, configured, locations, prefix, report);
	reportMissingLocalExports(source, exports, prefix, report);

	return exports;
}

function replayDurableObjectMigrations(source: UnknownRecord, prefix: string) {
	const inferred = new Map<string, UnknownRecord>();
	const locations = new Map<string, string>();
	for (const [index, migration] of getRecords(source, "migrations").entries()) {
		const sourcePath = `${prefix}migrations.${index}`;
		applyCreatedClasses(migration, sourcePath, inferred, locations);
		applyRenamedClasses(migration, sourcePath, inferred, locations);
		applyTransferredClasses(migration, sourcePath, inferred, locations);
		applyDeletedClasses(migration, inferred);
	}
	return { inferred, locations };
}

function applyCreatedClasses(
	migration: UnknownRecord,
	sourcePath: string,
	inferred: Map<string, UnknownRecord>,
	locations: Map<string, string>
): void {
	for (const [field, storage] of [
		["new_classes", "legacy-kv"],
		["new_sqlite_classes", "sqlite"],
	] as const) {
		for (const name of getStrings(migration, field)) {
			inferred.set(name, { storage, type: "durable-object" });
			locations.set(name, `${sourcePath}.${field}`);
		}
	}
}

function applyRenamedClasses(
	migration: UnknownRecord,
	sourcePath: string,
	inferred: Map<string, UnknownRecord>,
	locations: Map<string, string>
): void {
	for (const rename of getRecords(migration, "renamed_classes")) {
		if (typeof rename.from !== "string" || typeof rename.to !== "string") {
			continue;
		}
		const previous = inferred.get(rename.from);
		// Rename tombstones must point directly to a live class, even after
		// multiple renames of the same namespace.
		for (const value of inferred.values()) {
			if (value.state === "renamed" && value.renamed_to === rename.from) {
				value.renamed_to = rename.to;
			}
		}
		inferred.set(rename.from, {
			renamed_to: rename.to,
			state: "renamed",
			type: "durable-object",
		});
		inferred.set(rename.to, {
			storage: previous?.storage,
			type: "durable-object",
		});
		locations.set(rename.to, `${sourcePath}.renamed_classes`);
	}
}

function applyTransferredClasses(
	migration: UnknownRecord,
	sourcePath: string,
	inferred: Map<string, UnknownRecord>,
	locations: Map<string, string>
): void {
	for (const transfer of getRecords(migration, "transferred_classes")) {
		if (typeof transfer.to !== "string") {
			continue;
		}
		inferred.set(transfer.to, { type: "durable-object" });
		locations.set(transfer.to, `${sourcePath}.transferred_classes`);
	}
}

function applyDeletedClasses(
	migration: UnknownRecord,
	inferred: Map<string, UnknownRecord>
): void {
	for (const name of getStrings(migration, "deleted_classes")) {
		for (const value of inferred.values()) {
			if (value.state === "renamed" && value.renamed_to === name) {
				delete value.renamed_to;
				value.state = "deleted";
			}
		}
		inferred.set(name, { state: "deleted", type: "durable-object" });
	}
}

function reportMissingStorage(
	exports: UnknownRecord,
	configured: UnknownRecord,
	locations: Map<string, string>,
	prefix: string,
	report: (followUp: MigrationFollowUp) => void
): void {
	for (const [name, value] of Object.entries(exports)) {
		if (
			!isRecord(value) ||
			value.type !== "durable-object" ||
			(value.state !== undefined &&
				value.state !== "created" &&
				value.state !== "expecting-transfer") ||
			value.storage === "sqlite" ||
			value.storage === "legacy-kv"
		) {
			continue;
		}
		report(
			createFollowUp(
				"durable-object-storage",
				`The storage backend for Durable Object \`${name}\` is missing or unsupported. Set \`storage\` to \`"sqlite"\` or \`"legacy-kv"\` in its export. Transfers do not record storage; renames require the original class's creation migration.`,
				{
					docsUrl: DURABLE_OBJECT_EXPORTS_DOCS_URL,
					sourcePath: isRecord(configured[name])
						? `${prefix}exports.${name}`
						: locations.get(name),
				}
			)
		);
	}
}

function reportMissingLocalExports(
	source: UnknownRecord,
	exports: UnknownRecord,
	prefix: string,
	report: (followUp: MigrationFollowUp) => void
): void {
	const durableObjects = getRecord(source, "durable_objects");
	for (const [index, binding] of getRecords(
		durableObjects ?? {},
		"bindings"
	).entries()) {
		let worker =
			typeof binding.script_name === "string"
				? binding.script_name
				: source.name;
		if (typeof binding.environment === "string") {
			worker = `${String(worker)}-${binding.environment}`;
		}
		if (
			worker !== source.name ||
			typeof binding.class_name !== "string" ||
			binding.class_name.length === 0
		) {
			continue;
		}
		const value = exports[binding.class_name];
		if (
			isRecord(value) &&
			value.type === "durable-object" &&
			(value.state === undefined ||
				value.state === "created" ||
				value.state === "expecting-transfer")
		) {
			continue;
		}
		report(
			createFollowUp(
				"durable-object-export",
				`The local Durable Object binding \`${String(binding.name)}\` references \`${binding.class_name}\`, but no live export could be inferred. Verify its \`class_name\`, then add its creation migration or declare a live export with the correct storage backend.`,
				{
					docsUrl: DURABLE_OBJECT_EXPORTS_DOCS_URL,
					sourcePath: `${prefix}durable_objects.bindings.${index}`,
				}
			)
		);
	}
}
