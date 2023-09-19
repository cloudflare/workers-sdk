import welcome from "welcome.html";

/**
 * @typedef {Object} Env
 */

export default {
	/**
	 * @param {Request} request
	 * @param {Env} env
	 * @param {ExecutionContext} ctx
	 * @returns {Promise<Response>}
	 */
	async fetch(request, env, ctx) {
		console.log("Hello Cloudflare Workers!");

		return new Response(welcome, {
			headers: {
				"content-type": "text/html",
			},
		});
	},
};
