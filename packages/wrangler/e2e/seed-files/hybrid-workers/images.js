export default {
	async fetch(request, env) {
		const image = await fetch(
			// There's nothing special about this image—it's just a random publicly accessible PNG
			"https://cf-assets.www.cloudflare.com/dzlvafdwdttg/73IDGdh9xNkGVXija5vC3b/04cbc66d20d6bade310f270f0f1bd834/Frame_1.png"
		);

		const response = (
			await env.IMAGES.input(image.body)
				// Without Mixed mode, this fails with: Error: IMAGES_INFO_ERROR 9520: ERROR: Unsupported image type
				.output({ format: "image/avif" })
		).response();
		const info = await env.IMAGES.info(response.body);
		return Response.json(info);
	},
};
