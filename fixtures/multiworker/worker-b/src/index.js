export default {
	async fetch(request, env) {
		return new Response(
			`Worker B + ` + (await (await env.workerD.fetch(request)).text())
		);
	},
};
