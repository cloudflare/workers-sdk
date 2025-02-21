export const ROUTER_WORKER_NAME = "__router-worker__";
export const ASSET_WORKER_NAME = "__asset-worker__";
export const ASSET_WORKERS_COMPATIBILITY_DATE = "2024-10-04";
// TODO: add `Text` and `Data` types (resolves https://github.com/cloudflare/workers-sdk/issues/8022)
export const MODULE_TYPES = ["CompiledWasm"] as const;
export type ModuleType = (typeof MODULE_TYPES)[number];

export const DEFAULT_INSPECTOR_PORT = 9229;
