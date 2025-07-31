/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `wrangler dev src/index.ts` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `wrangler deploy src/index.ts --name my-worker` to deploy your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import { WorkerEntrypoint } from "cloudflare:workers";

interface UnsafeBindingService extends WorkerEntrypoint {
	performUnsafeWrite(key: string, value: number): Promise<void>
	performUnsafeRead(key: string): Promise<{ ok: boolean; }>
}

export interface Env {
	UNSAFE_SERVICE_BINDING: Service<UnsafeBindingService>
	// Example binding to KV. Learn more at https://developers.cloudflare.com/workers/runtime-apis/kv/
	// MY_KV_NAMESPACE: KVNamespace;
	//
	// Example binding to Durable Object. Learn more at https://developers.cloudflare.com/workers/runtime-apis/durable-objects/
	// MY_DURABLE_OBJECT: DurableObjectNamespace;
	//
	// Example binding to R2. Learn more at https://developers.cloudflare.com/workers/runtime-apis/r2/
	// MY_BUCKET: R2Bucket;
	//
	// Example binding to a Service. Learn more at https://developers.cloudflare.com/workers/runtime-apis/service-bindings/
	// MY_SERVICE: Fetcher;
}

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext
	): Promise<Response> {
		await env.UNSAFE_SERVICE_BINDING.performUnsafeWrite("dog", 12345);
		console.log(await env.UNSAFE_SERVICE_BINDING.performUnsafeRead("dog"));
		const url = new URL(request.url);
		if (url.pathname === "/error") throw new Error("Hello Error");
		return new Response("Hello World!");
	},
};
