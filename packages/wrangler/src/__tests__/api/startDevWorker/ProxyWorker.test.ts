import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { transformSync } from "esbuild";
import { describe, it, vi } from "vitest";
import proxyWorkerPath from "worker:startDevWorker/ProxyWorker";
import type { ProxyWorkerIncomingRequestBody } from "../../../api/startDevWorker/events";

// Load the bundled Worker so its runtime types do not leak into Node's globals.
const proxyWorkerCode = transformSync(readFileSync(proxyWorkerPath, "utf8"), {
	format: "cjs",
}).code;
type ProxyWorkerModule = {
	ProxyWorker: new (
		state: { getWebSockets(): never[] },
		env: { PROXY_CONTROLLER_AUTH_SECRET: string }
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
				URL,
				setTimeout,
				// Node's Headers lacks the Workers getAll() method used by the proxy.
				Headers: class extends Headers {
					getAll() {
						return this.getSetCookie();
					}
				},
			});
			const { ProxyWorker } = workerModule.exports as ProxyWorkerModule;

			const secret = "proxy-controller-secret";
			const proxy = new ProxyWorker(
				{ getWebSockets: () => [] },
				{ PROXY_CONTROLLER_AUTH_SECRET: secret }
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
