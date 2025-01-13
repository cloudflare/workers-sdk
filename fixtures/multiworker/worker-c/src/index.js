export default {
	async fetch(request, env) {
		return new Response(
			`Worker C + ` + (await (await env.workerD.fetch(request)).text())
		);
	},
};
