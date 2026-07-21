export const SharedHeaders = {
	LOG_LEVEL: "MF-Log-Level",
	// Resource id (KV namespace / R2 bucket / D1 database) supplied per-request
	// by the storage-owner server so a single shared object-entry service can
	// resolve any resource without a per-id binding. Read by object-entry.
	STORAGE_OWNER_NAMESPACE: "MF-Storage-Owner-Namespace",
} as const;

export const SharedBindings = {
	TEXT_NAMESPACE: "MINIFLARE_NAMESPACE",
	DURABLE_OBJECT_NAMESPACE_OBJECT: "MINIFLARE_OBJECT",
	MAYBE_SERVICE_BLOBS: "MINIFLARE_BLOBS",
	MAYBE_SERVICE_LOOPBACK: "MINIFLARE_LOOPBACK",
	MAYBE_JSON_ENABLE_CONTROL_ENDPOINTS: "MINIFLARE_ENABLE_CONTROL_ENDPOINTS",
	MAYBE_JSON_ENABLE_STICKY_BLOBS: "MINIFLARE_STICKY_BLOBS",
} as const;

export enum LogLevel {
	NONE,
	ERROR,
	WARN,
	INFO,
	DEBUG,
	VERBOSE,
}
