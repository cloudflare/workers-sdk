import { DurableObject } from "cloudflare:workers";

export class Counter extends DurableObject {
	async getCounterValue() {
		let value = (await this.ctx.storage.get("value")) || 0;
		return value;
	}

	async increment(amount = 1) {
		let value = (await this.ctx.storage.get<number>("value")) || 0;
		value += amount;
		await this.ctx.storage.put("value", value);
		return value;
	}

	async decrement(amount = 1) {
		let value = (await this.ctx.storage.get<number>("value")) || 0;
		value -= amount;
		await this.ctx.storage.put("value", value);
		return value;
	}
}

export default {
	async fetch(
		request: Request,
		_env: never,
		ctx: ExecutionContext
	): Promise<Response> {
		let url = new URL(request.url);
		let name = url.searchParams.get("name");
		if (!name) {
			return new Response(
				"Select a Durable Object to contact by using" +
					" the `name` URL query string parameter, for example, ?name=A"
			);
		}

		let stub = ctx.exports.Counter.getByName(name);

		// Send a request to the Durable Object using RPC methods, then await its response.
		let count = null;
		switch (url.pathname) {
			case "/increment":
				count = await stub.increment();
				break;
			case "/decrement":
				count = await stub.decrement();
				break;
			case "/":
				// Serves the current value.
				count = await stub.getCounterValue();
				break;
			default:
				return new Response("Not found", { status: 404 });
		}

		return new Response(`count: ${count}`);
	},
};
