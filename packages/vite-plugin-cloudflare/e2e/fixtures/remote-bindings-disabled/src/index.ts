export default {
	async fetch(_req, env) {
		const content = await env.AI.run("@cf/google/gemma-4-26b-a4b-it", {
			messages: [],
		});

		return Response.json({
			response: content.response,
		});
	},
} satisfies ExportedHandler<{ AI: Ai }>;
