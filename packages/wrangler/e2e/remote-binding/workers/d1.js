export default {
	async fetch(request, env) {
		const result = await env.DB.prepare(
			"SELECT * FROM entries WHERE key = 'test-remote-bindings-key'"
		).all();
		return new Response(result.results[0].value);
	},
};
