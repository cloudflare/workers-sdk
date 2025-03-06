import { ADDITIONAL_MODULE_TYPES } from "./constants";

export const UNKNOWN_HOST = "http://localhost";
export const INIT_PATH = "/__vite_plugin_cloudflare_init__";
export const MODULE_PATTERN = `__CLOUDFLARE_MODULE__(${ADDITIONAL_MODULE_TYPES.join("|")})__(.*?)__`;

export const VITE_DEV_METADATA_HEADER = "__VITE_DEV_METADATA__";
