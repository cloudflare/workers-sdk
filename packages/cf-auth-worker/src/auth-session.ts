import { DurableObject } from "cloudflare:workers";

const SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * AuthSession Durable Object — acts as a WebSocket relay between Wrangler
 * (connected via WebSocket) and the OAuth callback (forwarded by the Worker).
 *
 * Uses the Hibernation API for efficient WebSocket handling.
 *
 * Lifecycle:
 *   1. Wrangler opens a WebSocket to /session/:state (routed here via getByName(state))
 *   2. The DO accepts one WebSocket and sets a 5-minute cleanup alarm
 *   3. The OAuth callback hits /callback?code=X&state=Y, which the Worker
 *      forwards to /callback on this DO
 *   4. The DO sends { code } or { error } down the WebSocket and closes it
 */
export class AuthSession extends DurableObject<Env> {
	/**
	 * Handles both WebSocket upgrades (/connect) and callback forwarding (/callback).
	 */
	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		switch (url.pathname) {
			case "/connect":
				return this.handleWebSocketUpgrade(request);
			case "/callback":
				return this.handleCallback(url);
			default:
				return new Response("Not found", { status: 404 });
		}
	}

	/**
	 * Accepts a WebSocket upgrade from Wrangler.
	 * Only one WebSocket is allowed per session — extras are rejected with 409.
	 */
	private async handleWebSocketUpgrade(request: Request): Promise<Response> {
		if (request.headers.get("Upgrade") !== "websocket") {
			return new Response("Expected WebSocket upgrade", { status: 426 });
		}

		// Only one WebSocket connection per session
		if (this.ctx.getWebSockets().length > 0) {
			return new Response("Session already has a WebSocket connection", {
				status: 409,
			});
		}

		const pair = new WebSocketPair();
		this.ctx.acceptWebSocket(pair[1]);

		// Set a 5-minute alarm for cleanup. Awaited (matching `deleteAlarm` in
		// `handleCallback`) so the alarm is durably written before we return.
		await this.ctx.storage.setAlarm(Date.now() + SESSION_TTL_MS);

		return new Response(null, { status: 101, webSocket: pair[0] });
	}

	/**
	 * Handles the OAuth callback forwarded from the Worker fetch handler.
	 * Sends the auth code or error down the WebSocket to Wrangler.
	 */
	private async handleCallback(url: URL): Promise<Response> {
		const sockets = this.ctx.getWebSockets();
		if (sockets.length === 0) {
			// No active session for this state — Wrangler never connected, or
			// the session has already been completed/expired.
			return new Response("No WebSocket connected", { status: 404 });
		}

		const ws = sockets[0];
		const error = url.searchParams.get("error");
		const code = url.searchParams.get("code");

		if (error) {
			ws.send(JSON.stringify({ error }));
		} else if (code) {
			ws.send(JSON.stringify({ code }));
		} else {
			ws.send(JSON.stringify({ error: "missing_code" }));
		}

		ws.close(1000, "Auth complete");

		// Clear the cleanup alarm — the session is finished.
		await this.ctx.storage.deleteAlarm();

		return new Response("OK");
	}

	/**
	 * Hibernation API: called when the WebSocket is closed by the client.
	 */
	webSocketClose(
		_ws: WebSocket,
		_code: number,
		_reason: string,
		_wasClean: boolean
	): void {
		// Nothing to clean up — the DO will be garbage collected
	}

	/**
	 * Alarm handler: clean up stale sessions that were never completed.
	 */
	async alarm(): Promise<void> {
		const sockets = this.ctx.getWebSockets();
		for (const ws of sockets) {
			ws.close(1000, "Session expired");
		}
	}
}
