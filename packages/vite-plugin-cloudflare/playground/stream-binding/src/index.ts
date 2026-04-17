// Small test video bytes served at /video-asset for the stream upload to fetch
const TEST_VIDEO_BYTES = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);

export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		if (url.pathname === "/video-asset") {
			return new Response(TEST_VIDEO_BYTES, {
				headers: { "Content-Type": "application/octet-stream" },
			});
		}

		if (url.pathname === "/upload") {
			// Upload by URL: the stream binding will fetch /video-asset to get the bytes
			const videoAssetUrl = `${url.origin}/video-asset`;
			const video = await env.STREAM.upload(videoAssetUrl);
			return Response.json({ preview: video.preview, id: video.id });
		}

		return new Response("Stream binding playground");
	},
} satisfies ExportedHandler<Env>;
