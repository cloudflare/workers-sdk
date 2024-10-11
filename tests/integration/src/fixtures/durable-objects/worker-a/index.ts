import { DurableObject } from 'cloudflare:workers';

interface Env {
	COUNTER: DurableObjectNamespace<Counter>;
}

export class Counter extends DurableObject {
	#count = 0;

	override fetch() {
		return Response.json({ count: this.#count });
	}

	async increment() {
		this.#count++;
	}
}

export default {
	async fetch(request, env) {
		const id = env.COUNTER.idFromName('counter');
		const stub = env.COUNTER.get(id);

		const responseA = await stub.fetch(request);
		const resultA = await responseA.json();

		await stub.increment();
		await stub.increment();
		await stub.increment();

		const responseB = await stub.fetch(request);
		const resultB = await responseB.json();

		return Response.json({ resultA, resultB });
	},
} satisfies ExportedHandler<Env>;
