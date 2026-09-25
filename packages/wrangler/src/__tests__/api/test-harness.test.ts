import { writeFileSync } from "node:fs";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { fetch } from "undici";
import { describe, it, vi } from "vitest";
import { ProxyController } from "../../api/startDevWorker/ProxyController";
import { createTestHarness } from "../../api/test-harness";
import { waitForBunProxyMessages } from "../../api/test-harness-runtime";
import { mockConsoleMethods } from "../helpers/mock-console";
import type { Miniflare } from "miniflare";

const BUN_PROXY_ERROR =
	"`server.fetch()` cannot reach the Worker because Bun does not support the custom `fetch()` dispatcher required to deliver Miniflare's proxy control request. Use `server.getWorker().fetch()`, which dispatches to the Worker directly, or run your tests using Node.js.";

const { isBunMock } = vi.hoisted(() => ({ isBunMock: vi.fn(() => false) }));
vi.mock("../../utils/is-bun", () => ({ isBun: isBunMock }));

describe("createTestHarness under Bun", () => {
	mockConsoleMethods();
	runInTempDir();

	it("keeps listen() and getWorker() working and fails both proxy doors loudly", async ({
		expect,
		onTestFinished,
	}) => {
		// Simulates Bun under Node with the two things Bun changes: `isBun()`
		// reports true, and Miniflare's control requests to the ProxyWorker lose
		// the `cf` payload, because Bun's `fetch()` ignores the undici dispatcher
		// that attaches it (https://github.com/cloudflare/workers-sdk/issues/15717).
		isBunMock.mockReturnValue(true);
		onTestFinished(() => {
			isBunMock.mockReturnValue(false);
		});
		// `dispatchFetch` is an instance field, so wrap it on the ProxyWorker's
		// Miniflare right after the ProxyController creates it.
		const proxyControllerPrototype = ProxyController.prototype as unknown as {
			createProxyWorker(this: ProxyController): void;
		};
		const createProxyWorker = proxyControllerPrototype.createProxyWorker;
		const createProxyWorkerSpy = vi
			.spyOn(proxyControllerPrototype, "createProxyWorker")
			.mockImplementation(function (this: ProxyController) {
				createProxyWorker.call(this);
				const { proxyWorker } = this;
				if (proxyWorker === undefined || droppedCf.has(proxyWorker)) {
					return;
				}
				droppedCf.add(proxyWorker);
				const dispatchFetch = proxyWorker.dispatchFetch;
				proxyWorker.dispatchFetch = (input, init) => {
					if (String(input).includes("/cdn-cgi/ProxyWorker/") && init) {
						const withoutCf = { ...init };
						delete withoutCf.cf;
						return dispatchFetch(input, withoutCf);
					}
					return dispatchFetch(input, init);
				};
			});
		onTestFinished(() => createProxyWorkerSpy.mockRestore());
		const droppedCf = new WeakSet<Miniflare>();

		writeFileSync(
			"worker.js",
			`export default { fetch: () => new Response("ok") };`
		);
		writeFileSync(
			"wrangler.jsonc",
			JSON.stringify({
				name: "harness-under-bun",
				main: "worker.js",
				compatibility_date: "2026-05-20",
			})
		);

		const server = createTestHarness({
			workers: [{ configPath: "./wrangler.jsonc" }],
		});
		onTestFinished(() => server.close());

		const { url } = await server.listen();

		const direct = await server.getWorker().fetch("/");
		expect(direct.status).toBe(200);
		expect(await direct.text()).toBe("ok");

		await expect(server.fetch("/")).rejects.toMatchObject({
			message: BUN_PROXY_ERROR,
			telemetryMessage: "test harness bun proxy request failed",
		});

		const viaUrl = await fetch(url);
		expect(viaUrl.status).toBe(503);
		expect(await viaUrl.text()).toContain(
			"https://github.com/oven-sh/bun/issues/39247"
		);
	});
});

describe("waitForBunProxyMessages", () => {
	it("allows Bun when proxy messages are delivered", async ({ expect }) => {
		await expect(
			waitForBunProxyMessages(() => Promise.resolve(true), 1)
		).resolves.toBeUndefined();
	});

	it("throws a UserError when Bun fails to deliver proxy messages", async ({
		expect,
	}) => {
		await expect(
			waitForBunProxyMessages(() => Promise.resolve(false), 1)
		).rejects.toMatchObject({
			message: BUN_PROXY_ERROR,
			telemetryMessage: "test harness bun proxy request failed",
		});
	});

	it("throws a UserError when Bun does not deliver proxy messages", async ({
		expect,
	}) => {
		vi.useFakeTimers();

		try {
			const rejection = expect(
				waitForBunProxyMessages(() => new Promise<boolean>(() => {}), 100)
			).rejects.toMatchObject({
				message: BUN_PROXY_ERROR,
				telemetryMessage: "test harness bun proxy request failed",
			});

			await vi.advanceTimersByTimeAsync(100);
			await rejection;
		} finally {
			vi.useRealTimers();
		}
	});
});
