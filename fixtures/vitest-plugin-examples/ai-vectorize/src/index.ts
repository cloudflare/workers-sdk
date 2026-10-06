export default {
	async fetch(request, env, ctx): Promise<Response> {
		const path = new URL(request.url).pathname;

		if (path === "/ai") {
			const stories = [
				"This is a story about an orange cloud",
				"This is a story about a llama",
			];
			const modelResp: Ai_Cf_Baai_Bge_Base_En_V1_5_Output = await env.AI.run(
				"@cf/baai/bge-base-en-v1.5",
				{
					text: stories,
				}
			);
			return Response.json(modelResp);
		}

		if (path === "/vectorize") {
			const vectors: VectorizeVector[] = [
				{ id: "123", values: [...Array(768).keys()] },
				{ id: "456", values: [...Array(768).keys()] },
			];

			let inserted = await env.VECTORIZE.upsert(vectors);
			return Response.json(inserted);
		}

		return new Response("Hello World!");
	},
} satisfies ExportedHandler<Env>;
