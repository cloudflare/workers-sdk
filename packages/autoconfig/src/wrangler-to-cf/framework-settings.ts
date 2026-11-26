import type {
	ConvertedWranglerConfig,
	OutputObject,
	OutputValue,
} from "./types";

/**
 * Adds a framework's Worker settings to every Worker that a converted Wrangler config renders,
 * one per environment and preview, so that the migrated config also runs the framework.
 * The framework's values replace migrated ones, objects are merged and arrays are extended,
 * which keeps the migrated bindings and compatibility flags.
 *
 * @param converted The converted Wrangler config
 * @param settings The framework's Worker settings
 */
export function addFrameworkSettings(
	converted: ConvertedWranglerConfig,
	settings: Record<string, unknown>
): void {
	for (const branch of [converted.base, ...converted.environments.values()]) {
		for (const config of [branch.config, branch.previewConfig]) {
			const worker = config?.properties.find(
				(property) => property.key === "worker"
			)?.value;
			if (isOutputObject(worker)) {
				mergeSettings(worker, settings);
			}
		}
	}
}

/**
 * Merges settings into a rendered object.
 *
 * @param object The object to update
 * @param settings The settings to merge into it
 */
function mergeSettings(
	object: OutputObject,
	settings: Record<string, unknown>
): void {
	for (const [key, value] of Object.entries(settings)) {
		if (value === undefined) {
			continue;
		}
		const property = object.properties.find((existing) => existing.key === key);
		if (!property) {
			object.properties.push({ key, value: toOutputValue(value) });
		} else if (isOutputObject(property.value) && isRecord(value)) {
			mergeSettings(property.value, value);
		} else if (Array.isArray(property.value) && Array.isArray(value)) {
			const existingValues = property.value;
			property.value = [
				...existingValues,
				...value
					.filter((item) => !existingValues.includes(item as OutputValue))
					.map(toOutputValue),
			];
		} else {
			property.value = toOutputValue(value);
		}
	}
}

function toOutputValue(value: unknown): OutputValue {
	if (Array.isArray(value)) {
		return value.map(toOutputValue);
	}
	if (isRecord(value)) {
		return {
			kind: "object",
			properties: Object.entries(value)
				.filter(([, entry]) => entry !== undefined)
				.map(([key, entry]) => ({ key, value: toOutputValue(entry) })),
		};
	}
	return value as OutputValue;
}

function isOutputObject(value: OutputValue | undefined): value is OutputObject {
	return (
		typeof value === "object" &&
		value !== null &&
		!Array.isArray(value) &&
		value.kind === "object"
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
