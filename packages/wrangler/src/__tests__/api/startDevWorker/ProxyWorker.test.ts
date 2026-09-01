import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { transformSync } from "esbuild";
import {
	convertV4MiniflareOptions,
	Miniflare,
	Response as MiniflareResponse,
} from "miniflare";
import { describe, it, test, vi } from "vitest";
import proxyWorkerPath from "worker:startDevWorker/ProxyWorker";
import type {
	ProxyWorkerIncomingRequestBody,
	ProxyWorkerOutgoingRequestBody,
} from "../../../api/startDevWorker/events";

// Load the bundled Worker so its runtime types do not leak into Node's globals.
const proxyWorkerCode = transformSync(readFileSync(proxyWorkerPath, "utf8"), {
	format: "cjs",
}).code;
type ProxyWorkerModule = {
	ProxyWorker: new (
		state: { getWebSockets(): never[] },
		env: {
			PROXY_CONTROLLER_AUTH_SECRET: string;
			PROXY_CONTROLLER: { fetch: typeof fetch };
		}
	) => {
		fetch(request: Request): Response | Promise<Response>;
		requestRetryQueue: Map<Request, unknown>;
	};
};

describe("ProxyWorker reload retries", () => {
	it.for(["before", "after"] as const)(
		"retries an inflight request that fails %s the replacement Worker starts",
		async (failureOrder, { expect }) => {
			const oldRequest = Promise.withResolvers<Response>();
			const userWorkerFetch = vi
				.fn<typeof globalThis.fetch>()
				.mockReturnValueOnce(oldRequest.promise)
				.mockResolvedValue(new Response("replacement worker"));
			const { proxy, send } = createProxyWorker(userWorkerFetch);
			const oldOrigin = {
				protocol: "http:",
				hostname: "localhost",
				port: "10001",
			};
			const newOrigin = { ...oldOrigin, port: "10002" };
			await send({
				type: "play",
				proxyData: { userWorkerUrl: oldOrigin, headers: {} },
			});
			const response = proxy.fetch(new Request("http://dummy/long"));
			expect(userWorkerFetch).toHaveBeenCalledExactlyOnceWith(
				new URL("http://localhost:10001/long"),
				expect.any(Request)
			);

			await send({ type: "pause" });
			if (failureOrder === "after") {
				await send({
					type: "play",
					proxyData: { userWorkerUrl: newOrigin, headers: {} },
				});
			}
			oldRequest.reject(new TypeError("Old worker connection closed"));
			if (failureOrder === "before") {
				await vi.waitFor(() => {
					expect(proxy.requestRetryQueue.size).toBe(1);
				});
				expect(userWorkerFetch).toHaveBeenCalledTimes(1);
				await send({
					type: "play",
					proxyData: { userWorkerUrl: newOrigin, headers: {} },
				});
			}

			// No further requests or controller messages should be needed to wake the retry.
			await vi.waitFor(() => {
				expect(userWorkerFetch).toHaveBeenCalledTimes(2);
			});
			expect(userWorkerFetch).toHaveBeenLastCalledWith(
				new URL("http://localhost:10002/long"),
				expect.any(Request)
			);
			expect(await (await response).text()).toBe("replacement worker");
		}
	);
});

/** Runs the bundled proxy with controlled I/O and response-processing failures. */
function createProxyWorker(
	userWorkerFetch: typeof fetch,
	runtimeOverrides: Record<string, unknown> = {}
) {
	const messages: ProxyWorkerOutgoingRequestBody[] = [];
	const workerModule = { exports: {} };
	runInNewContext(proxyWorkerCode, {
		module: workerModule,
		exports: workerModule.exports,
		require: createRequire(import.meta.url),
		fetch: userWorkerFetch,
		Request,
		Response: class extends Response {
			constructor(...args: ConstructorParameters<typeof Response>) {
				super(...args);
				Object.assign(this.headers, {
					getAll: () => this.headers.getSetCookie(),
				});
			}
		},
		Error,
		URL,
		setTimeout,
		// Node's Headers lacks the Workers getAll() method used by the proxy.
		Headers: class extends Headers {
			getAll() {
				return this.getSetCookie();
			}
		},
		...runtimeOverrides,
	});
	const { ProxyWorker } = workerModule.exports as ProxyWorkerModule;

	const secret = "proxy-controller-secret";
	const proxy = new ProxyWorker(
		{ getWebSockets: () => [] },
		{
			PROXY_CONTROLLER_AUTH_SECRET: secret,
			PROXY_CONTROLLER: {
				async fetch(input, init) {
					const request = new Request(input, init);
					messages.push(
						(await request.json()) as ProxyWorkerOutgoingRequestBody
					);
					return new Response(null, { status: 204 });
				},
			},
		}
	);
	function send(event: ProxyWorkerIncomingRequestBody) {
		return proxy.fetch(
			Object.assign(
				new Request("http://controller", {
					headers: { Authorization: secret },
				}),
				{ cf: { hostMetadata: event } }
			)
		);
	}
	return { proxy, send, messages };
}

it.for(["GET", "HEAD", "POST"])(
	"returns 502 after a failed %s forward and keeps serving",
	async (method, { expect }) => {
		const userWorkerFetch = vi.fn<typeof fetch>().mockRejectedValue(
			new Error("Network connection lost.", {
				cause: new TypeError("socket hang up"),
			})
		);
		const { proxy, send, messages } = createProxyWorker(userWorkerFetch);
		await send({
			type: "play",
			proxyData: {
				userWorkerUrl: {
					protocol: "http:",
					hostname: "localhost",
					port: "10001",
				},
				headers: {},
			},
		});

		const response = await proxy.fetch(
			new Request("http://dummy/upload", { method })
		);
		expect(response.status).toBe(502);
		await expect(response.text()).resolves.toContain(
			"Could not proxy this request to your Worker: Network connection lost."
		);
		expect(userWorkerFetch).toHaveBeenCalledTimes(method === "POST" ? 1 : 3);
		await expect
			.poll(() => messages.map((message) => message.type))
			.toEqual(["debug-log"]);
		expect(messages).toEqual([
			{
				type: "debug-log",
				args: [
					"Could not proxy request to the UserWorker:",
					method,
					"http://dummy/upload",
					"Network connection lost.",
					expect.objectContaining({
						message: "Network connection lost.",
						stack: expect.any(String),
						cause: expect.objectContaining({ message: "socket hang up" }),
					}),
				],
			},
		]);

		userWorkerFetch.mockResolvedValue(new Response("healthy"));
		await expect(
			(await proxy.fetch(new Request("http://dummy/healthy"))).text()
		).resolves.toBe("healthy");
	}
);

it("reports an unexpected response post-processing failure as fatal", async ({
	expect,
}) => {
	const failure = new Error("Failed to inject live-reload script");
	const userWorkerFetch = vi
		.fn<typeof fetch>()
		.mockResolvedValue(
			new Response("<p>hello</p>", { headers: { "content-type": "text/html" } })
		);
	const { proxy, send, messages } = createProxyWorker(userWorkerFetch, {
		HTMLRewriter: class {
			onDocument() {}
			transform() {
				throw failure;
			}
		},
	});
	await send({
		type: "play",
		proxyData: {
			userWorkerUrl: {
				protocol: "http:",
				hostname: "localhost",
				port: "10001",
			},
			headers: {},
			liveReload: true,
		},
	});

	await expect(proxy.fetch(new Request("http://dummy/"))).rejects.toThrow(
		failure
	);
	expect(userWorkerFetch).toHaveBeenCalledTimes(1);
	await expect
		.poll(() => messages)
		.toEqual([
			expect.objectContaining({
				type: "error",
				error: expect.objectContaining({
					message: expect.stringContaining(failure.message),
				}),
			}),
		]);
});

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
								return new MiniflareResponse(null, { status: 204 });
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
