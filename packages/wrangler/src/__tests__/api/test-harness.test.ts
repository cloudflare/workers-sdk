import { setImmediate } from "node:timers/promises";
import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { describe, it, vi } from "vitest";
import { ProxyController } from "../../api/startDevWorker/ProxyController";
import { createDeferred } from "../../api/startDevWorker/utils";
import { createTestHarness } from "../../api/test-harness";

describe("createTestHarness", () => {
	runInTempDir();

	it("waits for the proxy reload message before resolving listen", async ({
		expect,
	}) => {
		await seed({
			"src/index.ts": 'export default { fetch: () => new Response("ok") };',
		});

		const playQueued = createDeferred<void>();
		const releasePlay = createDeferred<void>();
		const sendMessage = ProxyController.prototype.sendMessageToProxyWorker;
		const spy = vi
			.spyOn(ProxyController.prototype, "sendMessageToProxyWorker")
			.mockImplementation(function (this: ProxyController, message, retries) {
				if (message.type === "play") {
					return this.runtimeMessageMutex.runWith(async () => {
						playQueued.resolve();
						await releasePlay.promise;
					});
				}
				return sendMessage.call(this, message, retries);
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
			const listening = server.listen();
			await playQueued.promise;
			const settled = vi.fn();
			void listening.then(settled, settled);
			await setImmediate();
			expect(settled).not.toHaveBeenCalled();

			releasePlay.resolve();
			await listening;
			expect(settled).toHaveBeenCalledOnce();
		} finally {
			releasePlay.resolve();
			await server.close();
			spy.mockRestore();
		}
	});
});
