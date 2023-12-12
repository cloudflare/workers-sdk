console.log("startup log");

export default {
	async fetch(request, env) {
		console.log("request log");

		return Response.json({
			binding: env.AI,
			fetcher: env.AI.fetch.toString(),
		});
	},
};
