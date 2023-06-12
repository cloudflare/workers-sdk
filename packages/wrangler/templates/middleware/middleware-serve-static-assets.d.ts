declare module "config:middleware/serve-static-assets" {
	import type { CacheControl } from "@cloudflare/kv-asset-handler";

	export const spaMode: boolean;
	export const cacheControl: Partial<CacheControl>;
}
