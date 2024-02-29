/**
 * These functions are purely for local development, and when running a Pages preview. In production, requests go through the following pipeline:

 * eyeball -> playground-preview-worker -> workers-playground
 * However, locally, and in a Pages preview, requests go through this pipeline:

 * eyeball ->  workers-playground (local or preview) -> playground-preview-worker (staging)
 */
export function onRequest({ request }) {
	const url = new URL(request.url);
	return fetch(
		new URL(
			url.pathname.split("/playground")[1],
			`https://playground-testing.devprod.cloudflare.dev`
		),
		request
	);
}
