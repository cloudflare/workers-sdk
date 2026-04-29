export { AuthSession } from "./auth-session";

const CONSENT_GRANTED_URL =
	"https://welcome.developers.workers.dev/wrangler-oauth-consent-granted";
const CONSENT_DENIED_URL =
	"https://welcome.developers.workers.dev/wrangler-oauth-consent-denied";

export default {
	async fetch(
		request: Request,
		_env: Env,
		ctx: ExecutionContext
	): Promise<Response> {
		const url = new URL(request.url);

		// Route: WebSocket upgrade for Wrangler to connect
		// GET /session/:state (with Upgrade: websocket header)
		const sessionMatch = url.pathname.match(/^\/session\/([a-zA-Z0-9._~-]+)$/);
		if (sessionMatch) {
			const state = sessionMatch[1];
			const stub = ctx.exports.AuthSession.getByName(state);

			// Forward to the DO's /connect endpoint
			return stub.fetch(
				new Request(new URL("/connect", url.origin), {
					headers: request.headers,
				})
			);
		}

		// Route: OAuth callback from the browser
		// GET /callback?code=X&state=Y  or  /callback?error=access_denied&state=Y
		if (url.pathname === "/callback") {
			const state = url.searchParams.get("state");
			if (!state) {
				return new Response("Missing state parameter", { status: 400 });
			}

			const stub = ctx.exports.AuthSession.getByName(state);

			// Forward callback data to the DO
			const error = url.searchParams.get("error");
			const code = url.searchParams.get("code");

			const doUrl = new URL("/callback", url.origin);
			if (error) {
				doUrl.searchParams.set("error", error);
			}
			if (code) {
				doUrl.searchParams.set("code", code);
			}

			const doResp = await stub.fetch(new Request(doUrl));

			// Redirect the browser based on the actual outcome:
			// - If the DO accepted the code (200 OK and we have a code): granted
			// - Anything else (no WebSocket connected, callback had no code, or
			//   had an error): denied
			const redirectUrl =
				doResp.ok && code && !error ? CONSENT_GRANTED_URL : CONSENT_DENIED_URL;
			return Response.redirect(redirectUrl, 307);
		}

		return new Response("Not found", { status: 404 });
	},
};
