import { DurableObject } from "cloudflare:workers";

export class FixtureTestContainerA extends DurableObject<Env> {
	container: globalThis.Container;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.container = ctx.container;
	}

	async fetch(req: Request) {
		if (!this.container.running) {
			this.container.start({
				entrypoint: ["node", "app.js"],
				enableInternet: false,
			});
			// On the first request we simply start the container and return,
			// on the following requests the container can actually be accessed.
			// Note that we do this this way because container.start is not awaitable
			// meaning that we can't simply wait here for the container to be ready
			return new Response("Container started");
		}
		return this.container
			.getTcpPort(8080)
			.fetch("http://foo/bar/baz", { method: "POST", body: "hello" });
	}
}

export default {
	async fetch(request, env): Promise<Response> {
		const id = env.CONTAINER_A.idFromName("container");
		const stub = env.CONTAINER_A.get(id);
		return Response.json({
			containerAText: await (await stub.fetch(request)).text(),
			containerBText: await (await env.WORKER_B.fetch(request)).text(),
		});
	},
} satisfies ExportedHandler<Env>;
