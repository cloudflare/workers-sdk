export default {
	async fetch(_req, env) {
		const content = await env.AI.run("@cf/meta/llama-2-7b-chat-fp16", {
			messages: [],
		});

		return Response.json({
			response: content.response,
		});
	},
} satisfies ExportedHandler<{ AI: Ai }>;
