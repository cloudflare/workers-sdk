import { Miniflare, Response } from "miniflare";
import { describe, test, vi } from "vitest";
import { useDispose, useTmp } from "../../test-shared";

// A consumer Miniflare instance whose `queue()` handler reports each batch's
// message bodies back to the Node-side `received` array via a local service
// binding. The broker lives here (the consumer process); the producer routes to
// it across the dev registry.
function createConsumer(
	unsafeDevRegistryPath: string,
	received: unknown[][]
): Miniflare {
	return new Miniflare({
		name: "consumer",
		unsafeDevRegistryPath,
		compatibilityFlags: ["experimental"],
		queueConsumers: {
			// Flush immediately so delivery is deterministic.
			"my-queue": { maxBatchSize: 1, maxBatchTimeout: 0 },
		},
		serviceBindings: {
			async REPORTER(request) {
				received.push((await request.json()) as unknown[]);
				return new Response();
			},
		},
		modules: true,
		script: `export default {
			async queue(batch, env) {
				await env.REPORTER.fetch("http://localhost", {
					method: "POST",
					body: JSON.stringify(batch.messages.map((m) => m.body)),
				});
			}
		}`,
	});
}

function createProducer(unsafeDevRegistryPath: string): Miniflare {
	return new Miniflare({
		name: "producer",
		unsafeDevRegistryPath,
		compatibilityFlags: ["experimental"],
		queueProducers: { QUEUE: { queueName: "my-queue" } },
		modules: true,
		script: `export default {
			async fetch(request, env) {
				const body = await request.json();
				const url = new URL(request.url);
				if (url.pathname === "/batch") {
					await env.QUEUE.sendBatch(body.map((b) => ({ body: b })));
				} else {
					await env.QUEUE.send(body);
				}
				return new Response(null, { status: 204 });
			}
		}`,
	});
}

describe.sequential("cross-process queues", () => {
	test("delivers a message to a consumer in another process", async ({
		expect,
	}) => {
		const unsafeDevRegistryPath = await useTmp();
		const received: unknown[][] = [];

		const consumer = createConsumer(unsafeDevRegistryPath, received);
		useDispose(consumer);
		await consumer.ready;

		const producer = createProducer(unsafeDevRegistryPath);
		useDispose(producer);
		await producer.ready;

		await vi.waitFor(
			async () => {
				const res = await producer.dispatchFetch("http://placeholder", {
					method: "POST",
					body: JSON.stringify({ hello: "world", n: 42 }),
				});
				expect(res.status).toBe(204);
				expect(received.flat()).toContainEqual({ hello: "world", n: 42 });
			},
			{ timeout: 10_000, interval: 100 }
		);
	});

	test("delivers a batch via sendBatch", async ({ expect }) => {
		const unsafeDevRegistryPath = await useTmp();
		const received: unknown[][] = [];

		const consumer = createConsumer(unsafeDevRegistryPath, received);
		useDispose(consumer);
		await consumer.ready;

		const producer = createProducer(unsafeDevRegistryPath);
		useDispose(producer);
		await producer.ready;

		await vi.waitFor(
			async () => {
				const res = await producer.dispatchFetch("http://placeholder/batch", {
					method: "POST",
					body: JSON.stringify(["a", "b", "c"]),
				});
				expect(res.status).toBe(204);
				const all = received.flat();
				expect(all).toContain("a");
				expect(all).toContain("b");
				expect(all).toContain("c");
			},
			{ timeout: 10_000, interval: 100 }
		);
	});

	test("drops gracefully when no consumer is running, then resumes", async ({
		expect,
	}) => {
		const unsafeDevRegistryPath = await useTmp();
		const received: unknown[][] = [];

		// Producer starts with no consumer registered: send must still succeed
		// (mirroring the local no-consumer drop) rather than throw.
		const producer = createProducer(unsafeDevRegistryPath);
		useDispose(producer);
		await producer.ready;

		const dropped = await producer.dispatchFetch("http://placeholder", {
			method: "POST",
			body: JSON.stringify({ phase: "before-consumer" }),
		});
		expect(dropped.status).toBe(204);
		expect(received.flat()).toEqual([]);

		// Once the consumer comes up, delivery resumes without restarting the
		// producer (the dev registry pushes the new consumer to the proxy).
		const consumer = createConsumer(unsafeDevRegistryPath, received);
		useDispose(consumer);
		await consumer.ready;

		await vi.waitFor(
			async () => {
				const res = await producer.dispatchFetch("http://placeholder", {
					method: "POST",
					body: JSON.stringify({ phase: "after-consumer" }),
				});
				expect(res.status).toBe(204);
				expect(received.flat()).toContainEqual({ phase: "after-consumer" });
			},
			{ timeout: 10_000, interval: 100 }
		);
	});

	test("routes dead-lettered messages to a consumer in another process", async ({
		expect,
	}) => {
		const unsafeDevRegistryPath = await useTmp();
		const received: unknown[][] = [];

		// This process consumes the dead-letter queue only.
		const dlqConsumer = new Miniflare({
			name: "dlq-consumer",
			unsafeDevRegistryPath,
			compatibilityFlags: ["experimental"],
			queueConsumers: { "my-dlq": { maxBatchSize: 1, maxBatchTimeout: 0 } },
			serviceBindings: {
				async REPORTER(request) {
					received.push((await request.json()) as unknown[]);
					return new Response();
				},
			},
			modules: true,
			script: `export default {
				async queue(batch, env) {
					await env.REPORTER.fetch("http://localhost", {
						method: "POST",
						body: JSON.stringify(batch.messages.map((m) => m.body)),
					});
				}
			}`,
		});
		useDispose(dlqConsumer);
		await dlqConsumer.ready;

		// This process produces and consumes "my-queue", always failing, so every
		// message moves to "my-dlq", whose consumer lives in the other process.
		const failingConsumer = new Miniflare({
			name: "failing-consumer",
			unsafeDevRegistryPath,
			compatibilityFlags: ["experimental"],
			queueProducers: { QUEUE: { queueName: "my-queue" } },
			queueConsumers: {
				"my-queue": {
					maxBatchSize: 1,
					maxBatchTimeout: 0,
					maxRetries: 0,
					deadLetterQueue: "my-dlq",
				},
			},
			modules: true,
			script: `export default {
				async fetch(request, env) {
					await env.QUEUE.send(await request.json());
					return new Response(null, { status: 204 });
				},
				async queue() {
					throw new Error("consumer always fails");
				}
			}`,
		});
		useDispose(failingConsumer);
		await failingConsumer.ready;

		await vi.waitFor(
			async () => {
				const res = await failingConsumer.dispatchFetch("http://placeholder", {
					method: "POST",
					body: JSON.stringify({ dead: "letter" }),
				});
				expect(res.status).toBe(204);
				expect(received.flat()).toContainEqual({ dead: "letter" });
			},
			{ timeout: 10_000, interval: 100 }
		);
	});
});
