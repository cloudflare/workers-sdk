/**
 * These functions are purely for local development, and when running a Pages preview. In production, requests go through the following pipeline:

 * eyeball -> playground-preview-worker -> workers-playground
 * However, locally, and in a Pages preview, requests go through this pipeline:

 * eyeball ->  workers-playground (local or preview) -> playground-preview-worker (staging)
 */
export async function onRequest({ request, env }) {
	const url = new URL(request.url);
	const cookie = await fetch(
		"https://playground-testing.devprod.cloudflare.dev"
	);
	const header = cookie.headers.getSetCookie();
	const asset = await env.ASSETS.fetch(
		new URL(url.pathname.split("/playground")[1], "http://dummy")
	);
	if (url.pathname === "/playground") {
		return new Response(asset.body, {
			headers: {
				"Set-Cookie": header[0].replace(
					"playground-testing.devprod.cloudflare.dev",
					url.host
				),
				...asset.headers,
			},
		});
	} else {
		return asset;
	}
}
