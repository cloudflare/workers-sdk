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
	// node:console
	[
		{
			name: "console disabled by date",
			compatibilityDate: "2024-09-23",
			expectRuntimeFlags: {
				enable_nodejs_console_module: false,
			},
		},
		{
			name: "console enabled by date",
			compatibilityDate: "2025-09-21",
			expectRuntimeFlags: {
				enable_nodejs_console_module: true,
			},
		},
		{
			name: "console enabled by flag",
			compatibilityDate: "2024-09-23",
			compatibilityFlags: ["enable_nodejs_console_module"],
			expectRuntimeFlags: {
				enable_nodejs_console_module: true,
			},
		},
		{
			name: "console disabled by flag",
			compatibilityDate: "2025-09-21",
			compatibilityFlags: ["disable_nodejs_console_module"],
			expectRuntimeFlags: {
				enable_nodejs_console_module: false,
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
			name: "process v1 by flag",
			compatibilityDate: "2025-09-15",
			compatibilityFlags: ["disable_nodejs_process_v2"],
			expectRuntimeFlags: {
				enable_nodejs_process_v2: false,
			},
		},
		{
			name: "process v2 by date",
			// TODO:
			// - adjust the date to when `fetch_iterable_type_support` is enabled by default
			// - remove setting `fetch_iterable_type_support*` flags from this test case
			compatibilityDate: "2025-09-15",
			compatibilityFlags: [
				"fetch_iterable_type_support",
				"fetch_iterable_type_support_override_adjustment",
			],
			expectRuntimeFlags: {
				enable_nodejs_process_v2: true,
				fetch_iterable_type_support: true,
				fetch_iterable_type_support_override_adjustment: true,
			},
		},
		{
			name: "process v2 by flag",
			compatibilityDate: "2024-09-23",
			compatibilityFlags: [
				"enable_nodejs_process_v2",
				"fetch_iterable_type_support",
				"fetch_iterable_type_support_override_adjustment",
			],
			expectRuntimeFlags: {
				enable_nodejs_process_v2: true,
				fetch_iterable_type_support: true,
				fetch_iterable_type_support_override_adjustment: true,
			},
		},
	],
	// node:punycode
	[
		{
			name: "punycode enabled by date",
			compatibilityDate: "2025-12-04",
			compatibilityFlags: ["enable_nodejs_punycode_module"],
			expectRuntimeFlags: {
				enable_nodejs_punycode_module: true,
			},
		},
		{
			name: "punycode disabled by date",
			compatibilityDate: "2024-09-23",
			expectRuntimeFlags: {
				enable_nodejs_punycode_module: false,
			},
		},
		{
			name: "punycode enabled by flag",
			compatibilityDate: "2024-09-23",
			compatibilityFlags: ["enable_nodejs_punycode_module"],
			expectRuntimeFlags: {
				enable_nodejs_punycode_module: true,
			},
		},
		{
			name: "punycode disabled by flag",
			compatibilityDate: "2025-12-04",
			compatibilityFlags: ["disable_nodejs_punycode_module"],
			expectRuntimeFlags: {
				enable_nodejs_punycode_module: false,
			},
		},
	],
	// node:cluster
	[
		{
			name: "cluster enabled by date",
			compatibilityDate: "2025-12-04",
			expectRuntimeFlags: {
				enable_nodejs_cluster_module: true,
			},
		},
		{
			name: "cluster disabled by date",
			compatibilityDate: "2024-09-23",
			expectRuntimeFlags: {
				enable_nodejs_cluster_module: false,
			},
		},
		{
			name: "cluster enabled by flag",
			compatibilityDate: "2024-09-23",
			compatibilityFlags: ["enable_nodejs_cluster_module"],
			expectRuntimeFlags: {
				enable_nodejs_cluster_module: true,
			},
		},
		{
			name: "cluster disabled by flag",
			compatibilityDate: "2025-12-04",
			compatibilityFlags: ["disable_nodejs_cluster_module"],
			expectRuntimeFlags: {
				enable_nodejs_cluster_module: false,
			},
		},
	],
	// trace_events
	[
		{
			name: "trace_events enabled by date",
			compatibilityDate: "2025-12-04",
			expectRuntimeFlags: {
				enable_nodejs_trace_events_module: true,
			},
		},
		{
			name: "trace_events disabled by date",
			compatibilityDate: "2024-09-23",
			expectRuntimeFlags: {
				enable_nodejs_trace_events_module: false,
			},
		},
		{
			name: "trace_events enabled by flag",
			compatibilityDate: "2024-09-23",
			compatibilityFlags: ["enable_nodejs_trace_events_module"],
			expectRuntimeFlags: {
				enable_nodejs_trace_events_module: true,
			},
		},
		{
			name: "trace_events disabled by flag",
			compatibilityDate: "2025-12-04",
			compatibilityFlags: ["disable_nodejs_trace_events_module"],
			expectRuntimeFlags: {
				enable_nodejs_trace_events_module: false,
			},
		},
	],
	// domain
	[
		{
			name: "domain enabled by date",
			compatibilityDate: "2025-12-04",
			expectRuntimeFlags: {
				enable_nodejs_domain_module: true,
			},
		},
		{
			name: "domain disabled by date",
			compatibilityDate: "2024-09-23",
			expectRuntimeFlags: {
				enable_nodejs_domain_module: false,
			},
		},
		{
			name: "domain enabled by flag",
			compatibilityDate: "2024-09-23",
			compatibilityFlags: ["enable_nodejs_domain_module"],
			expectRuntimeFlags: {
				enable_nodejs_domain_module: true,
			},
		},
		{
			name: "domain disabled by flag",
			compatibilityDate: "2025-12-04",
			compatibilityFlags: ["disable_nodejs_domain_module"],
			expectRuntimeFlags: {
				enable_nodejs_domain_module: false,
			},
		},
	],
	// wasi
	[
		{
			name: "wasi enabled by date",
			compatibilityDate: "2025-12-04",
			expectRuntimeFlags: {
				enable_nodejs_wasi_module: true,
			},
		},
		{
			name: "wasi disabled by date",
			compatibilityDate: "2024-09-23",
			expectRuntimeFlags: {
				enable_nodejs_wasi_module: false,
			},
		},
		{
			name: "wasi enabled by flag",
			compatibilityDate: "2024-09-23",
			compatibilityFlags: ["enable_nodejs_wasi_module"],
			expectRuntimeFlags: {
				enable_nodejs_wasi_module: true,
			},
		},
		{
			name: "wasi disabled by flag",
			compatibilityDate: "2025-12-04",
			compatibilityFlags: ["disable_nodejs_wasi_module"],
			expectRuntimeFlags: {
				enable_nodejs_wasi_module: false,
			},
		},
	],
	// node:vm
	[
		{
			name: "vm disabled by date",
			compatibilityDate: "2024-09-23",
			expectRuntimeFlags: {
				enable_nodejs_vm_module: false,
			},
		},
		{
			name: "vm enabled by date",
			compatibilityDate: "2025-10-01",
			expectRuntimeFlags: {
				enable_nodejs_vm_module: true,
			},
		},
		{
			name: "vm enabled by flag",
			compatibilityDate: "2024-09-23",
			compatibilityFlags: ["enable_nodejs_vm_module"],
			expectRuntimeFlags: {
				enable_nodejs_vm_module: true,
			},
		},
		{
			name: "vm disabled by flag",
			compatibilityDate: "2025-10-01",
			compatibilityFlags: ["disable_nodejs_vm_module"],
			expectRuntimeFlags: {
				enable_nodejs_vm_module: false,
			},
		},
	],
	// node:inspector and node:inspector/promises
	[
		{
			name: "inspector enabled by date",
			compatibilityDate: "2026-01-29",
			expectRuntimeFlags: {
				enable_nodejs_inspector_module: true,
			},
		},
		{
			name: "inspector disabled by date",
			compatibilityDate: "2024-09-23",
			expectRuntimeFlags: {
				enable_nodejs_inspector_module: false,
			},
		},
		{
			name: "inspector enabled by flag",
			compatibilityDate: "2024-09-23",
			compatibilityFlags: ["enable_nodejs_inspector_module"],
			expectRuntimeFlags: {
				enable_nodejs_inspector_module: true,
			},
		},
		{
			name: "inspector disabled by flag",
			compatibilityDate: "2026-01-29",
			compatibilityFlags: ["disable_nodejs_inspector_module"],
			expectRuntimeFlags: {
				enable_nodejs_inspector_module: false,
			},
		},
	],
	// node:sqlite
	[
		{
			name: "sqlite enabled by date",
			compatibilityDate: "2026-01-29",
			expectRuntimeFlags: {
				enable_nodejs_sqlite_module: true,
			},
		},
		{
			name: "sqlite disabled by date",
			compatibilityDate: "2024-09-23",
			expectRuntimeFlags: {
				enable_nodejs_sqlite_module: false,
			},
		},
		{
			name: "sqlite enabled by flag",
			compatibilityDate: "2024-09-23",
			compatibilityFlags: ["enable_nodejs_sqlite_module"],
			expectRuntimeFlags: {
				enable_nodejs_sqlite_module: true,
			},
		},
		{
			name: "sqlite disabled by flag",
			compatibilityDate: "2026-01-29",
			compatibilityFlags: ["disable_nodejs_sqlite_module"],
			expectRuntimeFlags: {
				enable_nodejs_sqlite_module: false,
			},
		},
	],
	// node:dgram
	[
		{
			name: "dgram enabled by date",
			compatibilityDate: "2026-01-29",
			expectRuntimeFlags: {
				enable_nodejs_dgram_module: true,
			},
		},
		{
			name: "dgram disabled by date",
			compatibilityDate: "2024-09-23",
			expectRuntimeFlags: {
				enable_nodejs_dgram_module: false,
			},
		},
		{
			name: "dgram enabled by flag",
			compatibilityDate: "2024-09-23",
			compatibilityFlags: ["enable_nodejs_dgram_module"],
			expectRuntimeFlags: {
				enable_nodejs_dgram_module: true,
			},
		},
		{
			name: "dgram disabled by flag",
			compatibilityDate: "2026-01-29",
			compatibilityFlags: ["disable_nodejs_dgram_module"],
			expectRuntimeFlags: {
				enable_nodejs_dgram_module: false,
			},
		},
	],
	// node:_stream_wrap
	[
		{
			name: "_stream_wrap enabled by date",
			compatibilityDate: "2026-01-29",
			expectRuntimeFlags: {
				enable_nodejs_stream_wrap_module: true,
			},
		},
		{
			name: "_stream_wrap disabled by date",
			compatibilityDate: "2024-09-23",
			expectRuntimeFlags: {
				enable_nodejs_stream_wrap_module: false,
			},
		},
		{
			name: "_stream_wrap enabled by flag",
			compatibilityDate: "2024-09-23",
			compatibilityFlags: ["enable_nodejs_stream_wrap_module"],
			expectRuntimeFlags: {
				enable_nodejs_stream_wrap_module: true,
			},
		},
		{
			name: "_stream_wrap disabled by flag",
			compatibilityDate: "2026-01-29",
			compatibilityFlags: ["disable_nodejs_stream_wrap_module"],
			expectRuntimeFlags: {
				enable_nodejs_stream_wrap_module: false,
			},
		},
	],
	// node:worker_threads (experimental - no default enable date)
	[
		// TODO: add test for disabled by date (no date defined yet)
		// TODO: add test for enabled by date (no date defined yet)
		{
			name: "worker_threads disabled by default",
			compatibilityDate: "2024-09-23",
			compatibilityFlags: ["experimental"],
			expectRuntimeFlags: {
				enable_nodejs_worker_threads_module: false,
			},
		},
		{
			name: "worker_threads enabled by flag",
			compatibilityDate: "2024-09-23",
			compatibilityFlags: [
				"enable_nodejs_worker_threads_module",
				"experimental",
			],
			expectRuntimeFlags: {
				enable_nodejs_worker_threads_module: true,
			},
		},
	],
	// node:repl (experimental, no default enable date)
	[
		// TODO: add test for disabled by date (no date defined yet)
		// TODO: add test for enabled by date (no date defined yet)
		{
			name: "repl enabled by flag",
			compatibilityDate: "2024-09-23",
			compatibilityFlags: ["enable_nodejs_repl_module", "experimental"],
			expectRuntimeFlags: {
				enable_nodejs_repl_module: true,
			},
		},
		{
			name: "repl disabled by flag",
			compatibilityDate: "2024-09-23",
			compatibilityFlags: ["disable_nodejs_repl_module", "experimental"],
			expectRuntimeFlags: {
				enable_nodejs_repl_module: false,
			},
		},
	],
	// node:v8 (experimental, no default enable date)
	[
		// TODO: add test for disabled by date (no date defined yet)
		// TODO: add test for enabled by date (no date defined yet)
		{
			name: "v8 enabled by flag",
			compatibilityDate: "2024-09-23",
			compatibilityFlags: ["enable_nodejs_v8_module", "experimental"],
			expectRuntimeFlags: {
				enable_nodejs_v8_module: true,
			},
		},
		{
			name: "v8 disabled by flag",
			compatibilityDate: "2024-09-23",
			compatibilityFlags: ["disable_nodejs_v8_module", "experimental"],
			expectRuntimeFlags: {
				enable_nodejs_v8_module: false,
			},
		},
	],
	// node:tty (experimental, no default enable date)
	[
		// TODO: add test for disabled by date (no date defined yet)
		// TODO: add test for enabled by date (no date defined yet)
		{
			name: "tty enabled by flag",
			compatibilityDate: "2024-09-23",
			compatibilityFlags: ["enable_nodejs_tty_module", "experimental"],
			expectRuntimeFlags: {
				enable_nodejs_tty_module: true,
			},
		},
		{
			name: "tty disabled by flag",
			compatibilityDate: "2024-09-23",
			compatibilityFlags: ["disable_nodejs_tty_module", "experimental"],
			expectRuntimeFlags: {
				enable_nodejs_tty_module: false,
			},
		},
	],
	// node:child_process (experimental, no default enable date)
	[
		// TODO: add test for disabled by date (no date defined yet)
		// TODO: add test for enabled by date (no date defined yet)
		{
			name: "child_process enabled by flag",
			compatibilityDate: "2024-09-23",
			compatibilityFlags: [
				"enable_nodejs_child_process_module",
				"experimental",
			],
			expectRuntimeFlags: {
				enable_nodejs_child_process_module: true,
			},
		},
		{
			name: "child_process disabled by flag",
			compatibilityDate: "2024-09-23",
			compatibilityFlags: [
				"disable_nodejs_child_process_module",
				"experimental",
			],
			expectRuntimeFlags: {
				enable_nodejs_child_process_module: false,
			},
		},
	],
	// node:readline (experimental, no default enable date)
	[
		// TODO: add test for disabled by date (no date defined yet)
		// TODO: add test for enabled by date (no date defined yet)
		{
			name: "readline enabled by flag",
			compatibilityDate: "2024-09-23",
			compatibilityFlags: ["enable_nodejs_readline_module", "experimental"],
			expectRuntimeFlags: {
				enable_nodejs_readline_module: true,
			},
		},
		{
			name: "readline disabled by flag",
			compatibilityDate: "2024-09-23",
			compatibilityFlags: ["disable_nodejs_readline_module", "experimental"],
			expectRuntimeFlags: {
				enable_nodejs_readline_module: false,
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
		}, 10_000);

		test.for(Object.keys(WorkerdTests))(
			"%s",
			{ timeout: 20_000 },
			async (testName) => {
				// Retries the callback until it succeeds or times out.
				// Useful for the i.e. DNS tests where underlying requests might error/timeout.
				await vi.waitFor(
					async () => {
						const response = await fetch(`${url}/${testName}`);
						const body = await response.text();
						expect(body).toMatch("passed");
					},
					{ timeout: 19_000, interval: 200 }
				);
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
			for await (const flag of collectEnabledFlags(localTestConfigs)) {
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
				await vi.waitFor(
					async () => {
						const response = await fetch(`${url}/${testName}`);
						const body = await response.text();
						expect(body).toMatch("passed");
					},
					{ timeout: 19_000, interval: 200 }
				);
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
			const flags = collectEnabledFlags(localTestConfigs);
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
				await vi.waitFor(
					async () => {
						const response = await fetch(`${url}/${testName}`);
						const body = await response.text();
						expect(body).toMatch("passed");
					},
					{ timeout: 19_000, interval: 200 }
				);
			}
		);
	}
);

/**
 * Collects enabled flags:
 * - skips "experimental" flag
 * - `enable_...` flags
 * - `fetch_iterable_type_support`
 * - `fetch_iterable_type_support_override_adjustment`
 *
 * @param configs Test configs
 * @returns The list of enabled flags found in the configs
 */
function collectEnabledFlags(configs: TestConfig[]): string[] {
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
			// `fetch_iterable_type_support` and `fetch_iterable_type_support_override_adjustment`
			if (flag.startsWith("fetch_iterable_type_support")) {
				enableFlags.add(flag);
				continue;
			}

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
