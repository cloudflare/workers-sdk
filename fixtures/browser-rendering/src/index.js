
export default {
	async fetch(request, env) {
		console.log(env.BROWSER)
		return Response.json({
			binding: env.BROWSER,
			fetch: typeof env.BROWSER,
		});
	},
};
