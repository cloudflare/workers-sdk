import type {
	DoRawQueryResult,
	DoSqlWithParams,
} from "../../workers/local-explorer/generated";

export const CORE_PLUGIN_NAME = "core";

// Service for HTTP socket entrypoint (for checking runtime ready, routing, etc)
export const SERVICE_ENTRY = `${CORE_PLUGIN_NAME}:entry`;
// Service for local explorer (API + UI)
export const SERVICE_LOCAL_EXPLORER = `${CORE_PLUGIN_NAME}:local-explorer`;
// Disk service for local explorer UI assets
export const LOCAL_EXPLORER_DISK = `${CORE_PLUGIN_NAME}:local-explorer-disk`;
// URL path prefix where the local explorer UI is served
export const LOCAL_EXPLORER_BASE_PATH = "/cdn-cgi/explorer";
// URL path prefix for the local explorer API endpoints
export const LOCAL_EXPLORER_API_PATH = `${LOCAL_EXPLORER_BASE_PATH}/api`;
// Service prefix for all regular user workers
const SERVICE_USER_PREFIX = `${CORE_PLUGIN_NAME}:user`;
// Service prefix for `workerd`'s builtin services (network, external, disk)
const SERVICE_BUILTIN_PREFIX = `${CORE_PLUGIN_NAME}:builtin`;
// Service prefix for custom fetch functions defined in `serviceBindings` option
const SERVICE_CUSTOM_FETCH_PREFIX = `${CORE_PLUGIN_NAME}:custom-fetch`;
// Service prefix for custom Node functions defined in `serviceBindings` option
const SERVICE_CUSTOM_NODE_PREFIX = `${CORE_PLUGIN_NAME}:custom-node`;

export function getUserServiceName(workerName = "") {
	return `${SERVICE_USER_PREFIX}:${workerName}`;
}

// Namespace custom services to avoid conflicts between user-specified names
// and hardcoded Miniflare names
export enum CustomServiceKind {
	UNKNOWN = "#", // User specified name (i.e. `serviceBindings`)
	KNOWN = "$", // Miniflare specified name (i.e. `outboundService`)
}

export const CUSTOM_SERVICE_KNOWN_OUTBOUND = "outbound";

export function getBuiltinServiceName(
	workerIndex: number,
	kind: CustomServiceKind,
	bindingName: string
) {
	return `${SERVICE_BUILTIN_PREFIX}:${workerIndex}:${kind}${bindingName}`;
}

export function getCustomFetchServiceName(
	workerIndex: number,
	kind: CustomServiceKind,
	bindingName: string
) {
	return `${SERVICE_CUSTOM_FETCH_PREFIX}:${workerIndex}:${kind}${bindingName}`;
}

export function getCustomNodeServiceName(
	workerIndex: number,
	kind: CustomServiceKind,
	bindingName: string
) {
	return `${SERVICE_CUSTOM_NODE_PREFIX}:${workerIndex}:${kind}${bindingName}`;
}

/**
 * Used by the local explorer worker.
 * The method name injected into wrapped Durable Objects for SQLite introspection.
 */
export const INTROSPECT_SQLITE_METHOD = "__miniflare_introspectSqlite";

export type IntrospectSqliteMethod = (
	queries: DoSqlWithParams[]
) => Promise<DoRawQueryResult[]>;
