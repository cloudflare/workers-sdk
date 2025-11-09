/**
 * Welcome to Cloudflare Workers! This is your first scheduled worker.
 *
 * - Run `wrangler dev` in your terminal to start a development server
 * - Run `curl "http://localhost:8787/cdn-cgi/handler/scheduled"` to trigger the scheduled event
 * - Go back to the console to see what your worker has logged
 * - Update the Cron trigger in wrangler.toml (see https://developers.cloudflare.com/workers/configuration/cron-triggers/)
 * - Run `wrangler publish --name my-worker` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/runtime-apis/scheduled-event/
 */

export default {
	async scheduled(controller, env, ctx) {
		console.log(`Hello World!`);
	},
};
