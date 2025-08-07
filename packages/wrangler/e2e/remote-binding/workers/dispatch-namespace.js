export default {
	async fetch(request, env) {
		const worker = env.DISPATCH.get("remote-bindings-test-customer-worker");
		return Response.json({
			worker: await (await worker.fetch("http://example.com")).text(),
			rpc: await worker.add(1, 2),
		});
	},
};
