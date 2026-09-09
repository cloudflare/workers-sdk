import path from "node:path";
import { convertV4MiniflareOptions, Miniflare, Response } from "miniflare";
import { test } from "vitest";
import proxyWorkerPath from "worker:startDevWorker/ProxyWorker";
import type { ProxyWorkerOutgoingRequestBody } from "../../../api/startDevWorker/events";

test.for(["text/plain", "text/html"])(
	"returns a readable 502 when a 400 %s response stream fails",
	async (contentType, { expect, onTestFinished }) => {
		const messages: ProxyWorkerOutgoingRequestBody[] = [];
		const mf = new Miniflare(
			convertV4MiniflareOptions({
				workers: [
					{
						name: "ProxyWorker",
						compatibilityDate: "2023-12-18",
						compatibilityFlags: ["nodejs_compat"],
						modulesRoot: path.dirname(proxyWorkerPath),
						modules: [{ type: "ESModule", path: proxyWorkerPath }],
						durableObjects: { DURABLE_OBJECT: "ProxyWorker" },
						unsafeEphemeralDurableObjects: true,
						bindings: { PROXY_CONTROLLER_AUTH_SECRET: "secret" },
						serviceBindings: {
							PROXY_CONTROLLER: async (request) => {
								messages.push(
									(await request.json()) as ProxyWorkerOutgoingRequestBody
								);
								return new Response(null, { status: 204 });
							},
						},
						outboundService: "UserWorker",
					},
					{
						name: "UserWorker",
						compatibilityDate: "2023-12-18",
						modules: true,
						bindings: { CONTENT_TYPE: contentType },
						script: `
							let attempts = 0;
							export default {
								fetch(request, env) {
									if (new URL(request.url).pathname === "/broken") {
										attempts++;
										const body = new ReadableStream({
											start(controller) {
												controller.enqueue(new TextEncoder().encode("partial body"));
												setTimeout(() => controller.error(new Error("response stream failed")), 20);
											}
										});
										return new Response(body, { status: 400, headers: { "content-type": env.CONTENT_TYPE } });
									}
									return Response.json({ attempts });
								}
							}
						`,
					},
				],
			})
		);
		onTestFinished(() => mf.dispose());
		await mf.dispatchFetch("http://localhost", {
			headers: { Authorization: "secret" },
			cf: {
				hostMetadata: {
					type: "play",
					proxyData: {
						userWorkerUrl: {
							protocol: "http:",
							hostname: "upstream",
							port: "",
						},
						headers: {},
						liveReload: true,
					},
				},
			},
		});

		const response = await mf.dispatchFetch("http://localhost/broken");
		expect(response.status).toBe(502);
		await expect(response.text()).resolves.toContain(
			"Could not proxy this request to your Worker:"
		);
		await expect
			.poll(() => messages.map((message) => message.type))
			.toEqual(["debug-log"]);

		// A response-body failure must neither replay the handler nor stop later requests.
		const next = await mf.dispatchFetch("http://localhost/healthy");
		expect(next.status).toBe(200);
		await expect(next.json()).resolves.toEqual({ attempts: 1 });
	}
);
