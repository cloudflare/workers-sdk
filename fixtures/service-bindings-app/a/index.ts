export default <ExportedHandler<{ BEE: Fetcher }>>{
	fetch(req, env) {
		const url = new URL(req.url);
		if (url.pathname === "/constructor") {
			return new Response(env.BEE.constructor.name);
		}
		return env.BEE.fetch(req);
	},
};
