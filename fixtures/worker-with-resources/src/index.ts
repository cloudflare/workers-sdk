import { DurableObject } from "cloudflare:workers";

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext
	): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === "/error") throw new Error("Hello Error");
		if (url.pathname === "/debug") {
			await env.KV.put("test-key", "test-value");
			return new Response((await env.KV.get("test-key")) || "no value");
		}
		return new Response("Hello World!");
	},
};

export class MyDurableObject extends DurableObject {
	async fetch(request: Request): Promise<Response> {
		return new Response("Hello from Durable Object!");
	}
}
