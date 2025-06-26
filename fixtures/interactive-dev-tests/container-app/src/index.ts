import { DurableObject } from "cloudflare:workers";

interface Env {
	CONTAINER: DurableObjectNamespace<Container>;
}
export class Container extends DurableObject<Env> {
	container: globalThis.Container;
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.container = ctx.container!;
	}

	async fetch(req: Request) {
		const path = new URL(req.url).pathname;
		switch (path) {
			case "/status":
				return new Response(JSON.stringify(this.container.running));
			case "/start":
				this.container.start({
					entrypoint: ["node", "app.js"],
					env: { MESSAGE: "FOO" },
					enableInternet: false,
				});
				return new Response("Container create request sent...");

			case "/fetch":
				const res = await this.container
					.getTcpPort(8080)
					.fetch("http://foo/bar/baz", { method: "POST", body: "hello" });
				return new Response(await res.text());
			default:
				return new Response("Hi from Container DO");
		}
	}
}

export default {
	async fetch(request, env): Promise<Response> {
		const id = env.CONTAINER.idFromName("container");
		const stub = env.CONTAINER.get(id);
		return stub.fetch(request);
	},
} satisfies ExportedHandler<Env>;
