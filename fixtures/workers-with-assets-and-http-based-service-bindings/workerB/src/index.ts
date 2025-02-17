/*
 * default entrypoint
 */
export default {
	/*
	 * HTTP fetch
	 *
	 * Incoming HTTP requests to a Worker are passed to the fetch() handler
	 * as a Request object.
	 *
	 * see https://developers.cloudflare.com/workers/runtime-apis/handlers/fetch/
	 */
	async fetch(request, env, ctx) {
		return new Response("Hello from worker-🐝 fetch()");
	},

	/*
	 * Named functions ??
	 */
	foo(request) {
		return new Response("Hello from worker-🐝 foo()");
	},

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
		return new Response("worker-🐝 cron processed");
	},

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
	},
};
