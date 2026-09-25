import { newWebSocketRpcSession, RpcTarget } from "capnweb";
import { Miniflare } from "miniflare";
import { describe, test, vi } from "vitest";
import { singleModuleManifest, useDispose, useServer } from "../../test-shared";
import type { K2ProduceResult, K2Producer, K2Record } from "@cloudflare/config";
import type { RemoteProxyConnectionString } from "miniflare";
import type { RequestListener } from "node:http";

const stream = "0123456789abcdef0123456789abcdef";
const remoteRequiredError = "Binding ORDERS needs to be run remotely";
const script = `export default {
	async fetch(request, env) {
		try {
			// Only [1, 2, 3] should be sent; the surrounding 255s catch ignored view offsets or lengths.
			const bytes = new Uint8Array([255, 1, 2, 3, 255]).subarray(1, 4);
			const useArrayBuffer = new URL(request.url).searchParams.has("array-buffer");
			const content = useArrayBuffer ? bytes.slice().buffer : bytes;
			const records = [{ content, headers: { event: "order.created" } }];
			if (new URL(request.url).searchParams.has("mixed")) records.push({ content: useArrayBuffer ? bytes : bytes.buffer });
			return Response.json(await env.ORDERS.send(records));
		} catch (err) {
			return new Response(err.message, { status: 500 });
		}
	}
}`;

class Producer extends RpcTarget {
	batches: K2Record<ArrayBuffer | Uint8Array>[][] = [];
	result: K2ProduceResult = { success: true };
	throwError = false;

	send(records: K2Record<ArrayBuffer | Uint8Array>[]): K2ProduceResult {
		this.batches.push(records);
		if (this.throwError) {
			throw new Error("Upstream RPC failed");
		}
		return this.result;
	}
}

function producerWorker(proxyUrl?: URL, remote?: boolean) {
	return {
		config: {
			name: "producer",
			compatibilityDate: "2025-04-28",
			manifest: singleModuleManifest(script),
			env: {
				ORDERS: {
					type: "k2" as const,
					stream,
					...(remote === undefined ? {} : { dev: { remote } }),
				},
			},
		},
		dev: {
			remoteProxyConnectionString: proxyUrl as
				| RemoteProxyConnectionString
				| undefined,
		},
	};
}

describe("K2 producer binding", () => {
	test("closes each remote session after success, returned failure, and thrown failure", async ({
		expect,
	}) => {
		const producer = new Producer();
		let opened = 0;
		let closed = 0;
		const { http: proxyUrl } = await useServer(
			(_req, res) => {
				res.statusCode = 500;
				res.end("Expected RPC WebSocket");
			},
			(socket) => {
				opened++;
				socket.once("close", () => {
					closed++;
				});
				newWebSocketRpcSession(socket as unknown as WebSocket, producer);
			}
		);
		const worker = producerWorker(proxyUrl);
		worker.config.manifest = singleModuleManifest(`export default {
			async fetch(request, env) {
				try {
					const count = Number(new URL(request.url).searchParams.get("count") || 1);
					let result;
					for (let i = 0; i < count; i++) result = await env.ORDERS.send([{ content: new Uint8Array([i]) }]);
					return Response.json(result);
				} catch (err) { return new Response(err.message, { status: 500 }); }
			}
		}`);
		const mf = new Miniflare({ workers: [worker] });
		useDispose(mf);

		const success = await mf.dispatchFetch("http://localhost/?count=15");
		expect(await success.json()).toEqual({ success: true });
		expect(opened).toBe(15);
		await vi.waitFor(() => expect(closed).toBe(opened));

		producer.result = {
			success: false,
			error: { code: 10212, message: "Append failed", retryable: false },
		};
		const failed = await mf.dispatchFetch("http://localhost/");
		expect(await failed.json()).toEqual(producer.result);
		expect(opened).toBe(16);
		await vi.waitFor(() => expect(closed).toBe(opened));

		producer.throwError = true;
		const thrown = await mf.dispatchFetch("http://localhost/");
		const message = await thrown.text();
		expect(thrown.status).toBe(500);
		expect(message).toContain("Upstream RPC failed");
		expect(opened).toBe(17);
		await vi.waitFor(() => expect(closed).toBe(opened));
	});

	test.for([undefined, true])(
		"preserves bytes, headers and success/failure results across the remote RPC proxy with remote=%s",
		async (remote, { expect }) => {
			const producer = new Producer();
			const { http: proxyUrl } = await useServer(
				(_req, res) => {
					res.statusCode = 500;
					res.end("Expected RPC WebSocket");
				},
				(socket) => {
					newWebSocketRpcSession(socket as unknown as WebSocket, producer);
				}
			);
			const mf = new Miniflare({ workers: [producerWorker(proxyUrl, remote)] });
			useDispose(mf);
			const response = await mf.dispatchFetch("http://localhost/");
			expect(await response.json()).toEqual({ success: true });
			expect(producer.batches).toEqual([
				[
					{
						content: new Uint8Array([1, 2, 3]),
						headers: { event: "order.created" },
					},
				],
			]);

			producer.result = {
				success: false,
				error: {
					code: 10212,
					message: "The batch could not be appended",
					retryable: false,
				},
			};
			const failed = await mf.dispatchFetch("http://localhost/");
			expect(await failed.json()).toEqual(producer.result);
			expect(producer.batches).toHaveLength(2);

			producer.result = { success: true };
			const arrayBufferResponse = await mf.dispatchFetch(
				"http://localhost/?array-buffer"
			);
			const arrayBufferBody = await arrayBufferResponse.text();
			expect(arrayBufferResponse.status, arrayBufferBody).toBe(200);
			expect(JSON.parse(arrayBufferBody)).toEqual({ success: true });
			expect(producer.batches).toHaveLength(3);
			expect(producer.batches[2]).toEqual([
				{
					content: new Uint8Array([1, 2, 3]),
					headers: { event: "order.created" },
				},
			]);
			for (const query of ["mixed", "mixed&array-buffer"]) {
				const mixed = await mf.dispatchFetch(`http://localhost/?${query}`);
				expect(mixed.status).toBe(500);
				expect(await mixed.text()).toContain(
					"Cannot serialize value: [object ArrayBuffer]"
				);
				expect(producer.batches).toHaveLength(3);
			}
		}
	);

	test("does not use the proxy when remote is explicitly false", async ({
		expect,
	}) => {
		const requests = vi.fn<RequestListener>((_request, response) => {
			response.statusCode = 500;
			response.end("Unexpected remote request");
		});
		const { http: proxyUrl } = await useServer(requests);
		const mf = new Miniflare({
			workers: [producerWorker(proxyUrl, false)],
		});
		useDispose(mf);
		const response = await mf.dispatchFetch("http://localhost/");
		expect(response.status).toBe(500);
		expect(await response.text()).toBe(remoteRequiredError);
		expect(requests).not.toHaveBeenCalled();
	});

	test("exposes the RPC binding through getBindings", async ({ expect }) => {
		const mf = new Miniflare({ workers: [producerWorker()] });
		useDispose(mf);
		const env = await mf.getBindings<{ ORDERS: K2Producer }>();
		// Without a remote proxy the call can't succeed; this error comes from
		// the K2 binding worker, so it proves `send` was routed to it. A missing
		// binding would fail with a different error.
		await expect(async () =>
			env.ORDERS.send([{ content: new Uint8Array([4, 5]).buffer }])
		).rejects.toThrow(remoteRequiredError);
	});

	test("fails rather than silently dropping records without a remote proxy", async ({
		expect,
	}) => {
		const mf = new Miniflare({ workers: [producerWorker()] });
		useDispose(mf);
		const response = await mf.dispatchFetch("http://localhost/");
		expect(response.status).toBe(500);
		expect(await response.text()).toBe(remoteRequiredError);
	});
});
