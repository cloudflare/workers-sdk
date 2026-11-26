import type {
	ConvertedWranglerConfig,
	OutputObject,
	OutputValue,
} from "./types";

/**
 * Adds the framework's Worker settings that a converted Wrangler config doesn't set, to every
 * Worker it renders, one per environment and preview. A Wrangler project is already set up for
 * its framework, so its own values, such as its entrypoint, flags and bindings, are kept.
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
 * Adds the settings that a rendered object doesn't set.
 *
 * @param object The object to update
 * @param settings The settings to add where missing
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
