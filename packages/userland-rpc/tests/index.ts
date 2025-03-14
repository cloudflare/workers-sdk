import { RpcTarget, WorkerEntrypoint } from "cloudflare:workers";

class Counter extends RpcTarget {
	#value = 0;

	increment(amount) {
		this.#value += amount;
		return this.#value;
	}

	get value() {
		return this.#value;
	}
}

export class CounterService extends WorkerEntrypoint {
	async newCounter() {
		return new Counter();
	}
}
export default {
	fetch() {
		return new Response("hello");
	},
};
