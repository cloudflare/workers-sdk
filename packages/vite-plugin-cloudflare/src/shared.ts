import { MODULE_TYPES } from "./constants";

export const UNKNOWN_HOST = "http://localhost";
export const INIT_PATH = "/__vite_plugin_cloudflare_init__";
export const MODULE_PATTERN = `__CLOUDFLARE_MODULE__(${MODULE_TYPES.join("|")})__(.*?)__`;
