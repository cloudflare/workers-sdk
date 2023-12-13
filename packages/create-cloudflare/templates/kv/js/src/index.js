/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export default {
	async fetch(request, env) {
		// Read the value of the 'count' key from KV
		const count = await env.MY_NAMESPACE.get('count');
		// Parse the value into a number and increment it
		const newCount = parseInt(count ?? '0') + 1;
		// Update the 'count' key with the new value
		env.MY_NAMESPACE.put('count', String(newCount));

		return new Response(`This page has been viewed ${newCount} times`);
	},
};
