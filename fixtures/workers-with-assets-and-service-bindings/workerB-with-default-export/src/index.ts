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
		return new Response("Hello from worker-b fetch()");
	},

	/*
	 * Named method with strictly one parameter
	 *
	 * Workers in the non-class default export syntax support strictly
	 * one argument. Variable numbers of arguments are supported only
	 * in class-based syntax Workers
	 */
	busyBee(bee: string) {
		return `Hello busy ${bee}s from worker-b busyBee(bee)`;
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
		console.log("Hello from worker-b scheduled()");
	},
};
