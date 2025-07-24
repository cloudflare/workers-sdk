import { join } from "node:path";
import { fetch } from "undici";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { formatCompatibilityDate } from "../../src/utils/compatibility-date";
import { WranglerE2ETestHelper } from "../helpers/e2e-wrangler-test";
import { generateResourceName } from "../helpers/generate-resource-name";
import { retry } from "../helpers/retry";
import { TESTS } from "./worker/index";
import type { WranglerLongLivedCommand } from "../helpers/wrangler";

describe(`@cloudflare/unenv-preset tests`, () => {
	let helper: WranglerE2ETestHelper;

	beforeAll(async () => {
		helper = new WranglerE2ETestHelper();
		await helper.seed({
			"wrangler.jsonc": JSON.stringify({
				name: generateResourceName(),
				main: join(__dirname, "/worker/index.ts"),
				compatibility_date: formatCompatibilityDate(new Date()),
				compatibility_flags: ["nodejs_compat"],
				vars: {
					DEBUG: "example",
				},
			}),
		});
	});

	// Run the tests on:
	// - the "local" runtime installed in miniflare
	// - the "remote" runtime available in Cloudflare prod
	//
	// The "local" and "remote" runtimes do not necessarily use the exact same version
	// of workerd and we want to make sure the preset works for both.
	describe.for(["local", "remote"])("%s tests", (localOrRemote) => {
		let url: string;
		let wrangler: WranglerLongLivedCommand;
		beforeAll(async () => {
			wrangler = helper.runLongLived(`wrangler dev --${localOrRemote}`, {
				stopOnTestFinished: false,
			});
			url = (await wrangler.waitForReady()).url;

			// Wait for the Worker to be actually responding.
			const response = await retry(
				(resp) => !resp.ok,
				async () => await fetch(`${url}/ping`)
			);
			await expect(response.text()).resolves.toEqual("pong");
		});

		afterAll(async () => {
			await wrangler.stop();
		});

		test.for(Object.keys(TESTS))(
			"%s",
			{ timeout: 20_000 },
			async (testName) => {
				// Retries the callback until it succeeds or times out.
				// Useful for the i.e. DNS tests where underlying requests might error/timeout.
				await vi.waitFor(async () => {
					const response = await fetch(`${url}/${testName}`);
					const body = await response.text();
					expect(body).toMatch("OK!");
				});
			}
		);
	});
});
