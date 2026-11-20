import { setImmediate } from "node:timers/promises";
import { test } from "vitest";
import {
	parseTraceBatchCapacity,
	TRACE_BATCH_CAPACITY,
	TraceWriter,
	type BatchStore,
	type ClearableBatchStore,
} from "../../src/workers/observability/trace-writer";
import type {
	LogInput,
	SpanInput,
} from "../../src/workers/observability/trace-types";

interface StoreCall {
	spans: SpanInput[];
	logs: LogInput[];
	resolve: () => void;
	reject: (reason: unknown) => void;
}

interface ClearCall {
	resolve: () => void;
	reject: (reason: unknown) => void;
}

class DeferredStore implements BatchStore, ClearableBatchStore {
	readonly calls: StoreCall[] = [];
	readonly clearCalls: ClearCall[] = [];
	inFlight = 0;
	maxInFlight = 0;

	persist(spans: SpanInput[], logs: LogInput[]): Promise<void> {
		this.inFlight++;
		this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
		let resolvePromise!: () => void;
		let rejectPromise!: (reason: unknown) => void;
		const promise = new Promise<void>((resolve, reject) => {
			resolvePromise = resolve;
			rejectPromise = reject;
		});
		this.calls.push({
			spans,
			logs,
			resolve: () => {
				this.inFlight--;
				resolvePromise();
			},
			reject: (reason) => {
				this.inFlight--;
				rejectPromise(reason);
			},
		});
		return promise;
	}

	clear(): Promise<void> {
		let resolvePromise!: () => void;
		let rejectPromise!: (reason: unknown) => void;
		const promise = new Promise<void>((resolve, reject) => {
			resolvePromise = resolve;
			rejectPromise = reject;
		});
		this.clearCalls.push({ resolve: resolvePromise, reject: rejectPromise });
		return promise;
	}
}

test("detaches an immutable completed-span batch", async ({ expect }) => {
	const store = new DeferredStore();
	const writer = new TraceWriter(3);
	const owner = writer.createOwner(store);
	const root = span("root", 10, { phase: "closed", values: [1] });

	expect(writer.enqueueCompletedSpan(owner, root)).toBe(true);
	expect(writer.enqueueCompletedSpan(owner, span("child-1", 1))).toBe(true);
	expect(writer.enqueueCompletedSpan(owner, span("child-2", 1))).toBe(true);
	expect(store.calls).toHaveLength(1);
	expect(writer.enqueueCompletedSpan(owner, span("next-1", 1))).toBe(true);
	expect(writer.enqueueCompletedSpan(owner, span("next-2", 1))).toBe(true);
	expect(writer.enqueueCompletedSpan(owner, span("next-3", 1))).toBe(true);
	expect(writer.enqueueCompletedSpan(owner, span("overflow", 1))).toBe(false);

	root.attributes = { phase: "mutated", values: [1, 2] };
	expect(store.calls[0].spans[0]).toMatchObject({
		spanId: "root",
		durationMs: 10,
		attributes: { phase: "closed", values: [1] },
	});
	expect(store.maxInFlight).toBe(1);

	const drained = writer.drain(owner);
	store.calls[0].resolve();
	await setImmediate();
	expect(store.calls).toHaveLength(2);
	store.calls[1].resolve();
	await drained;
});

test("rejects open-span snapshots", ({ expect }) => {
	const writer = new TraceWriter();
	const owner = writer.createOwner(new DeferredStore());

	expect(() => writer.enqueueCompletedSpan(owner, span("open", null))).toThrow(
		"TraceWriter only accepts completed spans"
	);
});

test("uses a 20,480-row batch", ({ expect }) => {
	expect(TRACE_BATCH_CAPACITY).toBe(20_480);
});

test("parses batch capacity from the environment", ({ expect }) => {
	expect(parseTraceBatchCapacity(null)).toBe(20_480);
	expect(parseTraceBatchCapacity("4096")).toBe(4_096);
	for (const value of ["", "0", "-1", "1.5", "nope", "9007199254740992"]) {
		expect(() => parseTraceBatchCapacity(value)).toThrow(
			"X_LOCAL_OBSERVABILITY_BATCH_SIZE must be a positive safe integer"
		);
	}
});

test("shares one in-flight persist across invocation owners", async ({
	expect,
}) => {
	const store = new DeferredStore();
	const writer = new TraceWriter(2);
	const first = writer.createOwner(store);
	const second = writer.createOwner(store);

	writer.enqueueCompletedSpan(first, span("first", 1));
	writer.flush(first);
	writer.enqueueCompletedSpan(second, span("second", 1));
	expect(store.calls).toHaveLength(1);

	const firstDrained = writer.drain(first);
	const secondDrained = writer.drain(second);
	store.calls[0].resolve();
	await firstDrained;
	await setImmediate();
	expect(store.calls).toHaveLength(2);
	expect(store.maxInFlight).toBe(1);

	store.calls[1].resolve();
	await secondDrained;
});

test("accepts another active batch while the full batch persists", async ({
	expect,
}) => {
	const store = new DeferredStore();
	const writer = new TraceWriter(2);
	const owner = writer.createOwner(store);

	for (let i = 0; i < 2; i++) {
		expect(writer.enqueueCompletedSpan(owner, span(`span-${i}`, 1))).toBe(true);
	}
	for (let i = 2; i < 4; i++) {
		expect(writer.enqueueCompletedSpan(owner, span(`span-${i}`, 1))).toBe(true);
	}
	expect(writer.enqueueCompletedSpan(owner, span("overflow", 1))).toBe(false);
	expect(store.calls).toHaveLength(1);
	expect(store.calls[0].spans).toHaveLength(2);

	const drained = writer.drain(owner);
	store.calls[0].resolve();
	await setImmediate();
	expect(store.calls).toHaveLength(2);
	expect(store.calls[1].spans).toHaveLength(2);
	store.calls[1].resolve();
	await drained;
});

test("waits for room instead of dropping spans that arrive at once", async ({
	expect,
}) => {
	const store = new DeferredStore();
	// One row per batch: the first span starts a save, the second fills the
	// active batch, and the third used to be dropped.
	const writer = new TraceWriter(1);
	const owner = writer.createOwner(store);

	const ingested = writer
		.enqueueCompletedSpans(owner, [span("a", 1), span("b", 1), span("c", 1)])
		.then(() => writer.drain(owner));
	for (let i = 0; i < 3; i++) {
		await setImmediate();
		expect(store.calls).toHaveLength(i + 1);
		store.calls[i].resolve();
	}
	await ingested;

	expect(
		store.calls.flatMap((call) => call.spans.map((row) => row.spanId))
	).toEqual(["a", "b", "c"]);
	expect(store.maxInFlight).toBe(1);
});

test("waits for room when another owner filled the writer", async ({
	expect,
}) => {
	const store = new DeferredStore();
	const writer = new TraceWriter(1);
	const tail = writer.createOwner(store);
	const otlp = writer.createOwner(store);

	// Another invocation fills both batches before this export queues anything,
	// so there are none of its own rows to wait for.
	expect(writer.enqueueCompletedSpan(tail, span("tail-1", 1))).toBe(true);
	expect(writer.enqueueCompletedSpan(tail, span("tail-2", 1))).toBe(true);
	const tailDrained = writer.drain(tail);
	const otlpDrained = writer
		.enqueueCompletedSpans(otlp, [span("otlp", 1)])
		.then(() => writer.drain(otlp));
	for (let i = 0; i < 3; i++) {
		await setImmediate();
		expect(store.calls).toHaveLength(i + 1);
		store.calls[i].resolve();
	}
	await Promise.all([tailDrained, otlpDrained]);

	expect(
		store.calls.flatMap((call) => call.spans.map((row) => row.spanId))
	).toEqual(["tail-1", "tail-2", "otlp"]);
});

test("waits for room freed by a clear", async ({ expect }) => {
	const store = new DeferredStore();
	const writer = new TraceWriter(1);
	const tail = writer.createOwner(store);
	const otlp = writer.createOwner(store);

	expect(writer.enqueueCompletedSpan(tail, span("tail-1", 1))).toBe(true);
	expect(writer.enqueueCompletedSpan(tail, span("tail-2", 1))).toBe(true);
	let accepted = false;
	const queued = writer
		.enqueueCompletedSpans(otlp, [span("otlp", 1)])
		.then(() => {
			accepted = true;
		});
	await setImmediate();
	expect(accepted).toBe(false);

	// The clear takes the full batch, so the waiting span fits at once.
	const cleared = writer.clear(store);
	await queued;
	const drained = Promise.all([writer.drain(tail), writer.drain(otlp)]);
	store.calls[0].resolve();
	await setImmediate();
	store.calls[1].resolve();
	await setImmediate();
	store.clearCalls[0].resolve();
	await cleared;
	await setImmediate();
	expect(store.calls).toHaveLength(3);
	store.calls[2].resolve();
	await drained;

	expect(
		store.calls.map((call) => call.spans.map((row) => row.spanId))
	).toEqual([["tail-1"], ["tail-2"], ["otlp"]]);
});

test("continues draining after a failed persist and rejects the owner fence", async ({
	expect,
}) => {
	const store = new DeferredStore();
	const writer = new TraceWriter(2);
	const owner = writer.createOwner(store);

	writer.enqueueCompletedSpan(owner, span("root", 1));
	writer.flush(owner);
	writer.enqueueCompletedSpan(owner, span("child", 1));
	const drained = writer.drain(owner);

	store.calls[0].reject(new Error("persist failed"));
	await setImmediate();
	expect(store.calls).toHaveLength(2);
	store.calls[1].resolve();
	await expect(drained).rejects.toThrow("persist failed");
});

test("accepts active logs while a detached batch persists", async ({
	expect,
}) => {
	const store = new DeferredStore();
	const writer = new TraceWriter(2);
	const owner = writer.createOwner(store);
	const log = (message: string): LogInput => ({
		traceId: "trace",
		spanId: null,
		tsMs: 1,
		level: "info",
		message,
		operation: null,
	});

	expect(writer.enqueueLog(owner, log("in-flight"))).toBe(true);
	expect(writer.enqueueLog(owner, log("active-1"))).toBe(true);
	expect(writer.enqueueLog(owner, log("active-2"))).toBe(true);
	expect(writer.enqueueLog(owner, log("overflow"))).toBe(false);
	expect(store.calls).toHaveLength(1);

	store.calls[0].resolve();
	await setImmediate();
	expect(store.calls).toHaveLength(2);
	expect(store.calls[1].logs).toHaveLength(2);
	const drained = writer.drain(owner);
	store.calls[1].resolve();
	await drained;
});

test("clears old batches before persisting rows accepted during clear", async ({
	expect,
}) => {
	const store = new DeferredStore();
	const writer = new TraceWriter(3);
	const owner = writer.createOwner(store);
	const log = (message: string): LogInput => ({
		traceId: "trace",
		spanId: null,
		tsMs: 1,
		level: "info",
		message,
		operation: null,
	});

	writer.enqueueLog(owner, log("in-flight before clear"));
	writer.enqueueLog(owner, log("queued before clear"));
	const clearing = writer.clear(store);
	writer.enqueueLog(owner, log("accepted during clear"));
	const drained = writer.drain(owner);
	let drainSettled = false;
	void drained.then(() => {
		drainSettled = true;
	});

	expect(store.calls).toHaveLength(1);
	expect(store.clearCalls).toHaveLength(0);

	store.calls[0].resolve();
	await setImmediate();
	expect(store.calls).toHaveLength(2);
	expect(store.calls[1].logs).toEqual([
		expect.objectContaining({ message: "queued before clear" }),
	]);
	expect(store.clearCalls).toHaveLength(0);

	store.calls[1].resolve();
	await setImmediate();
	expect(store.clearCalls).toHaveLength(1);
	expect(store.calls).toHaveLength(2);

	store.clearCalls[0].resolve();
	await clearing;
	await setImmediate();
	expect(store.calls).toHaveLength(3);
	expect(store.calls[2].logs).toEqual([
		expect.objectContaining({ message: "accepted during clear" }),
	]);
	expect(drainSettled).toBe(false);

	store.calls[2].resolve();
	await drained;
	expect(drainSettled).toBe(true);
});

test("serialises concurrent clears", async ({ expect }) => {
	const store = new DeferredStore();
	const writer = new TraceWriter();
	const owner = writer.createOwner(store);
	const log = (message: string): LogInput => ({
		traceId: "trace",
		spanId: null,
		tsMs: 1,
		level: "info",
		message,
		operation: null,
	});

	const first = writer.clear(store);
	writer.enqueueLog(owner, log("before second clear"));
	const second = writer.clear(store);
	writer.enqueueLog(owner, log("after second clear"));
	const drained = writer.drain(owner);
	expect(store.clearCalls).toHaveLength(1);

	store.clearCalls[0].resolve();
	await first;
	await setImmediate();
	expect(store.calls).toHaveLength(1);
	expect(store.calls[0].logs).toEqual([
		expect.objectContaining({ message: "before second clear" }),
	]);
	expect(store.clearCalls).toHaveLength(1);

	store.calls[0].resolve();
	await setImmediate();
	expect(store.clearCalls).toHaveLength(2);
	expect(store.calls).toHaveLength(1);

	store.clearCalls[1].resolve();
	await second;
	await setImmediate();
	expect(store.calls).toHaveLength(2);
	expect(store.calls[1].logs).toEqual([
		expect.objectContaining({ message: "after second clear" }),
	]);

	store.calls[1].resolve();
	await drained;
});

function span(
	spanId: string,
	durationMs: number | null,
	attributes: Record<string, unknown> | null = null
): SpanInput {
	return {
		traceId: "trace",
		spanId,
		parentId: spanId === "root" ? null : "root",
		service: "worker",
		name: spanId,
		kind: "span",
		startMs: 1,
		durationMs,
		outcome: durationMs === null ? null : "ok",
		error: null,
		attributes,
	};
}
