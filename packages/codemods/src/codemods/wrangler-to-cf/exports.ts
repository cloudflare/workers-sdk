import {
	call,
	camelObject,
	getRecord,
	hasOwn,
	isRecord,
	optionsFromRecord,
	type UnknownRecord,
} from "./converter-helpers";
import { DURABLE_OBJECT_EXPORTS_DOCS_URL, createFollowUp } from "./follow-ups";
import type { MigrationFollowUp, OutputObject, OutputProperty } from "./types";

export function convertExports(
	source: UnknownRecord,
	sourcePrefix: string,
	imports: Set<string>,
	report: (followUp: MigrationFollowUp) => void
): OutputObject | undefined {
	const configuredExports = getRecord(source, "exports");
	if (!configuredExports) {
		return undefined;
	}

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
				value: call(
					"exports.workflow",
					optionsFromRecord(value, [
						["name", "name"],
						["limits", "limits"],
						["concurrency", "concurrency"],
						["schedules", "schedules"],
						["default_retention", "default_retention"],
					])
				),
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
	return properties.length > 0 ? { kind: "object", properties } : undefined;
}
