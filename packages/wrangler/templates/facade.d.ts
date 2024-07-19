declare module "__ENTRY_POINT__" {
	import { Middleware } from "./middleware/common";
	import { WorkerEntrypoint } from "cloudflare:workers";

	export type WorkerEntrypointConstructor = typeof WorkerEntrypoint;

	const worker: ExportedHandler | WorkerEntrypointConstructor;
	export default worker;
	export const __INTERNAL_WRANGLER_MIDDLEWARE__: Middleware[];
}

declare module "__KV_ASSET_HANDLER__" {
	export * from "@cloudflare/kv-asset-handler";
}

declare module "__STATIC_CONTENT_MANIFEST" {
	const manifest: string;
	export default manifest;
}
