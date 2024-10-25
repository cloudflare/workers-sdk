export default {
	async fetch(request, env, ctx) {
		const id = env.OBJECT.newUniqueId();
		const stub = env.OBJECT.get(id);

		const { pathname } = new URL(request.url);
		if (pathname === "/rpc") {
			return Response.json(await stub.method());
		}

		return stub.fetch("https://placeholder:9999/", {
			method: "POST",
			cf: { thing: true },
		});
	},
};
