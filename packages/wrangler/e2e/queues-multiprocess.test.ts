import dedent from "ts-dedent";
import { beforeEach, describe, it } from "vitest";
import { WranglerE2ETestHelper } from "./helpers/e2e-wrangler-test";
import { fetchText } from "./helpers/fetch-text";
import { generateResourceName } from "./helpers/generate-resource-name";
import { seed as baseSeed, makeRoot } from "./helpers/setup";

// Regression test for https://github.com/cloudflare/workers-sdk/issues/9795.
// A Queue producer and consumer running as separate `wrangler dev` processes
// previously dropped messages silently. They now route via the dev registry.
describe("queues across separate wrangler dev processes", () => {
	let producerName: string;
	let consumerName: string;
	let queueName: string;
	let producerDir: string;
	let consumerDir: string;
	let helper: WranglerE2ETestHelper;

	beforeEach(async () => {
		producerName = generateResourceName("producer");
		consumerName = generateResourceName("consumer");
		queueName = generateResourceName("queue");
		helper = new WranglerE2ETestHelper();

		producerDir = makeRoot();
		await baseSeed(producerDir, {
			"wrangler.toml": dedent`
				name = "${producerName}"
				main = "src/index.ts"
				compatibility_date = "2025-06-30"

				[[queues.producers]]
				queue = "${queueName}"
				binding = "QUEUE"
			`,
			"src/index.ts": dedent /* javascript */ `
				export default {
					async fetch(req, env) {
						await env.QUEUE.send({ hello: "world" });
						return new Response("sent");
					}
				}
			`,
			"package.json": dedent`
				{ "name": "producer", "version": "0.0.0", "private": true }
			`,
		});

		consumerDir = makeRoot();
		await baseSeed(consumerDir, {
			"wrangler.toml": dedent`
				name = "${consumerName}"
				main = "src/index.ts"
				compatibility_date = "2025-06-30"

				[[queues.consumers]]
				queue = "${queueName}"
				max_batch_size = 1
				max_batch_timeout = 0
			`,
			"src/index.ts": dedent /* javascript */ `
				export default {
					async queue(batch, env) {
						for (const msg of batch.messages) {
							console.log("QUEUE_RECEIVED " + JSON.stringify(msg.body));
						}
					}
				}
			`,
			"package.json": dedent`
				{ "name": "consumer", "version": "0.0.0", "private": true }
			`,
		});
	});

	it("delivers a message (start consumer, then producer)", async ({
		expect,
	}) => {
		const consumer = helper.runLongLived("wrangler dev", { cwd: consumerDir });
		await consumer.waitForReady();

		const producer = helper.runLongLived("wrangler dev", { cwd: producerDir });
		const { url } = await producer.waitForReady();

		await expect(fetchText(url)).resolves.toBe("sent");
		await consumer.readUntil(/QUEUE_RECEIVED \{"hello":"world"\}/, 20_000);
	});

	it("delivers a message (start producer, then consumer)", async ({
		expect,
	}) => {
		const producer = helper.runLongLived("wrangler dev", { cwd: producerDir });
		const { url } = await producer.waitForReady();

		const consumer = helper.runLongLived("wrangler dev", { cwd: consumerDir });
		await consumer.waitForReady();

		// Retry sends until the registry has propagated the consumer to the
		// producer process.
		await expect
			.poll(
				async () => {
					await fetchText(url);
					return consumer.currentOutput;
				},
				{ timeout: 20_000 }
			)
			.toMatch(/QUEUE_RECEIVED \{"hello":"world"\}/);
	});
});
