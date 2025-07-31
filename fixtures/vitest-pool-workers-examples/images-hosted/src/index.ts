export default {
	async fetch(request, env, _ctx) {
		const imageId = await request.text();
		const transformer = await env.IMAGES.hosted(imageId);
		const result = await transformer.output({ format: "image/webp" });
		return Response.json({ success: !!result });
	},
} satisfies ExportedHandler<Env>;
