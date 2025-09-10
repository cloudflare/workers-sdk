import { ADDITIONAL_MODULE_TYPES, virtualPrefix } from "./constants";

export const UNKNOWN_HOST = "http://localhost";
export const INIT_PATH = "/__vite_plugin_cloudflare_init__";

const ADDITIONAL_MODULE_PATTERN = `__CLOUDFLARE_MODULE__(${ADDITIONAL_MODULE_TYPES.join("|")})__(.*?)__CLOUDFLARE_MODULE__`;
export const additionalModuleRE = new RegExp(ADDITIONAL_MODULE_PATTERN);
export const additionalModuleGlobalRE = new RegExp(
	ADDITIONAL_MODULE_PATTERN,
	"g"
);

export const WORKER_ENTRY_PATH_HEADER = "__VITE_WORKER_ENTRY_PATH__";

export const VIRTUAL_WORKER_ENTRY = `${virtualPrefix}worker-entry`;
