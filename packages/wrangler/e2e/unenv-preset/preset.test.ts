import { join } from "node:path";
import { fetch } from "undici";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { CLOUDFLARE_ACCOUNT_ID } from "../helpers/account-id";
import { WranglerE2ETestHelper } from "../helpers/e2e-wrangler-test";
import { generateResourceName } from "../helpers/generate-resource-name";
import { retry } from "../helpers/retry";
import { WorkerdTests } from "./worker/index";

type TestConfig = {
	name: string;
	compatibilityDate: string;
	// "nodejs_compat" is included by default
	compatibilityFlags?: string[];
	// Assert runtime compatibility flag values
	expectRuntimeFlags?: Record<string, boolean>;
};

// List of tests configs to run locally.
// Remote tests are much slower, so we only run 2 tests:
// - one with no `enable_...` flags
// - one with all the `enable_...` flags
const localTestConfigs: TestConfig[] = [
	{
		name: "Oldest supported compatibility date for nodejs_compat",
		compatibilityDate: "2024-09-23",
		expectRuntimeFlags: {
			enable_nodejs_http_modules: false,
		},
	},
	// http client only modules (no server)
	[
		{
			name: "http disabled by date",
			compatibilityDate: "2024-09-23",
			expectRuntimeFlags: {
				enable_nodejs_http_modules: false,
			},
		},
		{
			name: "http disabled by flag",
			compatibilityDate: "2025-08-15",
			compatibilityFlags: ["disable_nodejs_http_modules"],
			expectRuntimeFlags: {
				enable_nodejs_http_modules: false,
			},
		},
		{
			name: "http enabled by flag",
			compatibilityDate: "2024-09-23",
			compatibilityFlags: ["enable_nodejs_http_modules"],
			expectRuntimeFlags: {
				enable_nodejs_http_modules: true,
			},
		},
		{
			name: "http enabled by date",
			compatibilityDate: "2025-08-15",
			expectRuntimeFlags: {
				enable_nodejs_http_modules: true,
			},
		},
	],
	// http client and server modules
	[
		{
			name: "http server disabled by date",
			compatibilityDate: "2024-09-23",
			expectRuntimeFlags: {
				enable_nodejs_http_modules: false,
			},
		},
		{
			name: "http server enabled by date",
			compatibilityDate: "2025-09-01",
			expectRuntimeFlags: {
				enable_nodejs_http_modules: true,
			},
		},
		{
			name: "http server enabled by flag",
			compatibilityDate: "2024-09-23",
			compatibilityFlags: [
				"enable_nodejs_http_modules",
				"enable_nodejs_http_server_modules",
			],
			expectRuntimeFlags: {
				enable_nodejs_http_modules: true,
				enable_nodejs_http_server_modules: true,
			},
		},
		{
			name: "http server disabled by flag",
			compatibilityDate: "2025-09-01",
			compatibilityFlags: [
				"enable_nodejs_http_modules",
				"disable_nodejs_http_server_modules",
			],
			expectRuntimeFlags: {
				enable_nodejs_http_modules: true,
				enable_nodejs_http_server_modules: false,
			},
		},
	],
	// node:http2
	[
		{
			name: "http2 disabled by date",
			compatibilityDate: "2024-09-23",
			expectRuntimeFlags: {
				enable_nodejs_http2_module: false,
			},
		},
		{
			name: "http2 disabled by flag",
			compatibilityDate: "2025-09-01",
			compatibilityFlags: ["disable_nodejs_http2_module"],
			expectRuntimeFlags: {
				enable_nodejs_http2_module: false,
			},
		},
		{
			name: "http2 enabled by flag",
			compatibilityDate: "2024-09-23",
			compatibilityFlags: ["enable_nodejs_http2_module"],
			expectRuntimeFlags: {
				enable_nodejs_http2_module: true,
			},
		},
		{
			name: "http2 enabled by date",
			compatibilityDate: "2025-09-01",
			expectRuntimeFlags: {
				enable_nodejs_http2_module: true,
			},
		},
	],
	// node:os
	[
		{
			name: "os disabled by date",
			compatibilityDate: "2024-09-23",
			expectRuntimeFlags: {
				enable_nodejs_os_module: false,
			},
		},
		{
			name: "os enabled by date",
			compatibilityDate: "2025-09-15",
			expectRuntimeFlags: {
				enable_nodejs_os_module: true,
			},
		},
		{
			name: "os enabled by flag",
			compatibilityDate: "2024-09-23",
			compatibilityFlags: ["enable_nodejs_os_module"],
			expectRuntimeFlags: {
				enable_nodejs_os_module: true,
			},
		},
		{
			name: "os disabled by flag",
			compatibilityDate: "2025-09-15",
			compatibilityFlags: ["disable_nodejs_os_module"],
			expectRuntimeFlags: {
				enable_nodejs_os_module: false,
			},
		},
	],
	// node:fs and node:fs/promises
	[
		{
			name: "fs disabled by date",
			compatibilityDate: "2024-09-23",
			expectRuntimeFlags: {
				enable_nodejs_fs_module: false,
			},
		},
		{
			name: "fs enabled by date",
			compatibilityDate: "2025-09-15",
			expectRuntimeFlags: {
				enable_nodejs_fs_module: true,
			},
		},
		{
			name: "fs enabled by flag",
			compatibilityDate: "2024-09-23",
			compatibilityFlags: ["enable_nodejs_fs_module"],
			expectRuntimeFlags: {
				enable_nodejs_fs_module: true,
			},
		},
		{
			name: "fs disabled by flag",
			compatibilityDate: "2025-09-15",
			compatibilityFlags: ["disable_nodejs_fs_module"],
			expectRuntimeFlags: {
				enable_nodejs_fs_module: false,
			},
		},
	],
	// node:process v2
	[
		{
			name: "process v1 by date",
			compatibilityDate: "2024-09-23",
			expectRuntimeFlags: {
				enable_nodejs_process_v2: false,
			},
		},
		{
			name: "process v2 by date",
			compatibilityDate: "2025-09-15",
			expectRuntimeFlags: {
				enable_nodejs_process_v2: true,
			},
		},
		{
			name: "process v2 by flag",
			compatibilityDate: "2024-09-23",
			compatibilityFlags: ["enable_nodejs_process_v2"],
			expectRuntimeFlags: {
				enable_nodejs_process_v2: true,
			},
		},
		{
			name: "process v1 by flag",
			compatibilityDate: "2025-09-15",
			compatibilityFlags: ["disable_nodejs_process_v2"],
			expectRuntimeFlags: {
				enable_nodejs_process_v2: false,
			},
		},
	],
	// node:punycode
	[
		// TODO: add test for disabled by date (no date defined yet)
		// TODO: add test for enabled by date (no date defined yet)
		{
			name: "punycode enabled by flag",
			compatibilityDate: "2024-09-23",
			compatibilityFlags: ["enable_nodejs_punycode_module", "experimental"],
			expectRuntimeFlags: {
				enable_nodejs_punycode_module: true,
			},
		},
		// TODO: update the date past the default enable date (when defined)
		{
			name: "punycode disabled by flag",
			compatibilityDate: "2024-09-23",
			compatibilityFlags: ["disable_nodejs_punycode_module", "experimental"],
			expectRuntimeFlags: {
				enable_nodejs_punycode_module: false,
			},
		},
	],
	// node:cluster
	[
		// TODO: add test for disabled by date (no date defined yet)
		// TODO: add test for enabled by date (no date defined yet)
		{
			name: "cluster enabled by flag",
			compatibilityDate: "2024-09-23",
			compatibilityFlags: ["enable_nodejs_cluster_module", "experimental"],
			expectRuntimeFlags: {
				enable_nodejs_cluster_module: true,
			},
		},
		// TODO: update the date past the default enable date (when defined)
		{
			name: "cluster disabled by flag",
			compatibilityDate: "2024-09-23",
			compatibilityFlags: ["disable_nodejs_cluster_module", "experimental"],
			expectRuntimeFlags: {
				enable_nodejs_cluster_module: false,
			},
		},
	],
].flat() as TestConfig[];

describe.each(localTestConfigs)(
	`Local preset test: $name`,
	({ compatibilityDate, compatibilityFlags = [], expectRuntimeFlags = {} }) => {
		let url: string;

		beforeAll(async () => {
			const helper = new WranglerE2ETestHelper();
			await helper.seed({
				"wrangler.jsonc": JSON.stringify({
					name: generateResourceName(),
					main: join(__dirname, "/worker/index.ts"),
					compatibility_date: compatibilityDate,
					compatibility_flags: ["nodejs_compat", ...compatibilityFlags],
				}),
			});

			const wrangler = helper.runLongLived(`wrangler dev --local`, {
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
				await expect(flagResp.json(), `flag "${flag}"`).resolves.toEqual(value);
			}

			return async () => await wrangler.stop();
		}, 5_000);

		test.for(Object.keys(WorkerdTests))(
			"%s",
			{ timeout: 5_000 },
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
	}
);

// Run the remote tests only if the user is logged in (e.g. not for a PR from a forked repo)
describe.runIf(Boolean(CLOUDFLARE_ACCOUNT_ID))(
	"Remote preset tests (no module enabled)",
	() => {
		let url: string;

		beforeAll(async () => {
			const helper = new WranglerE2ETestHelper();
			await helper.seed({
				"wrangler.jsonc": JSON.stringify({
					name: generateResourceName(),
					main: join(__dirname, "/worker/index.ts"),
					compatibility_date: "2024-09-23",
					compatibility_flags: ["nodejs_compat"],
				}),
			});

			const wrangler = helper.runLongLived(`wrangler dev --remote`, {
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
			for await (const flag of collectEnableFlags(localTestConfigs)) {
				const flagResp = await fetch(`${url}/flag?name=${flag}`);
				expect(flagResp.ok).toEqual(true);
				await expect(flagResp.json(), `flag "${flag}"`).resolves.toEqual(false);
			}

			return async () => await wrangler.stop();
		}, 20_000);

		test.for(Object.keys(WorkerdTests))(
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
	}
);

// Run the remote tests only if the user is logged in (e.g. not for a PR from a forked repo)
describe.runIf(Boolean(CLOUDFLARE_ACCOUNT_ID))(
	"Remote preset tests (all modules enabled)",
	() => {
		let url: string;

		beforeAll(async () => {
			const helper = new WranglerE2ETestHelper();
			const flags = collectEnableFlags(localTestConfigs);
			await helper.seed({
				"wrangler.jsonc": JSON.stringify({
					name: generateResourceName(),
					main: join(__dirname, "/worker/index.ts"),
					compatibility_date: "2024-09-23",
					compatibility_flags: ["nodejs_compat", ...flags],
				}),
			});

			const wrangler = helper.runLongLived(`wrangler dev --remote`, {
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
			for await (const flag of flags) {
				const flagResp = await fetch(`${url}/flag?name=${flag}`);
				expect(flagResp.ok).toEqual(true);
				await expect(flagResp.json(), `flag "${flag}"`).resolves.toEqual(true);
			}

			return async () => await wrangler.stop();
		}, 20_000);

		test.for(Object.keys(WorkerdTests))(
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
	}
);

/**
 * Collects all the `enable_...` flags
 *
 * @param configs Test configs
 * @returns The list of `enabled_...` flags found in the configs
 */
function collectEnableFlags(configs: TestConfig[]): string[] {
	const enableFlags = new Set<string>();

	for (const config of configs) {
		const flags = config.compatibilityFlags ?? [];

		if (flags.length === 0) {
			continue;
		}

		if (flags.indexOf("experimental") > -1) {
			// "experimental" can not be enabled on remote, skipping the test
			continue;
		}

		for (const flag of flags) {
			if (flag.startsWith("enable_")) {
				enableFlags.add(flag);
			} else if (!flag.startsWith("disable_")) {
				throw new Error(
					`Only enable_... and disable_... flags are handled, got "${flag}"`
				);
			}
		}
	}

	return [...enableFlags];
}
