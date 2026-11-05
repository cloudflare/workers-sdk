import { Log, LogLevel, Miniflare, Response, stripAnsi } from "miniflare";
import { describe, test, vi } from "vitest";
import { z } from "zod";
import { singleModuleManifest, useDispose } from "../../test-shared";

const StringArraySchema = z.string().array();

// workerd limits each isolate to 10,000 active timeouts (`MAX_TIMEOUTS` in
// workerd's `src/workerd/io/io-timers.h`). The queue broker used to set one
// timeout per delayed message (both on send and on retry), and `#flush` didn't
// clear `#pendingFlush` when scheduling retries threw, so once the limit was
// hit the queue never dispatched another batch:
// https://github.com/cloudflare/workers-sdk/issues/16463
//
// The test deliberately leaves only 10 timeout slots free, then dispatches a
// single batch whose 100 messages are all retried: scheduling the 11th retry
// throws `QuotaExceededError` inside `#flush`, which wedges the queue. A
// later "canary" batch then never gets dispatched, even though nothing else
// holds the messages back.
const STORM_COUNT = 9_990; // timeouts held for STORM_DELAY_SECONDS
const STORM_DELAY_SECONDS = 300; // never fires within the test
const BATCH_COUNT = 100; // matches the consumer's max batch size
const RETRY_DELAY_SECONDS = 5;

// Like `NoOpLog`, but records errors instead of discarding them, so the
// `QuotaExceededError` the bug produces doesn't fail the test on its own.
class ErrorCapturingLog extends Log {
	readonly errors: string[] = [];

	constructor() {
		super(LogLevel.ERROR);
	}

	protected log(message: string): void {
		this.errors.push(stripAnsi(message));
	}
}

describe("Queues: timeout limit", { concurrent: false }, () => {
	test(
		"keeps dispatching when delayed messages exceed workerd's timeout limit",
		async ({ expect }) => {
			// Real (non-fake) timers are required: fake timers never create
			// workerd timeouts, so the limit can't be hit.
			const deliveries: string[] = [];
			const log = new ErrorCapturingLog();

			const mf = new Miniflare({
				log,
				workers: [
					{
						config: {
							name: "",
							compatibilityDate: "2025-05-01",
							env: {
								QUEUE: { type: "queue", name: "QUEUE" },
								REPORTER: {
									type: "fetcher",
									handler: async (request) => {
										const batch = StringArraySchema.parse(
											await request.json()
										);
										if (batch.length > 0) {
											deliveries.push(...batch);
										}
										return new Response();
									},
								},
							},
							triggers: [
								{
									type: "queue",
									name: "QUEUE",
									maxBatchSize: BATCH_COUNT,
									maxBatchTimeout: 0,
									maxRetries: 1,
								},
							],
							manifest: singleModuleManifest(`export default {
          async fetch(request, env) {
            const url = new URL(request.url);
            if (url.pathname === "/storm") {
              // Fill workerd's active timeout quota with delayed messages
              for (let i = 0; i < ${STORM_COUNT}; i += 100) {
                const n = Math.min(100, ${STORM_COUNT} - i);
                const messages = [];
                for (let j = 0; j < n; j++) {
                  messages.push({
                    body: "s-" + (i + j),
                    delaySeconds: ${STORM_DELAY_SECONDS},
                  });
                }
                await env.QUEUE.sendBatch(messages);
              }
            } else if (url.pathname === "/send") {
              const prefix = url.searchParams.get("prefix");
              const messages = [];
              for (let j = 0; j < ${BATCH_COUNT}; j++) {
                messages.push({ body: prefix + j });
              }
              await env.QUEUE.sendBatch(messages);
            } else {
              return new Response(null, { status: 404 });
            }
            return new Response(null, { status: 204 });
          },

          async queue(batch, env) {
            await env.REPORTER.fetch("http://localhost", {
              method: "POST",
              body: JSON.stringify(batch.messages.map((m) => m.body)),
            });
            // Retry "wedge" messages once, so the broker must schedule a
            // delayed retry per message; canary and redelivered messages are
            // acked instead
            if (
              batch.messages[0].body.startsWith("wedge-") &&
              batch.messages[0].attempts < 2
            ) {
              batch.retryAll({ delaySeconds: ${RETRY_DELAY_SECONDS} });
            }
          },
        };`),
						},
					},
				],
			});
			useDispose(mf);
			await mf.ready;

			const countBodies = (prefix: string) =>
				deliveries.filter((body) => body.startsWith(prefix)).length;

			// Hold 9,990 of workerd's 10,000 active timeouts with delayed
			// messages. This exercises the same `#enqueue` timeout-per-message
			// path as delayed retries, without depending on dispatch speed.
			let res = await mf.dispatchFetch("http://localhost/storm");
			expect(res.status).toBe(204);

			// Dispatch a single batch that retries all of its messages, so
			// scheduling the retries blows the remaining timeout quota inside
			// `#flush`. Before the fix, `#flush` aborted without clearing
			// `#pendingFlush`, permanently wedging the queue.
			res = await mf.dispatchFetch("http://localhost/send?prefix=wedge-");
			expect(res.status).toBe(204);
			await vi.waitFor(
				async () => {
					expect(countBodies("wedge-")).toBe(BATCH_COUNT);
				},
				{ timeout: 30_000, interval: 500 }
			);

			// The queue must keep dispatching after the quota error: the
			// canary batch is undelayed and untried, so nothing holds it back.
			// Once wedged, it was never delivered at all.
			res = await mf.dispatchFetch("http://localhost/send?prefix=canary-");
			expect(res.status).toBe(204);
			await vi.waitFor(
				async () => {
					expect(countBodies("canary-")).toBe(BATCH_COUNT);
				},
				{ timeout: 20_000, interval: 500 }
			);

			// The retried wedge messages should also be redelivered once
			// their retry delay passes, then acked.
			await vi.waitFor(
				async () => {
					expect(countBodies("wedge-")).toBe(2 * BATCH_COUNT);
				},
				{ timeout: 20_000, interval: 500 }
			);

			const counts = new Map<string, number>();
			for (const body of deliveries) {
				counts.set(body, (counts.get(body) ?? 0) + 1);
			}
			for (let i = 0; i < BATCH_COUNT; i++) {
				expect(counts.get(`wedge-${i}`)).toBe(2);
				expect(counts.get(`canary-${i}`)).toBe(1);
			}
			// The delayed storm messages stay delayed for the whole test
			expect(countBodies("s-")).toBe(0);
		},
		120_000
	);
});
