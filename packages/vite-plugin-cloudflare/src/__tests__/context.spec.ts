import { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { PluginContext } from "../context";
import type { SharedContext } from "../context";

describe("PluginContext", () => {
	describe("startOrUpdateMiniflare", () => {
		let sharedContext: SharedContext;
		let ctx: PluginContext;

		beforeEach(() => {
			sharedContext = {
				hasShownWorkerConfigWarnings: false,
				isRestartingDevServer: false,
			};
			ctx = new PluginContext(sharedContext);
		});

		afterEach(() => {
			vi.restoreAllMocks();
		});

		test("waits for miniflare.ready before returning when creating new instance", async () => {
			// Create a deferred promise that we control
			let resolveReady!: (url: URL) => void;
			const readyPromise = new Promise<URL>((resolve) => {
				resolveReady = resolve;
			});

			// Mock Miniflare's ready getter to return our controlled promise
			const readySpy = vi
				.spyOn(Miniflare.prototype, "ready", "get")
				.mockReturnValue(readyPromise);

			// Track when startOrUpdateMiniflare completes
			let methodCompleted = false;
			const methodPromise = ctx
				.startOrUpdateMiniflare({
					workers: [{ modules: true, script: "" }],
				})
				.then(() => {
					methodCompleted = true;
				});

			// Give the method time to run but not complete
			await new Promise((resolve) => setTimeout(resolve, 50));

			// Method should NOT have completed yet because ready hasn't resolved
			expect(methodCompleted).toBe(false);

			// Now resolve ready
			resolveReady(new URL("http://localhost:8787"));

			// Wait for method to complete
			await methodPromise;

			// Now it should be completed
			expect(methodCompleted).toBe(true);
			expect(readySpy).toHaveBeenCalled();
		});

		test("waits for miniflare.ready before returning when updating options", async () => {
			// First, create an initial Miniflare instance with a fast ready
			const initialReadyPromise = Promise.resolve(
				new URL("http://localhost:8787")
			);
			vi.spyOn(Miniflare.prototype, "ready", "get").mockReturnValue(
				initialReadyPromise
			);

			await ctx.startOrUpdateMiniflare({
				workers: [{ modules: true, script: "" }],
			});

			vi.restoreAllMocks();

			// Now set up a slow ready for the update
			let resolveReady!: (url: URL) => void;
			const slowReadyPromise = new Promise<URL>((resolve) => {
				resolveReady = resolve;
			});

			const readySpy = vi
				.spyOn(Miniflare.prototype, "ready", "get")
				.mockReturnValue(slowReadyPromise);

			// Mock setOptions to resolve immediately (simulating the options being applied)
			const setOptionsSpy = vi
				.spyOn(Miniflare.prototype, "setOptions")
				.mockResolvedValue(undefined);

			// Track when startOrUpdateMiniflare completes
			let methodCompleted = false;
			const methodPromise = ctx
				.startOrUpdateMiniflare({
					workers: [{ modules: true, script: "updated" }],
				})
				.then(() => {
					methodCompleted = true;
				});

			// Give the method time to run but not complete
			await new Promise((resolve) => setTimeout(resolve, 50));

			// setOptions should have been called
			expect(setOptionsSpy).toHaveBeenCalled();

			// Method should NOT have completed yet because ready hasn't resolved
			expect(methodCompleted).toBe(false);

			// Now resolve ready
			resolveReady(new URL("http://localhost:8787"));

			// Wait for method to complete
			await methodPromise;

			// Now it should be completed
			expect(methodCompleted).toBe(true);
			expect(readySpy).toHaveBeenCalled();
		});
	});
});
