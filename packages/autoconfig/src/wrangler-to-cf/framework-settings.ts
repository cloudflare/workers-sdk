import type {
	ConvertedWranglerConfig,
	OutputObject,
	OutputProperty,
	OutputValue,
} from "./types";

/**
 * Adds the framework's Worker settings to every Worker a converted Wrangler config renders, one
 * per environment and preview. The framework decides the entrypoint, having seen the Wrangler
 * config's: it replaces that entrypoint wherever a Worker uses it. Of the other settings, it
 * only fills in what the Wrangler config doesn't set, since a Wrangler project's own values, such
 * as its flags and bindings, are already right for it.
 *
 * @param converted The converted Wrangler config
 * @param settings The framework's Worker settings
 */
export function addFrameworkSettings(
	converted: ConvertedWranglerConfig,
	{ entrypoint, ...settings }: Record<string, unknown>
): void {
	const workers = [converted.base, ...converted.environments.values()]
		.flatMap((branch) => [branch.config, branch.previewConfig])
		.map(
			(config) =>
				config?.properties.find((property) => property.key === "worker")?.value
		)
		.filter(isOutputObject);
	const existingEntrypoint = getProperty(workers[0], "entrypoint")?.value;
	for (const worker of workers) {
		const workerEntrypoint = getProperty(worker, "entrypoint");
		if (
			typeof entrypoint === "string" &&
			workerEntrypoint !== undefined &&
			workerEntrypoint.value === existingEntrypoint
		) {
			workerEntrypoint.value = entrypoint;
		}
		mergeSettings(worker, { entrypoint, ...settings });
	}
}

function getProperty(
	object: OutputObject | undefined,
	key: string
): OutputProperty | undefined {
	return object?.properties.find((property) => property.key === key);
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
