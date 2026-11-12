import { newWebSocketRpcSession, RpcTarget } from "capnweb";
import { Miniflare, QUEUES_PLUGIN_NAME, Response } from "miniflare";
import { describe, test, vi } from "vitest";
import {
	MiniflareDurableObjectControlStub,
	singleModuleManifest,
	useDispose,
	useServer,
} from "../../test-shared";
import type { RemoteProxyConnectionString } from "miniflare";

// https://github.com/cloudflare/workers-sdk/issues/13727
//
// A queue producer binding with `dev: { remote: true }` and a remote proxy
// connection string should send its messages to the deployed queue through
// the remote proxy, as other `local-and-remote` bindings (KV, R2, D1,
// Pipelines...) do. Today Miniflare ignores the setting and wires the binding
// to the local in-memory broker instead, with no warning.

const QUEUE_NAME = "my-prod-queue";

const producerScript = /* javascript */ `export default {
	async fetch(request, env) {
		try {
			await env.MY_QUEUE.send({ hello: "world" });
			return new Response("sent");
		} catch (e) {
			return new Response(String(e), { status: 500 });
		}
	}
}`;

class RemoteQueue extends RpcTarget {
	messages: unknown[] = [];

	send(body: unknown) {
		this.messages.push(body);
	}

	sendBatch(messages: { body: unknown }[]) {
		for (const message of messages) {
			this.messages.push(message.body);
		}
	}
}

/**
 * A fake remote proxy server. It records the binding named by every request it
 * receives, whether a plain HTTP request (`MF-Binding` header) or a JSRPC
 * WebSocket session (`MF-Binding` search param), and serves JSRPC sessions
 * with a fake queue.
 */
async function useRemoteProxy() {
	const queue = new RemoteQueue();
	const bindings: string[] = [];
	const { http: proxyUrl } = await useServer(
		(req, res) => {
			const binding = req.headers["mf-binding"];
			if (typeof binding === "string") {
				bindings.push(binding);
			}
			req.resume();
			res.statusCode = 200;
			res.end();
		},
		(socket, req) => {
			const url = new URL(req.url ?? "/", "http://localhost");
			const binding = url.searchParams.get("MF-Binding");
			if (binding !== null) {
				bindings.push(binding);
			}
			newWebSocketRpcSession(socket as unknown as WebSocket, queue);
		}
	);
	return { queue, bindings, proxyUrl };
}

function producerWorker(proxyUrl: URL) {
	return {
		config: {
			name: "producer",
			compatibilityDate: "2025-05-01",
			manifest: singleModuleManifest(producerScript),
			env: {
				MY_QUEUE: {
					type: "queue" as const,
					name: QUEUE_NAME,
					dev: { remote: true },
				},
			},
		},
		dev: {
			remoteProxyConnectionString: proxyUrl as RemoteProxyConnectionString,
		},
	};
}

describe("remote queue producer bindings", () => {
	test("sends messages through the remote proxy when `dev.remote` is set", async ({
		expect,
	}) => {
		const remote = await useRemoteProxy();
		const mf = new Miniflare({ workers: [producerWorker(remote.proxyUrl)] });
		useDispose(mf);

		const response = await mf.dispatchFetch("http://localhost/");
		await response.text();

		await vi.waitFor(() => expect(remote.bindings).toContain("MY_QUEUE"));
	});

	test("doesn't deliver a remote producer's messages to a local consumer", async ({
		expect,
	}) => {
		const remote = await useRemoteProxy();
		const batches: unknown[] = [];
		const mf = new Miniflare({
			workers: [
				producerWorker(remote.proxyUrl),
				{
					config: {
						name: "consumer",
						compatibilityDate: "2025-05-01",
						env: {
							REPORTER: {
								type: "fetcher",
								handler: async (request) => {
									batches.push(await request.json());
									return new Response();
								},
							},
						},
						triggers: [{ type: "queue", name: QUEUE_NAME, maxBatchSize: 1 }],
						manifest: singleModuleManifest(`export default {
							async queue(batch, env) {
								await env.REPORTER.fetch("http://localhost", {
									method: "POST",
									body: JSON.stringify(batch.messages.map(({ body }) => body)),
								});
							}
						}`),
					},
				},
			],
		});
		useDispose(mf);

		const objectNamespace = await mf._getInternalDurableObjectNamespace(
			QUEUES_PLUGIN_NAME,
			"queues:queue",
			"QueueBrokerObject"
		);
		const broker = new MiniflareDurableObjectControlStub(
			objectNamespace.get(objectNamespace.idFromName(QUEUE_NAME))
		);
		await broker.enableFakeTimers(1_000_000);

		const response = await mf.dispatchFetch("http://localhost/");
		await response.text();

		await broker.advanceFakeTime(5_000);
		await broker.waitForFakeTasks();

		// The message belongs to the deployed queue, not the local broker.
		expect(batches).toEqual([]);
	});
});
