import {
	call,
	camelObject,
	getRecord,
	hasOwn,
	isRecord,
	optionsFromRecord,
	type UnknownRecord,
} from "./converter-helpers";
import { inferDurableObjectExports } from "./durable-object-migrations";
import { DURABLE_OBJECT_EXPORTS_DOCS_URL, createFollowUp } from "./follow-ups";
import type { MigrationFollowUp, OutputObject, OutputProperty } from "./types";

export function convertExports(
	source: UnknownRecord,
	sourcePrefix: string,
	imports: Set<string>,
	report: (followUp: MigrationFollowUp) => void
): OutputObject | undefined {
	const configuredExports = getRecord(source, "exports") ?? {};
	const inferred = inferDurableObjectExports(source);
	if (
		Object.keys(configuredExports).length === 0 &&
		inferred.exports.size === 0
	) {
		return undefined;
	}

	const properties: OutputProperty[] = [];
	for (const [name, options] of inferred.exports) {
		if (hasOwn(configuredExports, name)) {
			continue;
		}
		imports.add("exports");
		properties.push({
			key: name,
			value: call(
				"exports.durableObject",
				optionsFromRecord({ ...options }, [
					["renamedTo", "renamedTo"],
					["state", "state"],
					["storage", "storage"],
				])
			),
		});
	}
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
			const inferredOptions = inferred.exports.get(name);
			const exportSource =
				hasOwn(value, "state") || hasOwn(value, "storage")
					? value
					: {
							...value,
							renamed_to: inferredOptions?.renamedTo,
							state: inferredOptions?.state,
							storage: inferredOptions?.storage,
						};
			const options = optionsFromRecord(exportSource, [
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
			if (
				exportSource.storage === undefined &&
				exportSource.state === undefined
			) {
				report(
					createFollowUp(
						"durable-object-review",
						"A Durable Object export has no storage or lifecycle state. Specify its storage from the migration history.",
						{ docsUrl: DURABLE_OBJECT_EXPORTS_DOCS_URL, sourcePath }
					)
				);
			}
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
