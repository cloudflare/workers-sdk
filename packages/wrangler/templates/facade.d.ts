declare module "__ENTRY_POINT__" {
	import { Middleware } from "./middleware/common";
	import { WorkerEntrypoint } from "cloudflare:workers";

	export type WorkerEntrypointConstructor = typeof WorkerEntrypoint;
	export type WithMiddleware<T> = T & { middleware?: Middleware[] };

	const worker: WithMiddleware<ExportedHandler | WorkerEntrypointConstructor>;
	export default worker;
}

declare module "__KV_ASSET_HANDLER__" {
	export * from "@cloudflare/kv-asset-handler";
}

declare module "__STATIC_CONTENT_MANIFEST" {
	const manifest: string;
	export default manifest;
}
