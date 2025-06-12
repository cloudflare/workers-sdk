export default {
	async fetch(request, env) {
		const localWorkerText = await (
			await env.LOCAL_WORKER.fetch(request)
		).text();
		const remoteWorkerText = await (
			await env.REMOTE_WORKER.fetch(request)
		).text();
		return new Response(
			`LOCAL<WORKER>: ${localWorkerText}\nREMOTE<WORKER>: ${remoteWorkerText}\n`
		);
	},
};
