import { convertConfigToBindings } from "@cloudflare/deploy-helpers";
import type { StartDevWorkerOptions } from ".";
import type { AdditionalDevProps } from "../../dev";
import type { Config, ConfigBindingFieldName } from "@cloudflare/workers-utils";

export function convertConfigBindingsToStartWorkerBindings(
	configBindings: Partial<Pick<Config, ConfigBindingFieldName>>
): StartDevWorkerOptions["bindings"] {
	return convertConfigToBindings(configBindings, {
		usePreviewIds: true,
	});
}

/**
 * Bindings that can be passed via the StartDevOptions CLI interface.
 */
export type StartDevOptionsBindings = Pick<
	AdditionalDevProps,
	| "vars"
	| "kv"
	| "durableObjects"
	| "services"
	| "r2"
	| "ai"
	| "stream"
	| "version_metadata"
	| "d1Databases"
>;

/**
 * Convert StartDevOptions bindings to the flat StartDevWorkerInput["bindings"] format.
 */
export function convertStartDevOptionsToBindings(
	inputBindings: StartDevOptionsBindings
): StartDevWorkerOptions["bindings"] {
	// Map StartDevOptionsBindings field names to Config field names
	const configBindings = {
		vars: inputBindings.vars,
		kv_namespaces: inputBindings.kv,
		durable_objects: inputBindings.durableObjects
			? { bindings: inputBindings.durableObjects }
			: undefined,
		services: inputBindings.services,
		r2_buckets: inputBindings.r2,
		ai: inputBindings.ai,
		stream: inputBindings.stream,
		version_metadata: inputBindings.version_metadata,
		d1_databases: inputBindings.d1Databases,
	};

	return convertConfigToBindings(configBindings, {
		usePreviewIds: true,
	});
}
