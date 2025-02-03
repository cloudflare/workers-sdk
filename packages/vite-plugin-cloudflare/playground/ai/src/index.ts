export interface Env {
	AI: Ai;
}

export default {
	async fetch(_request: Request, env: Env): Promise<Response> {
		const response = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
			prompt: "When I say PING, you say PONG. PING",
		});

		return new Response(
			JSON.stringify((response as { response: string }).response.toUpperCase())
		);
	},
} satisfies ExportedHandler<Env>;
