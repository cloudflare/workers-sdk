import { DurableObject } from "cloudflare:workers";

interface Env {
	COUNTERS: DurableObjectNamespace<Counter>;
	LEGACY: DurableObjectNamespace;
}

export class Counter extends DurableObject {
	async getCounterValue() {
		const value = ((await this.ctx.storage.get("value")) as number) || 0;

		return value;
	}

	async increment(amount = 1) {
		let value = ((await this.ctx.storage.get("value")) as number) || 0;
		value += amount;
		await this.ctx.storage.put("value", value);

		return value;
	}

	async decrement(amount = 1) {
		let value = ((await this.ctx.storage.get("value")) as number) || 0;
		value -= amount;
		await this.ctx.storage.put("value", value);

		return value;
	}
}

// Included to ensure that classes that don't extent `DurableObject` are also supported
export class Legacy {
	fetch() {
		return new Response("Legacy Durable Object");
	}
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		if (url.pathname === "/legacy") {
			const id = env.LEGACY.idFromName("test");
			const stub = env.LEGACY.get(id);

			return stub.fetch(request);
		}

		const name = url.searchParams.get("name");

		if (!name) {
			return new Response(
				"Select a Durable Object to contact by using the `name` URL query string parameter, for example, ?name=A"
			);
		}

		const id = env.COUNTERS.idFromName(name);
		const stub = env.COUNTERS.get(id);
		let count = null;

		switch (url.pathname) {
			case "/increment":
				count = await stub.increment();
				break;
			case "/decrement":
				count = await stub.decrement();
				break;
			case "/":
				count = await stub.getCounterValue();
				break;
			default:
				return new Response("Not found", { status: 404 });
		}

		return new Response(`Durable Object '${name}' count: ${count}`);
	},
} satisfies ExportedHandler<Env>;
