export const ROUTER_WORKER_NAME = "__router-worker__";
export const ASSET_WORKER_NAME = "__asset-worker__";
export const VITE_PROXY_WORKER_NAME = "__vite_proxy_worker__";
export const ASSET_WORKERS_COMPATIBILITY_DATE = "2024-10-04";

export const ENTRY_FILE_EXTENSIONS = [
	".js",
	".mjs",
	".ts",
	".mts",
	".jsx",
	".tsx",
];

export const ADDITIONAL_MODULE_TYPES = [
	"CompiledWasm",
	"Data",
	"Text",
] as const;

// Used to mark HTML assets as being in the public directory so that they can be resolved from their root relative paths
export const PUBLIC_DIR_PREFIX = "/__vite_public_dir__";

export const DEFAULT_INSPECTOR_PORT = 9229;

export const DEBUG_PATH = "/__debug";

export const kRequestType = Symbol("kRequestType");

declare module "http" {
	interface IncomingMessage {
		[kRequestType]?: "asset";
	}
}
