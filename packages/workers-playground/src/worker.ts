/**
 * This Worker entry point is only used in the dev environment (--env=dev).
 * In production, workers-playground is deployed as an assets-only Worker,
 * and the playground-preview-worker handles all routing and proxying.
 *
 * Locally, this Worker replicates the proxying behavior so that the
 * playground can communicate with the testing playground-preview-worker:
 *
 *   eyeball -> workers-playground (local, --env=dev) -> playground-preview-worker (testing)
 */

interface Env {
	ASSETS: { fetch(input: RequestInfo, init?: RequestInit): Promise<Response> };
}

const TESTING_ORIGIN = "https://playground-testing.devprod.cloudflare.dev";

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		// Proxy API requests to the testing playground-preview-worker
		if (url.pathname.startsWith("/playground/api")) {
			const apiPath = url.pathname.replace(/^\/playground/, "");
			return fetch(new URL(apiPath, TESTING_ORIGIN), request as RequestInit);
		}

		// For the root /playground path, fetch a cookie from the testing
		// endpoint and inject it into the response so that the preview
		// iframe can authenticate with the testing preview worker.
		if (url.pathname === "/playground") {
			const cookie = await fetch(TESTING_ORIGIN);
			const header = cookie.headers.getSetCookie();
			const assetUrl = new URL(
				url.pathname.split("/playground")[1] || "/",
				"http://dummy"
			);
			const asset = await env.ASSETS.fetch(assetUrl.href);
			return new Response(asset.body, {
				headers: {
					...Object.fromEntries(asset.headers.entries()),
					"Set-Cookie": header[0].replace(
						"playground-testing.devprod.cloudflare.dev",
						url.host
					),
				},
			});
		}

		// All other requests fall through to static assets
		return env.ASSETS.fetch(request);
	},
};
