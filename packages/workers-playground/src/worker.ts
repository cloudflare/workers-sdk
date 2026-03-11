interface Env {
	ASSETS: { fetch(input: RequestInfo, init?: RequestInit): Promise<Response> };
}

const TESTING_ORIGIN = "playground-testing.devprod.cloudflare.dev";

export default {
	/**
	 * This Worker entry point is only used in the dev environment (wrangler.dev.jsonc).
	 *
	 * In production, workers-playground is deployed as an assets-only Worker,
	 * and the playground-preview-worker handles all routing and proxying.
	 *
	 *   eyeball -> playground-preview-worker (production) -> workers-playground (production, wrangler.jsonc)
	 *
	 * Locally, this Worker replicates the proxying behavior so that the
	 * playground can communicate with the testing playground-preview-worker:
	 *
	 *   eyeball -> workers-playground (local, wrangler.dev.jsonc) -> playground-preview-worker (testing)
	 */
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		// For the root `/playground` path, fetch a cookie from the testing endpoint and inject it into
		// the response so that the preview iframe can authenticate with the testing preview worker.
		if (url.pathname === "/playground") {
			const tokenCookie = transformTokenCookie(
				await fetchTokenCookieFromTestingEndpoint()
			);
			url.pathname = "/"; // Rewrite to fetch the index.html asset
			const asset = await env.ASSETS.fetch(url.href);
			const response = new Response(asset.body, asset);
			if (tokenCookie) {
				response.headers.set("Set-Cookie", tokenCookie);
			}
			return response;
		}

		// Proxy API requests to the testing playground-preview-worker
		if (url.pathname.startsWith("/playground/api")) {
			const apiPath = url.pathname.replace(/^\/playground/, "");
			const targetUrl = new URL(apiPath, `https://${TESTING_ORIGIN}`);
			targetUrl.search = url.search;
			return fetch(targetUrl, request as RequestInit);
		}

		// All other requests fall through to static assets
		return env.ASSETS.fetch(request);
	},
};

/**
 * Transforms the cookie fetched from the testing endpoint
 *
 * - Replaces the testing origin with localhost so that the cookie is sent in subsequent requests from the playground to the local workers-playground.
 * - Strips out cookie directives that can cause issues in the local dev environment
 */
function transformTokenCookie(cookie: string | undefined): string | undefined {
	return (
		cookie
			?.split(";")
			// Strip out SameSite and Secure directives, which can cause issues in the local dev environment without HTTPS
			?.filter((part) => !part.trim().match(/^SameSite=|^Secure$/))
			// Replace the testing origin with localhost so that the cookie is sent in subsequent requests from the playground to the local workers-playground
			?.map((part) => part.replace(TESTING_ORIGIN, "localhost"))
			?.join("; ")
	);
}

/**
 * Fetches the token cookie from the testing endpoint.
 */
async function fetchTokenCookieFromTestingEndpoint(): Promise<
	string | undefined
> {
	const cookieRequest = await fetch(`https://${TESTING_ORIGIN}`);
	const cookies = cookieRequest.headers.getSetCookie();
	return cookies.find((cookie) => cookie.includes("user="));
}
