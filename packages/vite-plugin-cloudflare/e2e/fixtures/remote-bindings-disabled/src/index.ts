export default {
	async fetch(_req, env) {
		const content = (await env.AI.run("@cf/google/gemma-4-26b-a4b-it", {
			messages: [{ role: "user", content: "Hello" }],
		})) as { choices: { message: { content: string } }[] };

		return Response.json({
			response: content.choices[0].message.content,
		});
	},
} satisfies ExportedHandler<{ AI: Ai }>;
