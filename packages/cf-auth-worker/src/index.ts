import {
	DO_CALLBACK_PATH,
	DO_CONNECT_PATH,
	STATE_REGEX,
	WRANGLER_CLIENT_HEADER,
	WRANGLER_CLIENT_HEADER_MAX_LEN,
	WRANGLER_RELAY_SUBPROTOCOL,
} from "./protocol";

export { AuthSession } from "./auth-session";

const CONSENT_GRANTED_URL =
	"https://welcome.developers.workers.dev/wrangler-oauth-consent-granted";
const CONSENT_DENIED_URL =
	"https://welcome.developers.workers.dev/wrangler-oauth-consent-denied";

/**
 * Hardened security headers attached to every browser-facing redirect from
 * `/callback`. Mitigates Referer-leakage of the OAuth `code` (REVIEW-17452
 * #5, #18) and prevents the redirect from being cached by intermediaries.
 *
 * SECURITY: do not add `Access-Control-Allow-Origin` or any other CORS
 * header here. The relay never serves cross-origin XHR / fetch traffic, and
 * a permissive CORS policy would silently undo several of the other
 * defences (REVIEW-17452 #33). `Vary: Origin` is included so any future
 * intermediary cache cannot conflate responses across `Origin` values.
 */
const SECURITY_HEADERS = {
	"Referrer-Policy": "no-referrer",
	"Cache-Control": "no-store, private",
	Pragma: "no-cache",
	"X-Content-Type-Options": "nosniff",
	Vary: "Origin",
};

/** Generic 404. Used for ALL error cases on relay paths so different
 * internal failure modes don't leak via differential status codes
 * (REVIEW-17452 #29). */
function notFound(): Response {
	return new Response(null, { status: 404 });
}

/** Build a redirect response with hardened security headers (#5, #18). */
function secureRedirect(location: string): Response {
	return new Response(null, {
		status: 307,
		headers: { Location: location, ...SECURITY_HEADERS },
	});
}

/**
 * Build a fresh `Headers` for the DO subrequest containing only the
 * minimum needed to perform the WebSocket upgrade (REVIEW-17452 #26). The
 * client's `Cookie`, `Authorization`, `X-*`, etc. are dropped.
 */
function buildSubrequestHeaders(request: Request): Headers {
	const out = new Headers();
	const ALLOWED = [
		"Upgrade",
		"Connection",
		"Sec-WebSocket-Key",
		"Sec-WebSocket-Version",
		"Sec-WebSocket-Protocol",
		"Sec-WebSocket-Extensions",
		WRANGLER_CLIENT_HEADER,
	];
	for (const name of ALLOWED) {
		const value = request.headers.get(name);
		if (value !== null) {
			out.set(name, value);
		}
	}
	return out;
}

/**
 * Parse the `Sec-WebSocket-Protocol` header (a comma-separated list of
 * client-offered subprotocols) and return `true` iff the wrangler-relay
 * subprotocol is among them. Required on every legitimate Wrangler
 * upgrade (REVIEW-17452 #37) — browsers cannot easily forge an arbitrary
 * subprotocol on the `WebSocket` constructor.
 */
function offersWranglerSubprotocol(request: Request): boolean {
	const raw = request.headers.get("Sec-WebSocket-Protocol");
	if (raw === null) {
		return false;
	}
	for (const offered of raw.split(",")) {
		if (offered.trim() === WRANGLER_RELAY_SUBPROTOCOL) {
			return true;
		}
	}
	return false;
}

export default {
	async fetch(
		request: Request,
		_env: Env,
		ctx: ExecutionContext
	): Promise<Response> {
		// Only GET is meaningful on either route. Reject everything else
		// before any further work to defang HTML-form CSRF (REVIEW-17452 #16).
		if (request.method !== "GET") {
			return new Response(null, { status: 405 });
		}

		const url = new URL(request.url);

		// Route: WebSocket upgrade for Wrangler to connect.
		// GET /session/:state with `Upgrade: websocket` AND a `Sec-Wrangler-Client`
		// header that browsers cannot set (REVIEW-17452 #13).
		const sessionMatch = url.pathname.match(/^\/session\/([^/]+)$/);
		if (sessionMatch) {
			const state = decodeURIComponent(sessionMatch[1]);
			if (!STATE_REGEX.test(state)) {
				return notFound();
			}

			// Browsers always send `Origin` on `WebSocket` upgrades; Wrangler's
			// `ws` package does not. Reject any upgrade that carries one.
			if (request.headers.has("Origin")) {
				return notFound();
			}

			// Require the custom Wrangler header. Browsers cannot set custom
			// headers on the WebSocket constructor, so this proves the
			// request did not originate from a malicious page (#13). The
			// value is the per-session `wsToken` (Phase 3) and is bounded to
			// stop a giant header from being persisted into DO storage.
			const wsToken = request.headers.get(WRANGLER_CLIENT_HEADER);
			if (
				wsToken === null ||
				wsToken.length === 0 ||
				wsToken.length > WRANGLER_CLIENT_HEADER_MAX_LEN
			) {
				return notFound();
			}

			// Defence-in-depth against browser-mediated CSWSH (REVIEW-17452
			// #37): require the wrangler-specific subprotocol. A drive-by
			// browser-issued upgrade against this URL would not negotiate
			// this protocol unless the page knows it AND opts in via the
			// `WebSocket` constructor — combined with the `Origin`/`Sec-
			// Wrangler-Client` checks, this closes off browser-side races.
			if (!offersWranglerSubprotocol(request)) {
				return notFound();
			}

			const stub = ctx.exports.AuthSession.getByName(state);
			return stub.fetch(
				new Request(new URL(DO_CONNECT_PATH, url.origin), {
					headers: buildSubrequestHeaders(request),
				})
			);
		}

		// Route: OAuth callback from the browser.
		// GET /callback?code=X&state=Y  or  /callback?error=access_denied&state=Y
		if (url.pathname === "/callback") {
			const state = url.searchParams.get("state");
			if (state === null || !STATE_REGEX.test(state)) {
				// Always redirect to the consent-denied page on bad input —
				// don't expose a 400 oracle that distinguishes "valid state
				// shape but no session" from "malformed state" (#29).
				return secureRedirect(CONSENT_DENIED_URL);
			}

			const stub = ctx.exports.AuthSession.getByName(state);

			// Forward callback data to the DO. We deliberately drop all
			// client headers (no-op subrequest body, no upstream headers
			// needed): the DO consumes only the query params we set below.
			const error = url.searchParams.get("error");
			const code = url.searchParams.get("code");

			const doUrl = new URL(DO_CALLBACK_PATH, url.origin);
			if (error) {
				doUrl.searchParams.set("error", error);
			}
			if (code) {
				doUrl.searchParams.set("code", code);
			}

			const doResp = await stub.fetch(new Request(doUrl));

			// Redirect the browser based on the actual outcome:
			// - DO accepted the code (200 OK and we have a code): granted
			// - Anything else (no WebSocket connected, callback had no code,
			//   already-delivered, or had an error): denied
			const redirectUrl =
				doResp.ok && code && !error ? CONSENT_GRANTED_URL : CONSENT_DENIED_URL;
			return secureRedirect(redirectUrl);
		}

		return notFound();
	},
};
