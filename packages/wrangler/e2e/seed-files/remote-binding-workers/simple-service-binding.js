export default {
	async fetch(request, env) {
		const remoteWorkerText = await (
			await env.REMOTE_WORKER.fetch(request)
		).text();
		return new Response(`REMOTE<WORKER>: ${remoteWorkerText}`);
	},
};
