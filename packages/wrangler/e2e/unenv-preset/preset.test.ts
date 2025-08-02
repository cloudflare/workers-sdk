import { join } from "node:path";
import { fetch } from "undici";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { CLOUDFLARE_ACCOUNT_ID } from "../helpers/account-id";
import { WranglerE2ETestHelper } from "../helpers/e2e-wrangler-test";
import { generateResourceName } from "../helpers/generate-resource-name";
import { retry } from "../helpers/retry";
import { TESTS } from "./worker/index";
import type { WranglerLongLivedCommand } from "../helpers/wrangler";

type TestConfig = {
	name: string;
	compatibilityDate: string;
	// "nodejs_compat" is included by default
	compatibilityFlags?: string[];
	// Assert runtime compatibility flag values
	expectRuntimeFlags?: {
		// Whether the http modules are enabled
		enable_nodejs_http_modules: boolean;
	};
};

const testConfigs: TestConfig[] = [
	{
		name: "Oldest supported compatibility date for nodejs_compat",
		compatibilityDate: "2024-09-23",
		expectRuntimeFlags: {
			enable_nodejs_http_modules: false,
		},
	},
	// http
	[
		{
			name: "http disabled by date",
			compatibilityDate: "2025-07-26",
			expectRuntimeFlags: {
				enable_nodejs_http_modules: false,
			},
		},
		{
			name: "http disabled by flag",
			// TODO: use a date when http is enabled by default (> 2025-08-15)
			compatibilityDate: "2025-07-26",
			compatibilityFlags: ["disable_nodejs_http_modules"],
			expectRuntimeFlags: {
				enable_nodejs_http_modules: false,
			},
		},
		// TODO: add a config when http is enabled by default (> 2025-08-15)
		{
			name: "http enabled by flag",
			compatibilityDate: "2025-07-26",
			compatibilityFlags: ["enable_nodejs_http_modules"],
			expectRuntimeFlags: {
				enable_nodejs_http_modules: true,
			},
		},
	],
].flat();

describe.each(testConfigs)(
	`Preset test: $name`,
	({ compatibilityDate, compatibilityFlags = [], expectRuntimeFlags = {} }) => {
		let helper: WranglerE2ETestHelper;

		beforeAll(async () => {
			helper = new WranglerE2ETestHelper();
			await helper.seed({
				"wrangler.jsonc": JSON.stringify({
					name: generateResourceName(),
					main: join(__dirname, "/worker/index.ts"),
					compatibility_date: compatibilityDate,
					compatibility_flags: ["nodejs_compat", ...compatibilityFlags],
					// Enable `enabled` logs for the `debug` package
					vars: {
						DEBUG: "enabled",
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
			// Skip the remote tests if the user is not logged in (e.g. a PR from a forked repo)
			if (localOrRemote === "remote" && !CLOUDFLARE_ACCOUNT_ID) {
				test.skip("Remote tests are not supported");
				return;
			}

			let url: string;
			let wrangler: WranglerLongLivedCommand;
			beforeAll(async () => {
				wrangler = helper.runLongLived(`wrangler dev --${localOrRemote}`, {
					stopOnTestFinished: false,
				});
				url = (await wrangler.waitForReady()).url;

				// Wait for the Worker to be actually responding.
				const readyResp = await retry(
					(resp) => !resp.ok,
					async () => await fetch(`${url}/ping`)
				);
				await expect(readyResp.text()).resolves.toEqual("pong");

				// Assert runtime flag values
				for await (const [flag, value] of Object.entries(expectRuntimeFlags)) {
					const flagResp = await fetch(`${url}/flag?name=${flag}`);
					expect(flagResp.ok).toEqual(true);
					await expect(flagResp.json()).resolves.toEqual(value);
				}
			}, 20_000);

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
						expect(body).toMatch("passed");
					});
				}
			);
		});
	}
);
