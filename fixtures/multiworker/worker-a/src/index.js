export default {
	async fetch(request, env) {
		const b = await (await env.workerB.fetch(request)).text();
		const c = await (await env.workerC.fetch(request)).text();
		return new Response(`Hello from "${b}" and "${c}"`);
	},
};
