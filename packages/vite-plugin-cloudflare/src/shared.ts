import { ADDITIONAL_MODULE_TYPES } from "./constants";

export const UNKNOWN_HOST = "http://localhost";
export const INIT_PATH = "/__vite_plugin_cloudflare_init__";

const ADDITIONAL_MODULE_PATTERN = `__CLOUDFLARE_MODULE__(${ADDITIONAL_MODULE_TYPES.join("|")})__(.*?)__`;
export const additionalModuleRE = new RegExp(ADDITIONAL_MODULE_PATTERN);
export const additionalModuleGlobalRE = new RegExp(
	ADDITIONAL_MODULE_PATTERN,
	"g"
);

export const VITE_DEV_METADATA_HEADER = "__VITE_DEV_METADATA__";
