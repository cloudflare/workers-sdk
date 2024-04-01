console.log("startup log");

export default {
	async fetch(request, env) {
		console.log("request log");

		return Response.json({
			binding: env.AI,
			run: typeof env.AI.run,
			fetch: typeof env.AI.fetch,
		});
	},
};
