declare module "__ENTRY_POINT__" {
	import type { Middleware } from "./middleware/common";
	const worker: ExportedHandler & {
		middleware?: Middleware[];
		envWrappers: ((env: Record<string, unknown>) => Record<string, unknown>)[];
	};
	export default worker;
}

declare module "__KV_ASSET_HANDLER__" {
	export * from "@cloudflare/kv-asset-handler";
}

declare module "__STATIC_CONTENT_MANIFEST" {
	const manifest: string;
	export default manifest;
}
