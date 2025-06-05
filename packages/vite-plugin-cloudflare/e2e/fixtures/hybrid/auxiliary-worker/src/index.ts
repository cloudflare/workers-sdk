export default {
	async fetch(req, env) {
		return Response.json({
			remoteWorkerResponse: await (
				await env["REMOTE_WORKER"].fetch(req)
			).text(),
		});
	},
} satisfies ExportedHandler<{ REMOTE_WORKER: Fetcher }>;
