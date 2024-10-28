export default {
	async fetch(request, env, ctx) {
		const id = env.OBJECT.newUniqueId();
		const stub = env.OBJECT.get(id);

		const { pathname } = new URL(request.url);
		if (pathname === "/rpc") {
			// stub.prop1.prop2.method('arg1')
			// stub.prop1.method('arg1')
			// stub.prop1 -> .then(...)
			// stub.method('arg1')
			return Response.json(await stub.method());
		}

		if (pathname === "/property") {
			return Response.json(await stub.property);
		}

		return stub.fetch("https://placeholder:9999/", {
			method: "POST",
			cf: { thing: true },
		});
	},
};
