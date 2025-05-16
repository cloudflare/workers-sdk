export default {
	async fetch(request, env) {
		try {
			const worker = env.DISPATCH.get("mixed-mode-test-customer-worker");
			return Response.json({
				worker: await (await worker.fetch("http://example.com")).text(),
			});
		} catch (e) {
			console.log(e);
			return new Response(e);
		}
	},
};
