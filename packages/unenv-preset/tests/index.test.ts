import path from "node:path";
import { platform } from "node:process";
import { fetch } from "undici";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import workerdPath from "workerd";
import { runWranglerDev } from "../../../fixtures/shared/src/run-wrangler-long-lived";
import { TESTS } from "./worker/index";

describe(`@cloudflare/unenv-preset ${platform} ${workerdPath}`, () => {
	let wrangler: Awaited<ReturnType<typeof runWranglerDev>> | undefined;

	beforeAll(async () => {
		// Use workerd binary install in `@cloudflare/unenv-preset`
		// rather than the one bundled with wrangler.
		const MINIFLARE_WORKERD_PATH = workerdPath;

		wrangler = await runWranglerDev(
			path.join(__dirname, "worker"),
			["--port=0", "--inspector-port=0"],
			{
				MINIFLARE_WORKERD_PATH,
			}
		);
	});

	afterAll(async () => {
		await wrangler?.stop();
		wrangler = undefined;
	});

	test.for(Object.keys(TESTS))("%s", async (testName) => {
		expect(wrangler).toBeDefined();
		const { ip, port, getOutput } = wrangler!;
		try {
			await vi.waitFor(async () => {
				const response = await fetch(`http://${ip}:${port}/${testName}`);
				const body = await response.text();
				expect(body).toMatch("OK!");
			});
		} catch (e) {
			// Log the output before re-throwing the error
			console.log("OUTPUT", await getOutput());
			throw e;
		}
	});
});
