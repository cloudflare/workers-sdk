// TODO(soon): remove once https://github.com/cloudflare/workerd/pull/1870 lands
declare module "cloudflare:workers" {
	export class WorkerEntrypoint {
		constructor(
			protected ctx: ExecutionContext,
			protected env: Record<string, unknown>
		);

		fetch?(request: Request): Response | Promise<Response>;
		scheduled?(controller: ScheduledController): void | Promise<void>;
	}
}

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
