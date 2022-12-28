export default <ExportedHandler<{ BEE: Fetcher }>>{
	fetch(req, env) {
		return env.BEE.fetch(req);
	},
};
