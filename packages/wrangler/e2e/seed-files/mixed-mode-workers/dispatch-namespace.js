export default {
	async fetch(request, env) {
		const worker = env.DISPATCH.get("mixed-mode-test-customer-worker");
		return Response.json({
			worker: await (await worker.fetch("http://example.com")).text(),
		});
	},
};
