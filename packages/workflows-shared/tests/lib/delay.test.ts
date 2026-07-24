import { describe, it, vi } from "vitest";
import {
	DEFAULT_RETRY_DELAY_MS,
	invokeDelayFunction,
	schedulerWait,
} from "../../src/lib/delay";
import { DelayFunctionError } from "../../src/lib/retries";
import type { WorkflowDynamicDelayContext } from "cloudflare:workers";

const input: WorkflowDynamicDelayContext = {
	ctx: {
		step: { name: "step", count: 1 },
		attempt: 1,
		config: { retries: { limit: 5, backoff: "constant" }, timeout: 0 },
	},
	error: new Error("boom"),
};

const makeLogger = () => ({ warn: vi.fn(), debug: vi.fn() });

const noTimeout =
	(): ((ms: number, opts?: { signal?: AbortSignal }) => Promise<void>) => () =>
		new Promise<void>(() => {});

describe("schedulerWait", () => {
	it("removes abort listeners after the wait completes", async ({ expect }) => {
		const listeners = new Set<EventListenerOrEventListenerObject>();
		const signal = {
			aborted: false,
			addEventListener(
				type: string,
				listener: EventListenerOrEventListenerObject
			) {
				if (type === "abort") {
					listeners.add(listener);
				}
			},
			removeEventListener(
				type: string,
				listener: EventListenerOrEventListenerObject
			) {
				if (type === "abort") {
					listeners.delete(listener);
				}
			},
		} as AbortSignal;

		for (let i = 0; i < 100; i++) {
			await schedulerWait(0, { signal });
		}

		expect(listeners).toHaveLength(0);
	});
});

describe("invokeDelayFunction", () => {
	it("returns the value a synchronous delay function produces", async ({
		expect,
	}) => {
		const logger = makeLogger();
		const result = await invokeDelayFunction(() => 1234, input, {
			timeoutMs: 5000,
			wait: noTimeout(),
			logger,
		});
		expect(result).toBe(1234);
		expect(logger.warn).not.toHaveBeenCalled();
		expect(logger.debug).not.toHaveBeenCalled();
	});

	it("awaits an asynchronous delay function", async ({ expect }) => {
		const logger = makeLogger();
		const result = await invokeDelayFunction(async () => 1234, input, {
			timeoutMs: 5000,
			wait: noTimeout(),
			logger,
		});
		expect(result).toBe(1234);
		expect(logger.warn).not.toHaveBeenCalled();
		expect(logger.debug).not.toHaveBeenCalled();
	});

	it("throws when the delay function never resolves (timeout)", async ({
		expect,
	}) => {
		const logger = makeLogger();
		const promise = invokeDelayFunction(
			() => new Promise<number>(() => {}),
			input,
			{
				timeoutMs: 5000,
				wait: () => Promise.resolve(),
				logger,
			}
		);
		await expect(promise).rejects.toThrow(
			new DelayFunctionError("did not return within 5 seconds")
		);
		expect(logger.warn).toHaveBeenCalledTimes(1);
		expect(logger.warn).toHaveBeenCalledWith(
			expect.stringContaining("did not resolve"),
			{ step: "step", attempt: 1 }
		);
		expect(logger.debug).not.toHaveBeenCalled();
	});

	it("throws when the delay function throws synchronously", async ({
		expect,
	}) => {
		const logger = makeLogger();
		const promise = invokeDelayFunction(
			() => {
				throw new Error("sync boom");
			},
			input,
			{
				timeoutMs: 5000,
				wait: noTimeout(),
				logger,
			}
		);
		await expect(promise).rejects.toThrow(
			new DelayFunctionError("threw an error: sync boom")
		);
		expect(logger.warn).toHaveBeenCalledWith(
			expect.stringContaining("threw"),
			expect.objectContaining({ error: "sync boom" })
		);
	});

	it("throws when the delay function rejects", async ({ expect }) => {
		const logger = makeLogger();
		const promise = invokeDelayFunction(
			async () => {
				throw new Error("async boom");
			},
			input,
			{
				timeoutMs: 5000,
				wait: noTimeout(),
				logger,
			}
		);
		await expect(promise).rejects.toThrow(
			new DelayFunctionError("threw an error: async boom")
		);
		expect(logger.warn).toHaveBeenCalledWith(
			expect.stringContaining("threw"),
			expect.objectContaining({ error: "async boom" })
		);
	});

	it("logs a debug (not a warn) when the provided signal aborts before the function resolves", async ({
		expect,
	}) => {
		const logger = makeLogger();
		const abort = new AbortController();
		const promise = invokeDelayFunction(
			() => new Promise<number>(() => {}),
			input,
			{
				timeoutMs: 5000,
				wait: (_ms, opts) =>
					new Promise<void>((resolve) => {
						opts?.signal?.addEventListener("abort", () => resolve(), {
							once: true,
						});
					}),
				signal: abort.signal,
				logger,
			}
		);
		abort.abort();
		await expect(promise).resolves.toBe(DEFAULT_RETRY_DELAY_MS);
		expect(logger.debug).toHaveBeenCalledTimes(1);
		expect(logger.debug).toHaveBeenCalledWith(
			expect.stringContaining("engine shutdown"),
			{ step: "step", attempt: 1 }
		);
		expect(logger.warn).not.toHaveBeenCalled();
	});

	it("throws without a logger", async ({ expect }) => {
		const promise = invokeDelayFunction(
			() => {
				throw new Error("sync boom");
			},
			input,
			{
				timeoutMs: 5000,
				wait: noTimeout(),
			}
		);
		await expect(promise).rejects.toThrow(DelayFunctionError);
	});
});
