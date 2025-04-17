import { sayHello } from "./say-hello.js";

export default {
	/**
	 *
	 * @param {Request} request
	 * @returns
	 */
	async fetch(request) {
		return new Response(sayHello(request.url));
	},
};
