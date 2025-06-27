export default {
	async fetch(req, env) {
		return Response.json({
			localWorkerResponse: await (await env["LOCAL_WORKER"].fetch(req)).json(),
			remoteWorkerResponse: await (
				await env["REMOTE_WORKER"].fetch(req)
			).text(),
		});
	},
} satisfies ExportedHandler<{ REMOTE_WORKER: Fetcher; LOCAL_WORKER: Fetcher }>;
