import { SELF } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { describe, it } from "vitest";
import { WRANGLER_CLIENT_HEADER } from "../src/protocol";

/**
 * 32-char state matching `STATE_REGEX`. Tests append a per-test suffix to
 * keep DO names unique without exceeding the 128-char upper bound.
 */
const STATE_PREFIX = "abcdefghijklmnopqrstuvwxyz012345"; // 32 chars
function makeState(suffix: string): string {
	const padded = `${STATE_PREFIX}-${suffix}`;
	return padded.slice(0, 128);
}

/** Default headers for a Wrangler-style WebSocket upgrade. */
function wranglerWsHeaders(wsToken = "token-".padEnd(43, "x")): HeadersInit {
	return {
		Upgrade: "websocket",
		[WRANGLER_CLIENT_HEADER]: wsToken,
	};
}

/**
 * Returns a promise that resolves with the next message received on the WebSocket.
 * Replaces ad-hoc `setTimeout` waits with a deterministic signal.
 */
function nextMessage(ws: WebSocket): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		const onMessage = (event: MessageEvent) => {
			cleanup();
			resolve(typeof event.data === "string" ? event.data : String(event.data));
		};
		const onClose = () => {
			cleanup();
			reject(new Error("WebSocket closed before a message was received"));
		};
		const cleanup = () => {
			ws.removeEventListener("message", onMessage);
			ws.removeEventListener("close", onClose);
		};
		ws.addEventListener("message", onMessage);
		ws.addEventListener("close", onClose);
	});
}

describe("cf-auth-worker", () => {
	describe("Method enforcement (REVIEW-17452 #16)", () => {
		for (const method of ["POST", "PUT", "DELETE", "PATCH", "OPTIONS"]) {
			it(`should return 405 for ${method} on /callback`, async ({ expect }) => {
				const resp = await SELF.fetch(
					`https://auth.devprod.cloudflare.dev/callback?state=${makeState("m1")}`,
					{ method }
				);
				expect(resp.status).toBe(405);
			});
		}

		it("should return 405 for POST on /session/:state", async ({ expect }) => {
			const resp = await SELF.fetch(
				`https://auth.devprod.cloudflare.dev/session/${makeState("m2")}`,
				{ method: "POST" }
			);
			expect(resp.status).toBe(405);
		});
	});

	describe("State validation (REVIEW-17452 #17)", () => {
		it("should reject /session/:state with too-short state", async ({
			expect,
		}) => {
			const resp = await SELF.fetch(
				"https://auth.devprod.cloudflare.dev/session/short",
				{ headers: wranglerWsHeaders() }
			);
			expect(resp.status).toBe(404);
		});

		it("should reject /session/:state with characters outside the unreserved set", async ({
			expect,
		}) => {
			const resp = await SELF.fetch(
				`https://auth.devprod.cloudflare.dev/session/${makeState("v1")}*`,
				{ headers: wranglerWsHeaders() }
			);
			expect(resp.status).toBe(404);
		});

		it("should redirect /callback with bad state to consent-denied", async ({
			expect,
		}) => {
			const resp = await SELF.fetch(
				"https://auth.devprod.cloudflare.dev/callback?code=x&state=tooshort",
				{ redirect: "manual" }
			);
			expect(resp.status).toBe(307);
			expect(resp.headers.get("Location")).toBe(
				"https://welcome.developers.workers.dev/wrangler-oauth-consent-denied"
			);
		});
	});

	describe("WebSocket upgrade hardening (REVIEW-17452 #13)", () => {
		it("should reject upgrades carrying an Origin header (CSWSH defence)", async ({
			expect,
		}) => {
			const resp = await SELF.fetch(
				`https://auth.devprod.cloudflare.dev/session/${makeState("o1")}`,
				{
					headers: {
						...wranglerWsHeaders(),
						Origin: "https://attacker.example",
					},
				}
			);
			expect(resp.status).toBe(404);
		});

		it("should reject upgrades missing Sec-Wrangler-Client", async ({
			expect,
		}) => {
			const resp = await SELF.fetch(
				`https://auth.devprod.cloudflare.dev/session/${makeState("h1")}`,
				{ headers: { Upgrade: "websocket" } }
			);
			expect(resp.status).toBe(404);
		});

		it("should reject upgrades with an empty Sec-Wrangler-Client", async ({
			expect,
		}) => {
			const resp = await SELF.fetch(
				`https://auth.devprod.cloudflare.dev/session/${makeState("h2")}`,
				{ headers: wranglerWsHeaders("") }
			);
			expect(resp.status).toBe(404);
		});

		it("should reject upgrades with an oversized Sec-Wrangler-Client", async ({
			expect,
		}) => {
			const resp = await SELF.fetch(
				`https://auth.devprod.cloudflare.dev/session/${makeState("h3")}`,
				{ headers: wranglerWsHeaders("a".repeat(257)) }
			);
			expect(resp.status).toBe(404);
		});
	});

	describe("GET /session/:state (WebSocket upgrade)", () => {
		it("should accept a WebSocket connection with a valid wsToken", async ({
			expect,
		}) => {
			const resp = await SELF.fetch(
				`https://auth.devprod.cloudflare.dev/session/${makeState("acc")}`,
				{ headers: wranglerWsHeaders() }
			);
			expect(resp.status).toBe(101);
			const ws = resp.webSocket;
			expect(ws).toBeDefined();
			ws?.accept();
			ws?.close();
		});

		it("should reject a second WebSocket connection to the same session", async ({
			expect,
		}) => {
			const state = makeState("dup-" + Date.now());

			const resp1 = await SELF.fetch(
				`https://auth.devprod.cloudflare.dev/session/${state}`,
				{ headers: wranglerWsHeaders("first-token") }
			);
			expect(resp1.status).toBe(101);
			resp1.webSocket?.accept();

			// Race-attempt with a different wsToken — also rejected.
			const resp2 = await SELF.fetch(
				`https://auth.devprod.cloudflare.dev/session/${state}`,
				{ headers: wranglerWsHeaders("second-token") }
			);
			expect(resp2.status).toBe(404);

			resp1.webSocket?.close();
		});

		it("should reject /session/:state requests without an Upgrade header", async ({
			expect,
		}) => {
			const resp = await SELF.fetch(
				`https://auth.devprod.cloudflare.dev/session/${makeState("no-up")}`
			);
			expect(resp.status).toBe(404);
		});

		it("should reject /session/:state requests with a non-websocket Upgrade header", async ({
			expect,
		}) => {
			const resp = await SELF.fetch(
				`https://auth.devprod.cloudflare.dev/session/${makeState("h2c")}`,
				{ headers: { Upgrade: "h2c", [WRANGLER_CLIENT_HEADER]: "tok" } }
			);
			expect(resp.status).toBe(404);
		});
	});

	describe("GET /callback", () => {
		it("should forward auth code (with state echo) and redirect to consent-granted", async ({
			expect,
		}) => {
			const state = makeState("cb-c-" + Date.now());

			const wsResp = await SELF.fetch(
				`https://auth.devprod.cloudflare.dev/session/${state}`,
				{ headers: wranglerWsHeaders() }
			);
			expect(wsResp.status).toBe(101);
			expect(wsResp.webSocket).toBeDefined();
			const ws = wsResp.webSocket as WebSocket;
			ws.accept();

			const messagePromise = nextMessage(ws);

			const callbackResp = await SELF.fetch(
				`https://auth.devprod.cloudflare.dev/callback?code=test-auth-code&state=${state}`,
				{ redirect: "manual" }
			);

			expect(callbackResp.status).toBe(307);
			expect(callbackResp.headers.get("Location")).toBe(
				"https://welcome.developers.workers.dev/wrangler-oauth-consent-granted"
			);
			// Hardened security headers on the redirect (REVIEW-17452 #18).
			expect(callbackResp.headers.get("Referrer-Policy")).toBe("no-referrer");
			expect(callbackResp.headers.get("Cache-Control")).toBe(
				"no-store, private"
			);
			expect(callbackResp.headers.get("Pragma")).toBe("no-cache");
			expect(callbackResp.headers.get("X-Content-Type-Options")).toBe(
				"nosniff"
			);

			// DO sends `{code, state}` so Wrangler can revalidate state
			// (REVIEW-17452 #14).
			const message = await messagePromise;
			expect(JSON.parse(message)).toEqual({
				code: "test-auth-code",
				state,
			});
		});

		it("should forward access_denied error (with state echo) and redirect to consent-denied", async ({
			expect,
		}) => {
			const state = makeState("cb-d-" + Date.now());

			const wsResp = await SELF.fetch(
				`https://auth.devprod.cloudflare.dev/session/${state}`,
				{ headers: wranglerWsHeaders() }
			);
			expect(wsResp.status).toBe(101);
			const ws = wsResp.webSocket as WebSocket;
			ws.accept();

			const messagePromise = nextMessage(ws);

			const callbackResp = await SELF.fetch(
				`https://auth.devprod.cloudflare.dev/callback?error=access_denied&state=${state}`,
				{ redirect: "manual" }
			);

			expect(callbackResp.status).toBe(307);
			expect(callbackResp.headers.get("Location")).toBe(
				"https://welcome.developers.workers.dev/wrangler-oauth-consent-denied"
			);

			const message = await messagePromise;
			expect(JSON.parse(message)).toEqual({
				error: "access_denied",
				state,
			});
		});

		it("should redirect to consent-denied when state parameter is missing", async ({
			expect,
		}) => {
			// Missing state used to return 400, but distinct error codes
			// leak session-existence (#29). Now we redirect to denied.
			const resp = await SELF.fetch(
				"https://auth.devprod.cloudflare.dev/callback?code=test-code",
				{ redirect: "manual" }
			);
			expect(resp.status).toBe(307);
			expect(resp.headers.get("Location")).toBe(
				"https://welcome.developers.workers.dev/wrangler-oauth-consent-denied"
			);
		});

		it("should redirect to consent-denied when callback has neither code nor error", async ({
			expect,
		}) => {
			const state = makeState("cb-e-" + Date.now());

			const wsResp = await SELF.fetch(
				`https://auth.devprod.cloudflare.dev/session/${state}`,
				{ headers: wranglerWsHeaders() }
			);
			expect(wsResp.status).toBe(101);
			const ws = wsResp.webSocket as WebSocket;
			ws.accept();

			const messagePromise = nextMessage(ws);

			const callbackResp = await SELF.fetch(
				`https://auth.devprod.cloudflare.dev/callback?state=${state}`,
				{ redirect: "manual" }
			);

			expect(callbackResp.status).toBe(307);
			expect(callbackResp.headers.get("Location")).toBe(
				"https://welcome.developers.workers.dev/wrangler-oauth-consent-denied"
			);

			const message = await messagePromise;
			expect(JSON.parse(message)).toEqual({
				error: "missing_code",
				state,
			});
		});

		it("should redirect to consent-denied when no WebSocket is connected", async ({
			expect,
		}) => {
			const callbackResp = await SELF.fetch(
				`https://auth.devprod.cloudflare.dev/callback?code=test-code&state=${makeState("nows-" + Date.now())}`,
				{ redirect: "manual" }
			);
			expect(callbackResp.status).toBe(307);
			expect(callbackResp.headers.get("Location")).toBe(
				"https://welcome.developers.workers.dev/wrangler-oauth-consent-denied"
			);
		});

		it("DO returns 404 when /callback hits a session with no connected WebSocket", async ({
			expect,
		}) => {
			const stub = exports.AuthSession.getByName(
				makeState("do-direct-" + Date.now())
			);
			const resp = await stub.fetch(
				new Request("https://do/callback?code=test-code")
			);
			expect(resp.status).toBe(404);
		});

		it("should reject a second /callback after a successful dispatch (delivered latch, REVIEW-17452 #1)", async ({
			expect,
		}) => {
			const state = makeState("dl-" + Date.now());

			const wsResp = await SELF.fetch(
				`https://auth.devprod.cloudflare.dev/session/${state}`,
				{ headers: wranglerWsHeaders() }
			);
			expect(wsResp.status).toBe(101);
			const ws = wsResp.webSocket as WebSocket;
			ws.accept();

			const firstMessage = nextMessage(ws);

			// First callback: legitimate.
			const first = await SELF.fetch(
				`https://auth.devprod.cloudflare.dev/callback?code=legit&state=${state}`,
				{ redirect: "manual" }
			);
			expect(first.status).toBe(307);
			expect(first.headers.get("Location")).toBe(
				"https://welcome.developers.workers.dev/wrangler-oauth-consent-granted"
			);
			expect(JSON.parse(await firstMessage)).toEqual({
				code: "legit",
				state,
			});

			// Second callback (replay/injection attempt with a different code):
			// must NOT dispatch and must redirect to consent-denied.
			const second = await SELF.fetch(
				`https://auth.devprod.cloudflare.dev/callback?code=injected&state=${state}`,
				{ redirect: "manual" }
			);
			expect(second.status).toBe(307);
			expect(second.headers.get("Location")).toBe(
				"https://welcome.developers.workers.dev/wrangler-oauth-consent-denied"
			);
		});
	});

	describe("Unknown routes", () => {
		it("should return 404 for unknown paths", async ({ expect }) => {
			const resp = await SELF.fetch(
				"https://auth.devprod.cloudflare.dev/unknown"
			);
			expect(resp.status).toBe(404);
		});

		it("should return 404 for root path", async ({ expect }) => {
			const resp = await SELF.fetch("https://auth.devprod.cloudflare.dev/");
			expect(resp.status).toBe(404);
		});
	});
});
