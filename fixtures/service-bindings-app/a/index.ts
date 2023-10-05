export default <ExportedHandler<{ BEE: Fetcher }>>{
	fetch(req, env) {
		const url = new URL(req.url);
		if (url.pathname === "/constructor") {
			return new Response(env.BEE.constructor.name);
		}
		if (url.pathname === "/private") {
			return new Response(env.BEE.details === undefined);
		}
		return env.BEE.fetch(req);
	},
};
