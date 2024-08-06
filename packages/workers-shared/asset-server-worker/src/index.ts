export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		let { pathname } = url;

		const content = await env.__STATIC_CONTENT.get(pathname);
		return new Response(content);
	},
};
