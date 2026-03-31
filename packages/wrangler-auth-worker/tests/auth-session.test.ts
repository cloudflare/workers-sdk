import { exports } from "cloudflare:workers";
import { describe, it } from "vitest";

describe("wrangler-auth-worker", () => {
	describe("GET /session/:state (WebSocket upgrade)", () => {
		it("should accept a WebSocket connection", async ({ expect }) => {
			const resp = await exports.default.fetch(
				"https://auth.devprod.cloudflare.dev/session/test-ws-accept",
				{ headers: { Upgrade: "websocket" } }
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
			const state = "test-duplicate-ws-" + Date.now();

			// First connection should succeed
			const resp1 = await exports.default.fetch(
				`https://auth.devprod.cloudflare.dev/session/${state}`,
				{ headers: { Upgrade: "websocket" } }
			);
			expect(resp1.status).toBe(101);
			resp1.webSocket?.accept();

			// Second connection should be rejected
			const resp2 = await exports.default.fetch(
				`https://auth.devprod.cloudflare.dev/session/${state}`,
				{ headers: { Upgrade: "websocket" } }
			);
			expect(resp2.status).toBe(409);

			resp1.webSocket?.close();
		});

		it("should reject non-WebSocket requests to /session/:state", async ({
			expect,
		}) => {
			const resp = await exports.default.fetch(
				"https://auth.devprod.cloudflare.dev/session/test-no-ws"
			);
			expect(resp.status).toBe(426);
		});
	});

	describe("GET /callback", () => {
		it("should forward auth code and redirect to consent-granted page", async ({
			expect,
		}) => {
			const state = "test-cb-code-" + Date.now();

			// Connect WebSocket
			const wsResp = await exports.default.fetch(
				`https://auth.devprod.cloudflare.dev/session/${state}`,
				{ headers: { Upgrade: "websocket" } }
			);
			expect(wsResp.status).toBe(101);
			expect(wsResp.webSocket).toBeDefined();
			const ws = wsResp.webSocket;
			ws?.accept();

			// Collect messages
			const messages: string[] = [];
			ws?.addEventListener("message", (event: MessageEvent) => {
				messages.push(typeof event.data === "string" ? event.data : "");
			});

			// Trigger callback (don't follow the redirect)
			const callbackResp = await exports.default.fetch(
				`https://auth.devprod.cloudflare.dev/callback?code=test-auth-code&state=${state}`,
				{ redirect: "manual" }
			);

			// Should redirect to consent-granted page
			expect(callbackResp.status).toBe(307);
			expect(callbackResp.headers.get("Location")).toBe(
				"https://welcome.developers.workers.dev/wrangler-oauth-consent-granted"
			);

			// Wait a tick for the message to be delivered
			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(messages.length).toBe(1);
			expect(JSON.parse(messages[0])).toEqual({ code: "test-auth-code" });
		});

		it("should forward access_denied error and redirect to consent-denied page", async ({
			expect,
		}) => {
			const state = "test-cb-denied-" + Date.now();

			// Connect WebSocket
			const wsResp = await exports.default.fetch(
				`https://auth.devprod.cloudflare.dev/session/${state}`,
				{ headers: { Upgrade: "websocket" } }
			);
			expect(wsResp.status).toBe(101);
			expect(wsResp.webSocket).toBeDefined();
			const ws = wsResp.webSocket;
			ws?.accept();

			// Collect messages
			const messages: string[] = [];
			ws?.addEventListener("message", (event: MessageEvent) => {
				messages.push(typeof event.data === "string" ? event.data : "");
			});

			// Trigger callback with error (don't follow the redirect)
			const callbackResp = await exports.default.fetch(
				`https://auth.devprod.cloudflare.dev/callback?error=access_denied&state=${state}`,
				{ redirect: "manual" }
			);

			// Should redirect to consent-denied page
			expect(callbackResp.status).toBe(307);
			expect(callbackResp.headers.get("Location")).toBe(
				"https://welcome.developers.workers.dev/wrangler-oauth-consent-denied"
			);

			// Wait a tick for the message to be delivered
			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(messages.length).toBe(1);
			expect(JSON.parse(messages[0])).toEqual({ error: "access_denied" });
		});

		it("should return 400 when state parameter is missing", async ({
			expect,
		}) => {
			const resp = await exports.default.fetch(
				"https://auth.devprod.cloudflare.dev/callback?code=test-code"
			);
			expect(resp.status).toBe(400);
		});

		it("should redirect to consent-denied page when callback has neither code nor error", async ({
			expect,
		}) => {
			const state = "test-cb-malformed-" + Date.now();

			// Connect WebSocket
			const wsResp = await exports.default.fetch(
				`https://auth.devprod.cloudflare.dev/session/${state}`,
				{ headers: { Upgrade: "websocket" } }
			);
			expect(wsResp.status).toBe(101);
			expect(wsResp.webSocket).toBeDefined();
			const ws = wsResp.webSocket;
			ws?.accept();

			// Collect messages
			const messages: string[] = [];
			ws?.addEventListener("message", (event: MessageEvent) => {
				messages.push(typeof event.data === "string" ? event.data : "");
			});

			// Trigger callback with neither code nor error (malformed redirect)
			const callbackResp = await exports.default.fetch(
				`https://auth.devprod.cloudflare.dev/callback?state=${state}`,
				{ redirect: "manual" }
			);

			// Should redirect to consent-DENIED page (not granted)
			expect(callbackResp.status).toBe(307);
			expect(callbackResp.headers.get("Location")).toBe(
				"https://welcome.developers.workers.dev/wrangler-oauth-consent-denied"
			);

			// Wait a tick for the message to be delivered
			await new Promise((resolve) => setTimeout(resolve, 100));

			// DO should have sent missing_code error over WebSocket
			expect(messages.length).toBe(1);
			expect(JSON.parse(messages[0])).toEqual({ error: "missing_code" });
		});

		it("should still redirect even when no WebSocket is connected", async ({
			expect,
		}) => {
			// Callback to a session that has no WebSocket connected
			// The DO returns 409 but the worker redirects regardless
			const callbackResp = await exports.default.fetch(
				`https://auth.devprod.cloudflare.dev/callback?code=test-code&state=no-ws-connected-${Date.now()}`,
				{ redirect: "manual" }
			);
			expect(callbackResp.status).toBe(307);
		});
	});

	describe("Unknown routes", () => {
		it("should return 404 for unknown paths", async ({ expect }) => {
			const resp = await exports.default.fetch(
				"https://auth.devprod.cloudflare.dev/unknown"
			);
			expect(resp.status).toBe(404);
		});

		it("should return 404 for root path", async ({ expect }) => {
			const resp = await exports.default.fetch(
				"https://auth.devprod.cloudflare.dev/"
			);
			expect(resp.status).toBe(404);
		});
	});
});
