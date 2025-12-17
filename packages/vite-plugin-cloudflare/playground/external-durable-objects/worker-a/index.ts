import type { Counter } from "../worker-b";

interface Env {
	COUNTERS: DurableObjectNamespace<Counter>;
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		const name = url.searchParams.get("name");

		if (!name) {
			throw new Error(
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
			case "/":
				count = await stub.getCounterValue();
				break;
			default:
				throw new Error("Unhandled route");
		}

		return new Response(`From worker-a: ${JSON.stringify({ name, count })}`);
	},
} satisfies ExportedHandler<Env>;
