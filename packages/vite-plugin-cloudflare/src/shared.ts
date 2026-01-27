export const UNKNOWN_HOST = "http://localhost";

// pathnames
export const INIT_PATH = "/__vite_plugin_cloudflare_init__";
export const GET_EXPORT_TYPES_PATH =
	"/__vite_plugin_cloudflare_get_export_types__";

// headers
export const WORKER_ENTRY_PATH_HEADER = "__VITE_WORKER_ENTRY_PATH__";
export const IS_ENTRY_WORKER_HEADER = "__VITE_IS_ENTRY_WORKER__";
export const ENVIRONMENT_NAME_HEADER = "__VITE_ENVIRONMENT_NAME__";
export const IS_PARENT_ENVIRONMENT_HEADER = "__VITE_IS_PARENT_ENVIRONMENT__";

// virtual modules
export const virtualPrefix = "virtual:cloudflare/";
export const VIRTUAL_WORKER_ENTRY = `${virtualPrefix}worker-entry`;
export const VIRTUAL_EXPORT_TYPES = `${virtualPrefix}export-types`;
