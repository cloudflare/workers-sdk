import type { UnknownRecord } from "./helpers";
import type { RawConfig } from "@cloudflare/workers-utils/config";

const NON_INHERITABLE_FIELDS = new Set<string>([
	"agent_memory",
	"ai_search_namespaces",
	"ai_search",
	"ai",
	"analytics",
	"analytics_engine_datasets",
	"artifacts",
	"browser",
	"cloudchamber",
	"connect",
	"containers",
	"d1_databases",
	"define",
	"dispatch_namespaces",
	"durable_objects",
	"flagship",
	"hyperdrive",
	"images",
	"k2",
	"kv_namespaces",
	"media",
	"mtls_certificates",
	"oidc_tokens",
	"pipelines",
	"queues",
	"r2_buckets",
	"ratelimits",
	"realtimekit",
	"secrets_store_secrets",
	"secrets",
	"send_email",
	"services",
	"stream",
	"streaming_tail_consumers",
	"tail_consumers",
	"unsafe_hello_world",
	"unsafe",
	"vars",
	"vectorize",
	"version_metadata",
	"vpc_networks",
	"vpc_services",
	"worker_loaders",
	"workflows",
] satisfies (keyof RawConfig)[]);

/**
 * Builds the settings one branch sees: the top level, or an environment over it.
 *
 * @param base The Wrangler config's top level
 * @param overrides The environment's own settings
 * @param environmentName The environment's name, for an environment branch
 * @returns The merged settings
 */
export function createBranchSource(
	base: UnknownRecord,
	overrides: UnknownRecord,
	environmentName?: string
): UnknownRecord {
	const merged: UnknownRecord = { ...base };
	delete merged.env;

	if (environmentName !== undefined) {
		for (const field of NON_INHERITABLE_FIELDS) {
			delete merged[field];
		}
	}

	Object.assign(merged, overrides);

	if (
		environmentName !== undefined &&
		typeof overrides.name !== "string" &&
		typeof base.name === "string"
	) {
		merged.name = `${base.name}-${environmentName}`;
	}

	return merged;
}

/**
 * Builds the settings a branch's previews see.
 *
 * @param base The branch's settings
 * @param overrides The `previews` settings
 * @returns The merged settings
 */
export function createPreviewSource(
	base: UnknownRecord,
	overrides: UnknownRecord
): UnknownRecord {
	const merged = createBranchSource(base, {});

	for (const field of NON_INHERITABLE_FIELDS) {
		delete merged[field];
	}
	delete merged.logfwdr;

	Object.assign(merged, overrides);
	delete merged.previews;

	return merged;
}
