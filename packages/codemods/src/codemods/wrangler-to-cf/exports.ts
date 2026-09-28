import {
	call,
	camelObject,
	getRecord,
	getRecords,
	hasOwn,
	isRecord,
	optionsFromRecord,
	toOutputValue,
	type UnknownRecord,
} from "./converter-helpers";
import { DURABLE_OBJECT_EXPORTS_DOCS_URL, createFollowUp } from "./follow-ups";
import type { MigrationFollowUp, OutputObject, OutputProperty } from "./types";

/**
 * Options for `exports.workflow(...)`, from either a Wrangler `exports`
 * entry of type "workflow" or a `workflows` binding entry. Both carry the
 * same snake_case settings, and the new config spells the nested retention
 * keys in camelCase (`defaultRetention.successRetention`).
 */
function workflowExportOptions(record: UnknownRecord): OutputObject {
	const properties: OutputProperty[] = [];
	const name = toOutputValue(record.name);
	if (name !== undefined) {
		properties.push({ key: "name", value: name });
	}
	for (const key of ["limits", "concurrency"] as const) {
		const value = getRecord(record, key);
		if (value) {
			properties.push({ key, value: camelObject(value) });
		}
	}
	const schedules = toOutputValue(record.schedules);
	if (schedules !== undefined) {
		properties.push({ key: "schedules", value: schedules });
	}
	const retention = getRecord(record, "default_retention");
	if (retention) {
		properties.push({ key: "defaultRetention", value: camelObject(retention) });
	}
	return { kind: "object", properties };
}

export function convertExports(
	source: UnknownRecord,
	sourcePrefix: string,
	imports: Set<string>,
	report: (followUp: MigrationFollowUp) => void
): OutputObject | undefined {
	const configuredExports = getRecord(source, "exports") ?? {};

	const properties: OutputProperty[] = [];
	for (const [name, value] of Object.entries(configuredExports)) {
		if (!isRecord(value)) {
			continue;
		}

		const sourcePath = `${sourcePrefix ? `${sourcePrefix}.` : ""}exports.${name}`;
		if (value.type === "worker") {
			imports.add("exports");
			const args = getRecord(value, "cache");
			properties.push({
				key: name,
				value: args
					? call("exports.worker", {
							kind: "object",
							properties: [
								{
									key: "cache",
									value: camelObject(args),
								},
							],
						})
					: call("exports.worker"),
			});
			continue;
		}

		if (value.type === "durable-object") {
			imports.add("exports");
			const options = optionsFromRecord(value, [
				["renamed_to", "renamedTo"],
				["state", "state"],
				["storage", "storage"],
				["transfer_from", "transferFrom"],
				["transferred_to", "transferredTo"],
			]);
			properties.push({
				key: name,
				value: call("exports.durableObject", options),
			});
			report(
				createFollowUp(
					"durable-object-review",
					"Durable Object exports require manual review after migration.",
					{ docsUrl: DURABLE_OBJECT_EXPORTS_DOCS_URL, sourcePath }
				)
			);
			if (hasOwn(value, "container")) {
				report(
					createFollowUp(
						"container-review",
						"A Durable Object export references a Container. Reconnect it manually after migrating the Container.",
						{ sourcePath }
					)
				);
			}
			continue;
		}

		if (value.type === "workflow") {
			imports.add("exports");
			properties.push({
				key: name,
				value: call("exports.workflow", workflowExportOptions(value)),
			});
			continue;
		}

		report(
			createFollowUp(
				"unsupported-export",
				`The export \`${name}\` could not be migrated.`,
				{ sourcePath }
			)
		);
	}
	// A `workflows` binding to a class this Worker defines (no `script_name`)
	// becomes an export here, carrying the Workflow's settings. Classes the
	// Wrangler `exports` table already declares keep that declaration.
	const declared = new Set(properties.map((property) => property.key));
	for (const entry of getRecords(source, "workflows")) {
		if (
			typeof entry.script_name === "string" ||
			typeof entry.class_name !== "string" ||
			entry.class_name.length === 0 ||
			declared.has(entry.class_name)
		) {
			continue;
		}
		imports.add("exports");
		declared.add(entry.class_name);
		properties.push({
			key: entry.class_name,
			value: call("exports.workflow", workflowExportOptions(entry)),
		});
	}

	return properties.length > 0 ? { kind: "object", properties } : undefined;
}
