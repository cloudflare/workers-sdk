import { once } from "node:events";
import { Miniflare } from "miniflare";
import { request } from "undici";
import { test } from "vitest";
import WebSocket from "ws";
import { singleModuleManifest, useDispose } from "../test-shared";

function createMiniflare(upstream?: string) {
	const mf = new Miniflare({
		host: "127.0.0.1",
		cf: false,
		upstream,
		workers: [
			{
				config: {
					name: "",
					compatibilityDate: "2025-01-01",
					manifest: singleModuleManifest(`export default {
						fetch(request) {
							if (request.headers.get("Upgrade") === "websocket") {
								const [client, server] = Object.values(new WebSocketPair());
								server.accept();
								server.send(request.url);
								return new Response(null, { status: 101, webSocket: client });
							}
							return Response.json({
								url: request.url,
								forwardedProto: request.headers.get("X-Forwarded-Proto"),
							});
						}
					}`),
				},
			},
		],
	});
	useDispose(mf);
	return mf;
}

test.for([
	{ header: undefined, scheme: "http" },
	{ header: "https", scheme: "https" },
	{ header: "http", scheme: "http" },
	{ header: "HTTPS, http", scheme: "https" },
	{ header: "invalid", scheme: "http" },
])(
	"network requests honor forwarded protocol $header",
	async ({ header, scheme }, { expect }) => {
		const mf = createMiniflare();
		const response = await request(new URL("/path?query=1", await mf.ready), {
			headers: {
				Host: "app.example.com",
				...(header === undefined ? {} : { "X-Forwarded-Proto": header }),
			},
		});
		expect(await response.body.json()).toEqual({
			url: `${scheme}://app.example.com/path?query=1`,
			forwardedProto: header ?? null,
		});
	}
);

test("preserves a public port that was the physical protocol's default", async ({
	expect,
}) => {
	const mf = createMiniflare();
	const response = await request(await mf.ready, {
		headers: { Host: "app.example.com:80", "X-Forwarded-Proto": "https" },
	});
	expect(await response.body.json()).toEqual({
		url: "https://app.example.com:80/",
		forwardedProto: "https",
	});
});

test("preserves explicit dispatchFetch URLs", async ({ expect }) => {
	const mf = createMiniflare();
	const response = await mf.dispatchFetch("https://explicit.example.com/path", {
		headers: { "X-Forwarded-Proto": "http" },
	});
	expect(await response.json()).toEqual({
		url: "https://explicit.example.com/path",
		forwardedProto: "http",
	});
});

test("preserves a configured upstream origin", async ({ expect }) => {
	const mf = createMiniflare("http://upstream.example.com:9090");
	const response = await request(new URL("/path", await mf.ready), {
		headers: { Host: "app.example.com", "X-Forwarded-Proto": "https" },
	});
	expect(await response.body.json()).toEqual({
		url: "http://upstream.example.com:9090/path",
		forwardedProto: "https",
	});
});

test("WebSocket upgrades honor the forwarded protocol", async ({
	expect,
	onTestFinished,
}) => {
	const mf = createMiniflare();
	const url = new URL("/websocket", await mf.ready);
	url.protocol = "ws:";
	const socket = new WebSocket(url, {
		headers: { Host: "app.example.com", "X-Forwarded-Proto": "https" },
	});
	onTestFinished(() => socket.terminate());
	const [message] = await once(socket, "message");
	expect(message.toString()).toBe("https://app.example.com/websocket");
});
