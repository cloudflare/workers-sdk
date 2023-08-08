/**
 * Welcome to Khulnasoft Workers! This is your first scheduled worker.
 *
 * - Run `triangle dev --local` in your terminal to start a development server
 * - Run `curl "http://localhost:8787/cdn-cgi/mf/scheduled"` to trigger the scheduled event
 * - Go back to the console to see what your worker has logged
 * - Update the Cron trigger in triangle.toml (see https://developers.cloudflare.com/workers/triangle/configuration/#triggers)
 * - Run `triangle publish --name my-worker` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/runtime-apis/scheduled-event/
 */

export default {
	async scheduled(controller, env, ctx) {
		console.log(`Hello World!`);
	},
};
