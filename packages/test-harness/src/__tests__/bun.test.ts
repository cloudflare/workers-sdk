import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { describe, it, vi } from "vitest";
import { createTestHarness } from "../index";
import { BUN_UNSUPPORTED_MESSAGE } from "../is-bun";

const { isBunMock } = vi.hoisted(() => ({ isBunMock: vi.fn(() => false) }));
vi.mock("../is-bun", async (importOriginal) => ({
	...(await importOriginal<typeof import("../is-bun")>()),
	isBun: isBunMock,
}));

describe("createTestHarness under Bun", () => {
	runInTempDir();

	it("keeps getEnv() working and fails every dispatch with the Bun error", async ({
		expect,
		onTestFinished,
	}) => {
		isBunMock.mockReturnValue(true);
		onTestFinished(() => {
			isBunMock.mockReturnValue(false);
		});

		const workerDir = ".cloudflare/output/v0/workers/default";
		await seed({
			".cloudflare/output/v0/config.json": JSON.stringify({
				buildContext: { isPreview: false },
			}),
			[`${workerDir}/worker.config.json`]: JSON.stringify({
				name: "harness-under-bun",
				compatibilityDate: "2026-05-20",
				env: { PROBE: { type: "text", value: "yes" } },
				manifest: { type: "partial", mainModule: "worker.js", modules: {} },
			}),
			[`${workerDir}/bundle/worker.js`]: `export default { fetch: () => new Response("ok") };`,
		});

		const server = createTestHarness({
			workers: [{ buildOutput: "." }],
		});
		onTestFinished(() => server.close());

		await server.listen();

		const env = await server.getWorker<{ PROBE: string }>().getEnv();
		expect(env.PROBE).toBe("yes");

		const refused = {
			message: expect.stringContaining(BUN_UNSUPPORTED_MESSAGE),
			telemetryMessage: "test harness dispatch under bun",
		};
		await expect(server.fetch("/")).rejects.toMatchObject(refused);
		await expect(server.getWorker().fetch("/")).rejects.toMatchObject(refused);
		await expect(
			server.getWorker().scheduled({ cron: "* * * * *" })
		).rejects.toMatchObject(refused);
	});
});
