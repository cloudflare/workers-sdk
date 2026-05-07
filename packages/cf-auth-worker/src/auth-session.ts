import { DurableObject } from "cloudflare:workers";
import { WRANGLER_CLIENT_HEADER } from "./protocol";

/**
 * Hard upper bound on how long a session may stay open. Reduced from the
 * previous 5 minutes per REVIEW-17452 #7 to limit slot-reservation attacks
 * (Slowloris-class WebSocket holds). 90s is enough for a typical OAuth
 * round-trip including MFA but tight enough to bound the attack window.
 */
const SESSION_TTL_MS = 90 * 1000;

/**
 * Storage keys persisted on each `AuthSession` DO. Names are kept short
 * because every key counts against DO storage costs.
 */
const STORAGE_KEYS = {
	/** SHA-256 (hex) of the wsToken committed at WebSocket upgrade time. */
	wsTokenHash: "h",
	/** When the session began, used for analytics on alarm (#31). */
	connectedAt: "c",
	/** Latch flag — set after a successful `{code,state}` dispatch so a
	 * second `/callback` for the same `state` can be rejected (#1). */
	delivered: "d",
} as const;

async function sha256Hex(input: string): Promise<string> {
	const buf = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(input)
	);
	const bytes = new Uint8Array(buf);
	let out = "";
	for (let i = 0; i < bytes.length; i++) {
		out += bytes[i].toString(16).padStart(2, "0");
	}
	return out;
}

/**
 * AuthSession Durable Object — acts as a WebSocket relay between Wrangler
 * (connected via WebSocket) and the OAuth callback (forwarded by the
 * Worker).
 *
 * Uses the Hibernation API for efficient WebSocket handling.
 *
 * Lifecycle:
 *   1. Wrangler opens a WebSocket to /session/:state (routed here via
 *      `getByName(state)`). Upgrade carries `Sec-Wrangler-Client: <wsToken>`.
 *   2. The DO accepts one WebSocket, stores `sha256(wsToken)`, and arms a
 *      90-second cleanup alarm.
 *   3. The OAuth callback hits the Worker's `/callback?code=X&state=Y`,
 *      which forwards `?code=X` (or `?error=...`) here.
 *   4. The DO sends `{ code, state }` (or `{ error, state }`) down the
 *      WebSocket, latches `delivered`, and closes it.
 *   5. Any subsequent `/callback` for the same state returns 404 — the
 *      `delivered` latch ensures a single OAuth code can't be dispatched
 *      twice (REVIEW-17452 #1).
 */
export class AuthSession extends DurableObject<Env> {
	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		switch (url.pathname) {
			case "/connect":
				return this.handleWebSocketUpgrade(request);
			case "/callback":
				return this.handleCallback(url);
			default:
				return new Response(null, { status: 404 });
		}
	}

	/**
	 * Accepts a WebSocket upgrade from Wrangler. The request is already
	 * pre-validated by the Worker fetch handler (state shape, GET-only,
	 * no `Origin`, `Sec-Wrangler-Client` present and bounded). We re-read
	 * the wsToken here because the DO is the security boundary that
	 * persists state.
	 */
	private async handleWebSocketUpgrade(request: Request): Promise<Response> {
		if (request.headers.get("Upgrade") !== "websocket") {
			return new Response(null, { status: 404 });
		}

		// Reject if this session already has a committed wsTokenHash (i.e.
		// a WebSocket was previously attached, even if it's since closed)
		// or if there's a live WebSocket. Both produce a generic 404 so an
		// attacker can't distinguish "session exists, race lost" from
		// "no session" via status codes (REVIEW-17452 #29).
		const existingHash = await this.ctx.storage.get<string>(
			STORAGE_KEYS.wsTokenHash
		);
		if (existingHash !== undefined || this.ctx.getWebSockets().length > 0) {
			return new Response(null, { status: 404 });
		}

		const wsToken = request.headers.get(WRANGLER_CLIENT_HEADER);
		if (wsToken === null || wsToken.length === 0) {
			return new Response(null, { status: 404 });
		}

		const wsTokenHash = await sha256Hex(wsToken);

		const pair = new WebSocketPair();
		this.ctx.acceptWebSocket(pair[1]);

		// Persist the metadata atomically with the alarm — the alarm is the
		// safety net if Wrangler never receives a callback. Awaited so the
		// state is durably written before we return the upgrade response.
		await this.ctx.storage.put({
			[STORAGE_KEYS.wsTokenHash]: wsTokenHash,
			[STORAGE_KEYS.connectedAt]: Date.now(),
		});
		await this.ctx.storage.setAlarm(Date.now() + SESSION_TTL_MS);

		return new Response(null, { status: 101, webSocket: pair[0] });
	}

	/**
	 * Handles the OAuth callback forwarded from the Worker fetch handler.
	 * Sends the auth code or error down the WebSocket to Wrangler, then
	 * latches `delivered` so a replayed `/callback` for the same state
	 * cannot dispatch a second code (REVIEW-17452 #1).
	 */
	private async handleCallback(url: URL): Promise<Response> {
		// Already-delivered: refuse a second dispatch. This is the latch
		// that prevents an attacker who knows `state` from injecting a
		// code AFTER a legit one has been delivered.
		const delivered = await this.ctx.storage.get<true>(STORAGE_KEYS.delivered);
		if (delivered === true) {
			return new Response(null, { status: 404 });
		}

		const sockets = this.ctx.getWebSockets();
		if (sockets.length === 0) {
			// No active session for this state — Wrangler never connected, or
			// the session has already been completed/expired.
			return new Response(null, { status: 404 });
		}

		const ws = sockets[0];
		const error = url.searchParams.get("error");
		const code = url.searchParams.get("code");
		// `state` is read from the DO's name via the URL param the Worker
		// re-parses. We re-derive it here from the shared storage so the
		// DO doesn't trust the Worker to round-trip it correctly.
		// Equivalently we could use `this.ctx.id.name`, but `id.name` is
		// only set when the DO is addressed by `getByName`, which is the
		// case here.
		const state = this.ctx.id.name;
		if (state === undefined) {
			// Defensive: this DO is always addressed by name. If we got
			// here without one, something is very wrong; close out.
			return new Response(null, { status: 404 });
		}

		// Send `{code, state}` (or `{error, state}`) so Wrangler can
		// constant-time compare `state` against the value it generated
		// locally before exchanging the code (REVIEW-17452 #14).
		if (error) {
			ws.send(JSON.stringify({ error, state }));
		} else if (code) {
			ws.send(JSON.stringify({ code, state }));
		} else {
			ws.send(JSON.stringify({ error: "missing_code", state }));
		}

		ws.close(1000, "Auth complete");

		// Latch and clear the cleanup alarm — the session is finished.
		await this.ctx.storage.put({ [STORAGE_KEYS.delivered]: true });
		await this.ctx.storage.deleteAlarm();

		// Tell the Worker whether this was a successful code dispatch so
		// it can choose the right browser redirect. `error` or no `code`
		// must surface as a non-OK so the Worker sends consent-denied.
		if (error || !code) {
			return new Response(null, { status: 404 });
		}
		return new Response("OK");
	}

	/**
	 * Hibernation API: called when the WebSocket is closed by the client
	 * (Wrangler `^C`'d, lost network, etc.). Nothing to clean up — the DO
	 * will be garbage-collected once the alarm clears.
	 */
	webSocketClose(
		_ws: WebSocket,
		_code: number,
		_reason: string,
		_wasClean: boolean
	): void {
		// no-op
	}

	/**
	 * Discard any messages Wrangler sends post-open. The current protocol
	 * is server-driven (DO sends `{code, state}` once); accepting client
	 * messages would expand the parser surface for no functional gain.
	 * Tracked as future work in REVIEW-17452 #7 (hello-frame requirement).
	 */
	webSocketMessage(_ws: WebSocket, _message: ArrayBuffer | string): void {
		// no-op
	}

	/**
	 * Alarm handler: clean up stale sessions that were never completed,
	 * and emit an analytics event so we can monitor relay health and
	 * abandonment rates (REVIEW-17452 #31).
	 */
	async alarm(): Promise<void> {
		const sockets = this.ctx.getWebSockets();
		const hadCallback =
			(await this.ctx.storage.get<true>(STORAGE_KEYS.delivered)) === true;
		const connectedAt = await this.ctx.storage.get<number>(
			STORAGE_KEYS.connectedAt
		);
		const ageMs = connectedAt ? Date.now() - connectedAt : 0;

		for (const ws of sockets) {
			ws.close(1000, "Session expired");
		}

		// Emit a single Analytics Engine event so we can distinguish
		// legitimate slow logins from abandonment / hijack-attempt timeouts.
		// `state_hash` is included as a blob so we can dedupe replays
		// without storing the raw state.
		if (this.env.AUTH_SESSIONS_AE !== undefined) {
			const stateName = this.ctx.id.name;
			const stateHash = stateName ? await sha256Hex(stateName) : "";
			this.env.AUTH_SESSIONS_AE.writeDataPoint({
				blobs: ["session_expired", stateHash],
				doubles: [ageMs, hadCallback ? 1 : 0],
				indexes: [stateHash.slice(0, 32)],
			});
		}

		// Drop persistent state — the session is dead. The DO record itself
		// will be garbage-collected by the runtime.
		await this.ctx.storage.deleteAll();
	}
}
