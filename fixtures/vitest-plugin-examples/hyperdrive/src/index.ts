export default <ExportedHandler<Env>>{
	async fetch(request, env, ctx) {
		if (request.method !== "POST") return new Response("Method Not Allowed");
		if (request.body === null) return new Response();

		const socket = env.ECHO_SERVER_HYPERDRIVE.connect();
		const writer = socket.writable.getWriter();

		// parse body
		const value = await request.text();
		await writer.write(new TextEncoder().encode(value));
		const result = await socket.readable.getReader().read();

		writer.close();
		return new Response(result.value);
	},
};
