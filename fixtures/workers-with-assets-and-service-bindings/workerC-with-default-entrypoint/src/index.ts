import { WorkerEntrypoint } from "cloudflare:workers";

export default class extends WorkerEntrypoint {
	/*
	 * HTTP fetch
	 *
	 * Incoming HTTP requests to a Worker are passed to the fetch() handler
	 * as a Request object.
	 *
	 * see https://developers.cloudflare.com/workers/runtime-apis/handlers/fetch/
	 */
	async fetch(request) {
		return new Response("Hello from worker-c fetch()");
	}

	/*
	 * Named method without parameters
	 */
	bee() {
		return "Hello from worker-c bee()";
	}

	/*
	 * Named method with parameters
	 */
	busyBee(bee: string) {
		return `Hello busy ${bee}s from worker-c busyBee(bee)`;
	}

	/*
	 * Cron Triggers
	 *
	 * When a Worker is invoked via a Cron Trigger, the scheduled() handler
	 * handles the invocation.
	 *
	 * see https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/
	 */
	async scheduled() {
		console.log("Hello from worker-c scheduled()");
	}
}
