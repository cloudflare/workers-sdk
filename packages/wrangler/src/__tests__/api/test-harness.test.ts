import assert from "node:assert";
import { setImmediate } from "node:timers/promises";
import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { describe, it, vi } from "vitest";
import { ProxyController } from "../../api/startDevWorker/ProxyController";
import { createDeferred } from "../../api/startDevWorker/utils";
import { createTestHarness } from "../../api/test-harness";

describe("createTestHarness", () => {
	runInTempDir();

	it("waits for the proxy play request before resolving listen and reset", async ({
		expect,
	}) => {
		await seed({
			"src/index.ts": 'export default { fetch: () => new Response("ok") };',
		});

		function createPlayGate() {
			return {
				started: createDeferred<void>(),
				release: createDeferred<void>(),
				finished: false,
			};
		}

		let play = createPlayGate();
		const onReloadComplete = ProxyController.prototype.onReloadComplete;
		const spy = vi
			.spyOn(ProxyController.prototype, "onReloadComplete")
			.mockImplementation(function (this: ProxyController, event) {
				const proxyWorker = this.proxyWorker;
				assert(proxyWorker);
				const dispatchFetch = proxyWorker.dispatchFetch;
				proxyWorker.dispatchFetch = async (...args) => {
					if (String(args[0]).endsWith("/ProxyWorker/play")) {
						const currentPlay = play;
						currentPlay.started.resolve();
						await currentPlay.release.promise;
						const response = await dispatchFetch(...args);
						currentPlay.finished = true;
						return response;
					}
					return dispatchFetch(...args);
				};
				onReloadComplete.call(this, event);
			});
		const server = createTestHarness({
			workers: [
				{
					config: {
						main: "src/index.ts",
						compatibility_date: "2026-09-26",
					},
				},
			],
		});

		try {
			async function expectWaitsForPlay(operation: Promise<unknown>) {
				await play.started.promise;
				const settled = vi.fn();
				void operation.then(settled, settled);
				await setImmediate();
				expect(settled).not.toHaveBeenCalled();

				play.release.resolve();
				await operation;
				expect(play.finished).toBe(true);
			}

			await expectWaitsForPlay(server.listen());
			play = createPlayGate();
			await expectWaitsForPlay(server.reset());
			const response = await server.fetch("/");
			await expect(response.text()).resolves.toBe("ok");
		} finally {
			play.release.resolve();
			spy.mockRestore();
			await server.close();
		}
	});
});
