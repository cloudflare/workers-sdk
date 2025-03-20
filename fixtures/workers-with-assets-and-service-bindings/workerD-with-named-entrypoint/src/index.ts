import { RpcTarget, WorkerEntrypoint } from "cloudflare:workers";

export class EntrypointD extends WorkerEntrypoint {
	/*
	 * `fetch` method
	 */
	async fetch(request) {
		return new Response("Hello from worker-d fetch()");
	}

	/*
	 * Named method without parameters
	 */
	bee() {
		return "Hello from worker-d bee()";
	}

	/*
	 * Named method with parameters
	 */
	busyBee(bee: string) {
		return `Hello busy ${bee}s from worker-d busyBee(bee)`;
	}

	/*
	 * Nested functions
	 *
	 * see https://developers.cloudflare.com/workers/runtime-apis/rpc/#promise-pipelining
	 */
	async foo(emoji: string) {
		return {
			bar: {
				buzz: () => `You made it! ${emoji}`,
			},
		};
	}

	/*
	 * Class instances
	 *
	 * see https://developers.cloudflare.com/workers/runtime-apis/rpc/#class-instances
	 */
	async newBeeCounter() {
		return new BeeCounter();
	}

	/*
	 * Cron Triggers/ Queues / etc can only be defined on a default
	 * exports, class or non-class based
	 */
}

export default class extends WorkerEntrypoint {
	async fetch(request) {
		return new Response("Hello from worker-d default entrypoint fetch()");
	}
}

class BeeCounter extends RpcTarget {
	#value = 0;

	increment(amount) {
		this.#value += amount;
		return this.#value;
	}

	get value() {
		return this.#value;
	}
}
