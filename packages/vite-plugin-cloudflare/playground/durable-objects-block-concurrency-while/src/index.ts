import { DurableObject } from "cloudflare:workers";

interface Env {
	PINGER: DurableObjectNamespace<Pinger>;
}

export class Pinger extends DurableObject<Env> {
	initialized = false

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env)
		console.log(`DoDurableObject[${new Date().toISOString()}]: constructor: initialized: ${this.initialized}: begin`)
		ctx.blockConcurrencyWhile(async () => {
			console.log(
				`DoDurableObject[${new Date().toISOString()}]: constructor: blockConcurrencyWhile: initialized: ${this.initialized}: begin`
			)
			this.initialized = true
			console.log(`DoDurableObject[${new Date().toISOString()}]: constructor: blockConcurrencyWhile: initialized: ${this.initialized}: end`)
		})
		console.log(`DoDurableObject[${new Date().toISOString()}]: constructor: ${this.initialized}: end`)
	}

	async ping() {
		console.log(`DoDurableObject[${new Date().toISOString()}]: ping: initialized: ${this.initialized}`)
		return { ping: 'pong', initialized: this.initialized }
	}
}

export default {
	async fetch(request, env) {
		let url = new URL(request.url);
		let name = url.searchParams.get("name");

		if (!name) {
			return new Response(
				"Select a Durable Object to contact by using the `name` URL query string parameter, for example, ?name=A"
			);
		}

		const id = env.PINGER.idFromName(name);
		const stub = env.PINGER.get(id);
		let count = null;

		switch (url.pathname) {
			case "/":
				count = JSON.stringify(await stub.ping());
				break;
			default:
				return new Response("Not found", { status: 404 });
		}

		return new Response(`Durable Object '${name}' ping: ${count}`);
	},
} satisfies ExportedHandler<Env>;
