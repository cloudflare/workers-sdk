export default {
	async fetch(req, env) {
		return new Response(
			"hello from a & " + (await env.WORKER.fetch(req).then((r) => r.text()))
		);
	},
};
