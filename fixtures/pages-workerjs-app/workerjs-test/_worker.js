import text from "./other-script";

export default {
	async fetch(request, env) {
		if (request.url.endsWith("/env")) {
			return Response.json(env);
		} else {
			return new Response(text);
		}
	},
};
