export default {
	async fetch(req, env) {
		const url = new URL(req.url);
		if (url.pathname.startsWith("/ai/")) {
			const messages = [
				{
					role: "user",
					// This prompt generates the same output relatively reliably
					content:
						"Respond with the exact text 'This is a response from Workers AI.'. Do not include any other text",
				},
			];

			const content = await env.AI.run("@hf/thebloke/zephyr-7b-beta-awq", {
				messages,
			});
			if ("response" in content) {
				return Response.json({
					response: content.response,
				});
			} else {
				return new Response("", { status: 500 });
			}
		}

		return Response.json({
			localWorkerResponse: await (await env["LOCAL_WORKER"].fetch(req)).json(),
			remoteWorkerResponse: await (
				await env["REMOTE_WORKER"].fetch(req)
			).text(),
		});
	},
} satisfies ExportedHandler<{ REMOTE_WORKER: Fetcher; LOCAL_WORKER: Fetcher }>;
