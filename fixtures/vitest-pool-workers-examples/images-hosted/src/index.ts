export default {
	async fetch(request, env, _ctx) {
		const url = new URL(request.url);
		const imageId = url.searchParams.get("id") || "test-image";

		switch (url.pathname) {
			case "/get": {
				const metadata = await env.IMAGES.get(imageId);
				return Response.json({ success: true, metadata });
			}
			case "/getImage": {
				const stream = await env.IMAGES.getImage(imageId);
				if (!stream) {
					return Response.json({ success: false, error: "not found" });
				}
				return new Response(stream, {
					headers: { "content-type": "image/jpeg" },
				});
			}
			case "/upload": {
				const body = await request.arrayBuffer();
				const metadata = await env.IMAGES.upload(body, {
					id: imageId,
					filename: "test.jpg",
				});
				return Response.json({ success: true, metadata });
			}
			case "/update": {
				const metadata = await env.IMAGES.update(imageId, {
					requireSignedURLs: true,
				});
				return Response.json({ success: true, metadata });
			}
			case "/delete": {
				const deleted = await env.IMAGES.delete(imageId);
				return Response.json({ success: true, deleted });
			}
			case "/list": {
				const list = await env.IMAGES.list({ limit: 10 });
				return Response.json({ success: true, list });
			}
			default:
				return Response.json({ error: "unknown path" }, { status: 404 });
		}
	},
} satisfies ExportedHandler<Env>;
