import { DurableObject } from "cloudflare:workers";

export class Container extends DurableObject<Env> {
	container: globalThis.Container;
	monitor?: Promise<unknown>;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.container = ctx.container!;
		void this.ctx.blockConcurrencyWhile(async () => {
			if (!this.container.running) this.container.start();
		});
	}

	async fetch(req: Request) {
		try {
			return await this.container
				.getTcpPort(8080)
				.fetch(req.url.replace("https:", "http:"), req);
		} catch (err) {
			return new Response(`${this.ctx.id.toString()}: ${err.message}`, {
				status: 500,
			});
		}
	}
}

export default {
	async fetch(request, env): Promise<Response> {
		try {
			return await env.CONTAINER.get(env.CONTAINER.idFromName("fetcher")).fetch(
				request
			);
		} catch (err) {
			console.error("Error fetch:", err.message);
			return new Response(err.message, { status: 500 });
		}
	},
} satisfies ExportedHandler<Env>;
