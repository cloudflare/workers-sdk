import { writeFileSync } from "node:fs";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { fetch } from "undici";
import { describe, it, vi } from "vitest";
import { createTestHarness } from "../../api/test-harness";
import { BUN_UNSUPPORTED_MESSAGE } from "../../utils/is-bun";
import { mockConsoleMethods } from "../helpers/mock-console";

const { isBunMock } = vi.hoisted(() => ({ isBunMock: vi.fn(() => false) }));
vi.mock("../../utils/is-bun", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../utils/is-bun")>()),
	isBun: isBunMock,
}));

describe("createTestHarness under Bun", () => {
	mockConsoleMethods();
	runInTempDir();

	it("keeps getEnv() working and fails every dispatch with the Bun error", async ({
		expect,
		onTestFinished,
	}) => {
		isBunMock.mockReturnValue(true);
		onTestFinished(() => {
			isBunMock.mockReturnValue(false);
		});

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
				vars: { PROBE: "yes" },
			})
		);

		const server = createTestHarness({
			workers: [{ configPath: "./wrangler.jsonc" }],
		});
		onTestFinished(() => server.close());

		const { url } = await server.listen();

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

		const viaUrl = await fetch(url);
		expect(viaUrl.status).toBe(503);
		expect(await viaUrl.text()).toBe(BUN_UNSUPPORTED_MESSAGE);
	});
});
