import {
	createExecutionContext,
	waitOnExecutionContext,
} from "cloudflare:test";
import { env } from "cloudflare:workers";
import { ws } from "msw";
import { assert, it } from "vitest";
import worker from "../src/index";
import { network } from "./server";

it("mocks outbound WebSocket connections", async ({ expect }) => {
	const api = ws.link("wss://cloudflare.com/echo-ws");
	network.use(
		api.addEventListener("connection", ({ client }) => {
			client.addEventListener("message", (event) => {
				assert(typeof event.data === "string");
				client.send(event.data.toUpperCase());
			});
		})
	);

	// Host `example.com` will be rewritten to `cloudflare.com` by the Worker,
	// which then opens an outbound WebSocket connection to that URL. MSW's
	// WebSocketInterceptor patches the `WebSocket` global to intercept it.
	const ctx = createExecutionContext();
	const response = await worker.fetch!(
		new Request("https://example.com/echo-ws"),
		env,
		ctx
	);
	await waitOnExecutionContext(ctx);
	expect(response.status).toBe(200);
	await expect(response.json()).resolves.toEqual({ message: "HELLO" });
});
