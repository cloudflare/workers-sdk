import {
	OBSERVABILITY_COLLECTOR_SERVICE_NAME,
	OBSERVABILITY_D1_BINDING,
	OBSERVABILITY_D1_ID,
} from "@cloudflare/workers-utils";
import { describe, test } from "vitest";
import { applyLocalObservability } from "../miniflare-options";
import type { WorkerOptions } from "miniflare";

// The Vite plugin mirrors `wrangler dev`'s experimental local-observability
// wiring: when enabled, each user worker streams its tail to the internal
// collector and gains the internal WOBS_TRACES D1 + compat flags.

function userWorker(overrides: Partial<WorkerOptions> = {}): WorkerOptions {
	return {
		name: "user",
		modules: true,
		script: "export default { fetch() { return new Response('ok'); } }",
		...overrides,
	} as WorkerOptions;
}

describe("applyLocalObservability", () => {
	test("returns workers unchanged when disabled", ({ expect }) => {
		const workers = [userWorker()];
		const result = applyLocalObservability(workers, false);
		expect(result).toBe(workers);
	});

	test("adds collector streamingTail, internal D1, and compat flags when enabled", ({
		expect,
	}) => {
		const [worker] = applyLocalObservability([userWorker()], true);
		expect(worker?.streamingTails).toContainEqual({
			name: OBSERVABILITY_COLLECTOR_SERVICE_NAME,
		});
		expect(worker?.d1Databases).toMatchObject({
			[OBSERVABILITY_D1_BINDING]: { id: OBSERVABILITY_D1_ID },
		});
		expect(worker?.compatibilityFlags).toContain("streaming_tail_worker");
		expect(worker?.compatibilityFlags).toContain("tail_worker_user_spans");
	});

	test("preserves existing streamingTails, d1Databases, and flags", ({
		expect,
	}) => {
		const [worker] = applyLocalObservability(
			[
				userWorker({
					compatibilityFlags: ["nodejs_compat"],
					streamingTails: [{ name: "my-tail" }],
					d1Databases: { MY_DB: { id: "my-db" } },
				}),
			],
			true
		);
		expect(worker?.compatibilityFlags).toContain("nodejs_compat");
		expect(worker?.streamingTails).toContainEqual({ name: "my-tail" });
		expect(worker?.streamingTails).toContainEqual({
			name: OBSERVABILITY_COLLECTOR_SERVICE_NAME,
		});
		expect(worker?.d1Databases).toMatchObject({
			MY_DB: { id: "my-db" },
			[OBSERVABILITY_D1_BINDING]: { id: OBSERVABILITY_D1_ID },
		});
	});

	test("transforms every user worker", ({ expect }) => {
		const result = applyLocalObservability(
			[userWorker({ name: "a" }), userWorker({ name: "b" })],
			true
		);
		for (const worker of result) {
			expect(worker.streamingTails).toContainEqual({
				name: OBSERVABILITY_COLLECTOR_SERVICE_NAME,
			});
		}
	});

	test("does not mutate the input workers", ({ expect }) => {
		const worker = userWorker();
		applyLocalObservability([worker], true);
		expect(worker.streamingTails).toBeUndefined();
		expect(worker.d1Databases).toBeUndefined();
	});
});
