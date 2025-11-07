export default (<ExportedHandler<Env>>{
	async fetch(request, env, ctx) {
		if (request.method !== "POST") return new Response("Method Not Allowed");
		if (request.body === null) return new Response();

		const socket = env.ECHO_SERVER_HYPERDRIVE.connect();
		await request.body.pipeTo(socket.writable);
		return new Response(socket.readable);
	},
});
