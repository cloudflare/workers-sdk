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
		return new Response("Hello from worker-🐝 fetch()");
	}

	/*
	 * Named method without parameters
	 */
	bee() {
		return "Hello from worker-🐝 bee()";
	}

	/*
	 * Named method without parameters
	 */
	busyBee(bee: string) {
		return `Hello busy ${bee}s from worker-🐝 busyBee(bee)`;
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
		console.log("Hello from worker-🐝 scheduled()");
	}

	/*
	 * Queues
	 *
	 * Allows a consumer Worker to consume messages from a Queue. To define
	 * a consumer Worker, add a queue() function to the default export of the
	 * Worker.
	 *
	 * see https://developers.cloudflare.com/queues/configuration/javascript-apis/#consumer
	 */

	/*
	 * Email
	 *
	 * An `EmailEvent` is the event type to programmatically process your
	 * emails with a Worker.
	 *
	 * see https://developers.cloudflare.com/email-routing/email-workers/runtime-api/#syntax-es-modules
	 */
	async email(message, env, ctx) {
		message.reply("Hello from worker-🐝 email()");
	}
}
