export const DEFAULT_COMPATIBILITY_DATE = "2025-01-01";

export const WORKER_ENTRY_NAME = "index";

export const cloudflareBuiltInModules = [
	"cloudflare:email",
	"cloudflare:node",
	"cloudflare:sockets",
	"cloudflare:workers",
	"cloudflare:workflows",
];

export const defaultConditions = ["workerd", "worker", "module", "browser"];
