export interface Env {
	AI: Ai;
	VECTORIZE: Vectorize;
	IMAGES: ImagesBinding;
}

async function waitForMutation(env: Env, mutationId: string) {
	while (
		(await env.VECTORIZE.describe()).processedUpToMutation.toString() !=
		mutationId
	) {
		await new Promise((resolve) => setTimeout(resolve, 2000));
	}
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const response = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
			prompt: "When I say PING, you say PONG. PING",
		});

		if (url.pathname === "/vectorize") {
			await env.VECTORIZE.insert([
				{
					id: "a44706aa-a366-48bc-8cc1-3feffd87d548",
					values: [
						0.2321, 0.8121, 0.6315, 0.6151, 0.4121, 0.1512, 0, 0, 0, 0, 0, 0, 0,
						0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
					],
					metadata: { text: "Peter Piper picked a peck of pickled peppers" },
				},
			]);
			await env.VECTORIZE.insert([
				{
					id: "b0daca4a-ffd8-4865-926b-e24800af2a2d",
					values: [
						0.2331, 1.0125, 0.6131, 0.9421, 0.9661, 0.8121, 0, 0, 0, 0, 0, 0, 0,
						0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
					],
					metadata: { text: "She sells seashells by the sea" },
				},
			]);
			await waitForMutation(
				env,
				(
					await env.VECTORIZE.upsert([
						{
							id: "b0daca4a-ffd8-4865-926b-e24800af2a2d",
							values: [
								0.2331, 1.0125, 0.6131, 0.9421, 0.9661, 0.8121, 0, 0, 0, 0, 0,
								0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
							],
							metadata: { text: "She sells seashells by the seashore" },
						},
					])
				).mutationId
			);

			let response = "";
			response += JSON.stringify(
				await env.VECTORIZE.getByIds(["a44706aa-a366-48bc-8cc1-3feffd87d548"])
			);

			const queryVector: Array<number> = [
				0.13, 0.25, 0.44, 0.53, 0.62, 0.41, 0.59, 0.68, 0.29, 0.82, 0.37, 0.5,
				0.74, 0.46, 0.57, 0.64, 0.28, 0.61, 0.73, 0.35, 0.78, 0.58, 0.42, 0.32,
				0.77, 0.65, 0.49, 0.54, 0.31, 0.29, 0.71, 0.57,
			]; // vector of dimension 32
			const matches = await env.VECTORIZE.query(queryVector, {
				topK: 3,
				returnValues: true,
				returnMetadata: "all",
			});
			response += " " + matches.count;

			return new Response(response);
		}

		if (url.pathname === "/images") {
			const stream = await (
				await fetch("https://thispersondoesnotexist.com/")
			).body;
			const transform = await env.IMAGES.input(stream!)
				.transform({ blur: 250 })
				.output({ format: "image/avif" });

			return transform.response();
		}

		return new Response(
			JSON.stringify((response as { response: string }).response.toUpperCase())
		);
	},
} satisfies ExportedHandler<Env>;
