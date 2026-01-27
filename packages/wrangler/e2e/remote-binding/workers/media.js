export default {
	async fetch(request, env) {
		const image = await fetch(
			// There's nothing special about this video—it's just a random publicly accessible mp4
			// from the media transformations blog post
			"https://pub-d9fcbc1abcd244c1821f38b99017347f.r2.dev/aus-mobile.mp4 "
		);

		const contentType = await env.MEDIA.input(image.body)
			.transform({ width: 10 })
			.output({ mode: "frame", format: "jpg" })
			.contentType();

		return new Response(contentType);
	},
};
