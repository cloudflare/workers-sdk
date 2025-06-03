export default {
	async fetch(request, env) {
		const remoteWorkerResp = await env.MY_WORKER.fetch(request);
		const remoteWorkerRespText = await remoteWorkerResp.text();
		return new Response(`Response from remote worker: ${remoteWorkerRespText}`);
	},
};
