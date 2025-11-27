import { DurableObject } from "cloudflare:workers";

interface Env {
	CONTAINER: DurableObjectNamespace;
}

export class Container extends DurableObject<Env> {
	container: globalThis.Container;
	monitor?: Promise<unknown>;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.container = ctx.container!;
	}

	override async fetch(req: Request) {
		const path = new URL(req.url).pathname;
		switch (path) {
			case "/status":
				return new Response(JSON.stringify(this.container.running));

			case "/destroy":
				if (!this.container.running) {
					throw new Error("Container is not running.");
				}
				await this.container.destroy();
				return new Response(JSON.stringify(this.container.running));

			case "/start":
				this.container.start({
					entrypoint: ["node", "app.js"],
					env: { A: "B", C: "D", L: "F" },
					enableInternet: false,
				});
				// this doesn't instantly start, so we will need to poll /fetch
				return new Response("Container create request sent...");

			case "/fetch":
				const res = await this.container
					.getTcpPort(8080)
					// actual request doesn't matter
					.fetch("http://foo/bar/baz", { method: "POST", body: "hello" });
				return new Response(await res.text());

			case "/destroy-with-monitor":
				// if (!this.container.running) {
				// 	throw new Error("Container is not running.");
				// }
				const monitor = this.container.monitor();
				await this.container.destroy();
				await monitor;
				return new Response("Container destroyed with monitor.");

			default:
				return new Response("Hi from Container DO");
		}
	}
}

export default {
	async fetch(request, env): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname === "/second") {
			// This is a second Durable Object that can be used to test multiple DOs
			const id = env.CONTAINER.idFromName("second-container");
			const stub = env.CONTAINER.get(id);
			const query = url.searchParams.get("req");
			return stub.fetch("http://example.com/" + query);
		}
		const id = env.CONTAINER.idFromName("container");
		const stub = env.CONTAINER.get(id);
		return stub.fetch(request);
	},
} satisfies ExportedHandler<Env>;
