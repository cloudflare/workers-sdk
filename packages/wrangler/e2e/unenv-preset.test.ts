/**
 * Test building and serving locally a worker in nodejs_compat mode.
 */
import path from "node:path";
import dedent from "ts-dedent";
import { fetch } from "undici";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { runCommand } from "./helpers/command";
import { getYMDDate } from "./helpers/date";
import { WranglerE2ETestHelper } from "./helpers/e2e-wrangler-test";
import { generateResourceName } from "./helpers/generate-resource-name";
import type { WranglerLongLivedCommand } from "./helpers/wrangler";

// Request paths for each of the tests to run.
// Keep this in sync with the tests in `packages/wrangler/e2e/seed-files/unenv-preset-workers/index.ts`.
const TESTS = [
	"testCryptoGetRandomValues",
	"testImplementsBuffer",
	"testNodeCompatModules",
	"testUtilImplements",
	"testPath",
	"testDns",
	"testTimers",
	"testNet",
	"testTls",
	"testDebug",
];

describe(`@cloudflare/unenv-preset`, () => {
	let helper: WranglerE2ETestHelper;

	beforeAll(async () => {
		helper = new WranglerE2ETestHelper();
		await helper.seed(
			path.resolve(__dirname, "../seed-files/unenv-preset-workers")
		);
		await helper.seed({
			"wrangler.jsonc": dedent`{
				"name": "${generateResourceName()}",
				"main": "./index.ts",
				"compatibility_date": "${getYMDDate()}",
				"compatibility_flags": ["nodejs_compat"],
				"vars": {
					"DEBUG": "example"
				}
			}`,
		});
		// Install the unenv-preset package locally so that we can import `@cloudflare/unenv-preset/npm/debug` in the Worker.
		await runCommand(
			"pnpm add file://" + path.resolve(__dirname, "../../../unenv-preset"),
			{ cwd: helper.tmpPath }
		);
	});

	describe.for(["local", "remote"])("%s tests", (localOrRemote) => {
		let url: string;
		let wrangler: WranglerLongLivedCommand;
		beforeAll(async () => {
			wrangler = helper.runLongLived(`wrangler dev --${localOrRemote}`, {
				stopOnTestFinished: false,
			});
			url = (await wrangler.waitForReady()).url;
		});

		afterAll(async () => {
			await wrangler.stop();
		});

		test.for(TESTS)("%s", { timeout: 20_000 }, async (testName) => {
			// Retries the callback until it succeeds or times out.
			// Useful for the i.e. DNS tests where underlying requests might error/timeout.
			await vi.waitFor(
				async () => {
					const response = await fetch(`${url}/${testName}`);
					const body = await response.text();
					expect(body).toMatch("OK!");
				},
				{ timeout: 5_000 }
			);
		});
	});
});
