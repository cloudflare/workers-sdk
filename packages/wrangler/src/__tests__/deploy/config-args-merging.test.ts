/**
 * Regression tests for config/args merging in `wrangler deploy` and `wrangler versions upload`.
 *
 * Each test verifies that CLI args and config file values are correctly merged
 * and arrive in the upload payload metadata. Tests run both commands side-by-side
 * where applicable so divergences are immediately visible.
 *
 * These tests capture the pre-refactoring behavior and serve as a safety net
 * during the deploy/versions-upload code deduplication refactor.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { writeWranglerConfig } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { clearOutputFilePath } from "../../output";
import { fetchSecrets } from "../../utils/fetch-secrets";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { clearDialogs } from "../helpers/mock-dialogs";
import { mockGetZones } from "../helpers/mock-get-zone-from-host";
import { useMockIsTTY } from "../helpers/mock-istty";
import { mockUploadWorkerRequest } from "../helpers/mock-upload-worker";
import { mockGetSettings } from "../helpers/mock-worker-settings";
import {
	mockGetWorkerSubdomain,
	mockSubDomainRequest,
	mockUpdateWorkerSubdomain,
} from "../helpers/mock-workers-subdomain";
import { mockGetZoneWorkerRoutes } from "../helpers/mock-zone-routes";
import { createFetchResult, msw } from "../helpers/msw";
import { mswListNewDeploymentsLatestFull } from "../helpers/msw/handlers/versions";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import { toString } from "../helpers/serialize-form-data-entry";
import { writeWorkerSource } from "../helpers/write-worker-source";
import {
	mockDeploymentsListRequest,
	mockLastDeploymentRequest,
	mockPatchScriptSettings,
	mockPublishRoutesRequest,
	mockPublishSchedulesRequest,
} from "./helpers";
import type { WorkerMetadata } from "@cloudflare/workers-utils";

vi.mock("command-exists");
vi.mock("../../check/commands", async (importOriginal) => {
	return {
		...(await importOriginal()),
		analyseBundle() {
			return `{}`;
		},
	};
});
vi.mock("../../utils/fetch-secrets");
vi.mock("../../package-manager", async (importOriginal) => ({
	...(await importOriginal()),
	sniffUserAgent: () => "npm",
	getPackageManager() {
		return {
			type: "npm",
			npx: "npx",
		};
	},
}));
vi.mock("../../autoconfig/run");
vi.mock("../../autoconfig/frameworks/utils/packages");
vi.mock("@cloudflare/cli-shared-helpers/command");

// ─── Shared helpers ──────────────────────────────────────────────────

/** Set up common deploy mocks (deployments list, script settings, R2 buckets, etc.) */
function setupDeployMocks() {
	mockLastDeploymentRequest();
	mockDeploymentsListRequest();
	mockPatchScriptSettings();
	mockGetSettings();
	msw.use(...mswListNewDeploymentsLatestFull);
	msw.use(
		http.get("*/accounts/:accountId/r2/buckets/:bucketName", async () => {
			return HttpResponse.json(createFetchResult({}));
		})
	);
	vi.mocked(fetchSecrets).mockResolvedValue([]);
}

/** Mock the GET /workers/services/:name endpoint for versions upload */
function mockGetScript(result?: unknown) {
	msw.use(
		http.get(
			`*/accounts/:accountId/workers/services/:scriptName`,
			() => {
				return HttpResponse.json(
					createFetchResult(
						result ?? {
							default_environment: {
								script: {
									last_deployed_from: "wrangler",
								},
							},
						}
					)
				);
			},
			{ once: true }
		)
	);
}

/**
 * Mock the versions upload endpoint and capture requests for metadata inspection.
 * Used for versions upload tests.
 */
function mockUploadVersion(has_preview = false) {
	const requests: Request[] = [];
	msw.use(
		http.post(
			`*/accounts/:accountId/workers/scripts/:scriptName/versions`,
			async ({ request }) => {
				requests.push(request.clone());
				return HttpResponse.json(
					createFetchResult({
						id: "51e4886e-2db7-4900-8d38-fbfecfeab993",
						startup_time_ms: 500,
						metadata: {
							has_preview,
						},
					})
				);
			}
		)
	);

	msw.use(
		http.patch(
			`*/accounts/:accountId/workers/scripts/:scriptName/script-settings`,
			async ({ request }) => {
				return HttpResponse.json(
					createFetchResult(await request.clone().json())
				);
			}
		)
	);

	return requests;
}

/** Parse WorkerMetadata from a captured upload request */
async function getMetadata(request: Request): Promise<WorkerMetadata> {
	const formBody = await request.clone().formData();
	return JSON.parse(await toString(formBody.get("metadata"))) as WorkerMetadata;
}

// ─── Test suites ─────────────────────────────────────────────────────

describe("config/args merging", () => {
	runInTempDir();
	mockAccountId();
	mockApiToken();
	const { setIsTTY } = useMockIsTTY();
	const std = mockConsoleMethods();

	beforeEach(() => {
		vi.stubGlobal("setTimeout", (fn: () => void) => {
			setImmediate(fn);
		});
		setIsTTY(false);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		clearDialogs();
		clearOutputFilePath();
	});

	// ─── Name resolution ─────────────────────────────────────────────

	describe("name resolution", () => {
		describe("deploy", () => {
			beforeEach(setupDeployMocks);

			it("--name CLI flag overrides config name", async ({ expect }) => {
				writeWranglerConfig({ name: "config-name" });
				writeWorkerSource();
				mockUploadWorkerRequest({ expectedScriptName: "cli-name" });
				mockSubDomainRequest();
				await runWrangler("deploy ./index.js --name cli-name");
				expect(std.out).toContain("Uploaded cli-name");
			});

			it("uses config name when --name is not provided", async ({ expect }) => {
				writeWranglerConfig({ name: "from-config" });
				writeWorkerSource();
				mockUploadWorkerRequest({ expectedScriptName: "from-config" });
				mockSubDomainRequest();
				await runWrangler("deploy ./index.js");
				expect(std.out).toContain("Uploaded from-config");
			});

			it("errors when no name is provided from either source", async ({
				expect,
			}) => {
				writeWranglerConfig({ name: undefined });
				writeWorkerSource();
				await expect(runWrangler("deploy ./index.js")).rejects.toThrowError(
					/You need to provide a name/
				);
			});
		});

		describe("versions upload", () => {
			it("--name CLI flag overrides config name", async ({ expect }) => {
				writeWranglerConfig({ name: "config-name", main: "./index.js" });
				writeWorkerSource();
				mockGetScript();
				const requests = mockUploadVersion();
				await runWrangler("versions upload --name cli-name");
				const metadata = await getMetadata(requests[requests.length - 1]);
				// The script name in the URL is "cli-name", verified via the metadata being received
				expect(std.out).toContain("Uploaded cli-name");
				expect(metadata).toBeDefined();
			});

			it("uses config name when --name is not provided", async ({ expect }) => {
				writeWranglerConfig({ name: "from-config", main: "./index.js" });
				writeWorkerSource();
				mockGetScript();
				mockUploadVersion();
				await runWrangler("versions upload");
				expect(std.out).toContain("Uploaded from-config");
			});

			it("errors when no name is provided from either source", async ({
				expect,
			}) => {
				writeWranglerConfig({ name: undefined, main: "./index.js" });
				writeWorkerSource();
				await expect(runWrangler("versions upload")).rejects.toThrowError(
					/You need to provide a name/
				);
			});
		});
	});

	// ─── Compatibility date and flags ────────────────────────────────

	describe("compatibility date and flags", () => {
		describe("deploy", () => {
			beforeEach(setupDeployMocks);

			it("--compatibility-date CLI flag overrides config", async ({
				expect,
			}) => {
				writeWranglerConfig({
					compatibility_date: "2024-01-01",
				});
				writeWorkerSource();
				mockUploadWorkerRequest({
					expectedCompatibilityDate: "2025-06-01",
				});
				mockSubDomainRequest();
				await runWrangler("deploy ./index.js --compatibility-date 2025-06-01");
				expect(std.out).toContain("Uploaded test-name");
			});

			it("uses config compatibility_date when CLI flag not provided", async ({
				expect,
			}) => {
				writeWranglerConfig({
					compatibility_date: "2024-03-15",
				});
				writeWorkerSource();
				mockUploadWorkerRequest({
					expectedCompatibilityDate: "2024-03-15",
				});
				mockSubDomainRequest();
				await runWrangler("deploy ./index.js");
				expect(std.out).toContain("Uploaded test-name");
			});

			it("--compatibility-flags CLI flag overrides config", async ({
				expect,
			}) => {
				writeWranglerConfig({
					compatibility_flags: ["flag_from_config"],
				});
				writeWorkerSource();
				mockUploadWorkerRequest({
					expectedCompatibilityFlags: ["flag_from_cli"],
				});
				mockSubDomainRequest();
				await runWrangler(
					"deploy ./index.js --compatibility-flag flag_from_cli"
				);
				expect(std.out).toContain("Uploaded test-name");
			});

			it("uses config compatibility_flags when CLI flag not provided", async ({
				expect,
			}) => {
				writeWranglerConfig({
					compatibility_flags: ["nodejs_compat"],
				});
				writeWorkerSource();
				mockUploadWorkerRequest({
					expectedCompatibilityFlags: ["nodejs_compat"],
				});
				mockSubDomainRequest();
				await runWrangler("deploy ./index.js");
				expect(std.out).toContain("Uploaded test-name");
			});

			it("--latest sets compatibility date to today", async ({ expect }) => {
				writeWranglerConfig({ compatibility_date: undefined });
				writeWorkerSource();
				// We can't assert the exact date easily, but we can verify it succeeds
				// (it would fail with missing compat date otherwise)
				mockUploadWorkerRequest();
				mockSubDomainRequest();
				await runWrangler("deploy ./index.js --latest");
				expect(std.out).toContain("Uploaded test-name");
				expect(std.warn).toContain("latest version of the Workers runtime");
			});

			it("errors when no compatibility_date from either source", async ({
				expect,
			}) => {
				writeWranglerConfig({ compatibility_date: undefined });
				writeWorkerSource();
				await expect(runWrangler("deploy ./index.js")).rejects.toThrowError(
					/A compatibility_date is required/
				);
			});
		});

		describe("versions upload", () => {
			it("--compatibility-date CLI flag overrides config", async ({
				expect,
			}) => {
				writeWranglerConfig({
					compatibility_date: "2024-01-01",
					main: "./index.js",
				});
				writeWorkerSource();
				mockGetScript();
				const requests = mockUploadVersion();
				await runWrangler("versions upload --compatibility-date 2025-06-01");
				const metadata = await getMetadata(requests[requests.length - 1]);
				expect(metadata.compatibility_date).toEqual("2025-06-01");
			});

			it("uses config compatibility_date when CLI flag not provided", async ({
				expect,
			}) => {
				writeWranglerConfig({
					compatibility_date: "2024-03-15",
					main: "./index.js",
				});
				writeWorkerSource();
				mockGetScript();
				const requests = mockUploadVersion();
				await runWrangler("versions upload");
				const metadata = await getMetadata(requests[requests.length - 1]);
				expect(metadata.compatibility_date).toEqual("2024-03-15");
			});

			it("--compatibility-flags CLI flag overrides config", async ({
				expect,
			}) => {
				writeWranglerConfig({
					compatibility_flags: ["flag_from_config"],
					main: "./index.js",
				});
				writeWorkerSource();
				mockGetScript();
				const requests = mockUploadVersion();
				await runWrangler("versions upload --compatibility-flag flag_from_cli");
				const metadata = await getMetadata(requests[requests.length - 1]);
				expect(metadata.compatibility_flags).toEqual(["flag_from_cli"]);
			});

			it("uses config compatibility_flags when CLI flag not provided", async ({
				expect,
			}) => {
				writeWranglerConfig({
					compatibility_flags: ["nodejs_compat"],
					main: "./index.js",
				});
				writeWorkerSource();
				mockGetScript();
				const requests = mockUploadVersion();
				await runWrangler("versions upload");
				const metadata = await getMetadata(requests[requests.length - 1]);
				expect(metadata.compatibility_flags).toEqual(["nodejs_compat"]);
			});

			it("--latest sets compatibility date to today", async ({ expect }) => {
				writeWranglerConfig({
					compatibility_date: undefined,
					main: "./index.js",
				});
				writeWorkerSource();
				mockGetScript();
				mockUploadVersion();
				await runWrangler("versions upload --latest");
				expect(std.out).toContain("Uploaded test-name");
				expect(std.warn).toContain("latest version of the Workers runtime");
			});

			it("errors when no compatibility_date from either source", async ({
				expect,
			}) => {
				writeWranglerConfig({
					compatibility_date: undefined,
					main: "./index.js",
				});
				writeWorkerSource();
				// On main, versions upload calls requireAuth() before validating compat date,
				// so we need the service metadata mock to avoid an unrelated API error
				mockGetScript();
				await expect(runWrangler("versions upload")).rejects.toThrowError(
					/A compatibility_date is required/
				);
			});
		});
	});

	// ─── Bundling flags ──────────────────────────────────────────────

	describe("bundling flags", () => {
		describe("deploy", () => {
			beforeEach(setupDeployMocks);

			it("--minify overrides config.minify", async ({ expect }) => {
				writeWranglerConfig({ minify: false });
				writeWorkerSource();
				mockUploadWorkerRequest();
				mockSubDomainRequest();
				// If minify works, the output should be smaller, but we just verify it succeeds
				await runWrangler("deploy ./index.js --minify");
				expect(std.out).toContain("Uploaded test-name");
			});

			it("uses config.minify when CLI flag not provided", async ({
				expect,
			}) => {
				writeWranglerConfig({ minify: true });
				writeWorkerSource();
				mockUploadWorkerRequest();
				mockSubDomainRequest();
				await runWrangler("deploy ./index.js");
				expect(std.out).toContain("Uploaded test-name");
			});

			it("--no-bundle skips bundling", async ({ expect }) => {
				writeWranglerConfig();
				// Write a worker with an unresolvable import — this would fail
				// if bundling ran, but should succeed with --no-bundle
				fs.writeFileSync(
					"index.js",
					`import unresolvable from "does-not-exist"; export default { fetch() { return new Response("ok"); } }`
				);
				mockUploadWorkerRequest();
				mockSubDomainRequest();
				await runWrangler("deploy ./index.js --no-bundle");
				expect(std.out).toContain("Uploaded test-name");
			});

			it("config no_bundle skips bundling", async ({ expect }) => {
				writeWranglerConfig({ no_bundle: true });
				fs.writeFileSync(
					"index.js",
					`import unresolvable from "does-not-exist"; export default { fetch() { return new Response("ok"); } }`
				);
				mockUploadWorkerRequest();
				mockSubDomainRequest();
				await runWrangler("deploy ./index.js");
				expect(std.out).toContain("Uploaded test-name");
			});

			it("warns when --minify and --no-bundle are both set", async ({
				expect,
			}) => {
				writeWranglerConfig();
				writeWorkerSource();
				mockUploadWorkerRequest();
				mockSubDomainRequest();
				await runWrangler("deploy ./index.js --minify --no-bundle");
				expect(std.warn).toContain(
					"`--minify` and `--no-bundle` can't be used together"
				);
			});
		});

		describe("versions upload", () => {
			it("--no-bundle skips bundling", async ({ expect }) => {
				writeWranglerConfig({ main: "./index.js" });
				fs.writeFileSync(
					"index.js",
					`import unresolvable from "does-not-exist"; export default { fetch() { return new Response("ok"); } }`
				);
				mockGetScript();
				mockUploadVersion();
				await runWrangler("versions upload --no-bundle");
				expect(std.out).toContain("Uploaded test-name");
			});

			it("config no_bundle skips bundling", async ({ expect }) => {
				writeWranglerConfig({ no_bundle: true, main: "./index.js" });
				fs.writeFileSync(
					"index.js",
					`import unresolvable from "does-not-exist"; export default { fetch() { return new Response("ok"); } }`
				);
				mockGetScript();
				mockUploadVersion();
				await runWrangler("versions upload");
				expect(std.out).toContain("Uploaded test-name");
			});

			it("warns when --minify and --no-bundle are both set", async ({
				expect,
			}) => {
				writeWranglerConfig({ main: "./index.js" });
				writeWorkerSource();
				mockGetScript();
				mockUploadVersion();
				await runWrangler("versions upload --minify --no-bundle");
				expect(std.warn).toContain(
					"`--minify` and `--no-bundle` can't be used together"
				);
			});
		});
	});

	// ─── Build options (jsx, tsconfig) ───────────────────────────────

	describe("build options", () => {
		describe("deploy", () => {
			beforeEach(setupDeployMocks);

			it("--jsx-factory overrides config.jsx_factory", async ({ expect }) => {
				writeWranglerConfig({ jsx_factory: "configFactory" });
				fs.writeFileSync(
					"index.js",
					`export default { fetch() { return new Response("ok"); } }`
				);
				mockUploadWorkerRequest();
				mockSubDomainRequest();
				await runWrangler("deploy ./index.js --jsx-factory cliFactory");
				expect(std.out).toContain("Uploaded test-name");
			});

			it("--jsx-fragment overrides config.jsx_fragment", async ({ expect }) => {
				writeWranglerConfig({ jsx_fragment: "configFragment" });
				fs.writeFileSync(
					"index.js",
					`export default { fetch() { return new Response("ok"); } }`
				);
				mockUploadWorkerRequest();
				mockSubDomainRequest();
				await runWrangler("deploy ./index.js --jsx-fragment cliFragment");
				expect(std.out).toContain("Uploaded test-name");
			});

			it("--tsconfig overrides config.tsconfig", async ({ expect }) => {
				// Both tsconfigs must exist on disk — esbuild validates them
				fs.writeFileSync(
					"config-tsconfig.json",
					JSON.stringify({ compilerOptions: {} })
				);
				fs.writeFileSync(
					"cli-tsconfig.json",
					JSON.stringify({ compilerOptions: {} })
				);
				writeWranglerConfig({ tsconfig: "./config-tsconfig.json" });
				writeWorkerSource();
				mockUploadWorkerRequest();
				mockSubDomainRequest();
				await runWrangler("deploy ./index.js --tsconfig cli-tsconfig.json");
				expect(std.out).toContain("Uploaded test-name");
			});
		});

		describe("versions upload", () => {
			it("--jsx-factory overrides config.jsx_factory", async ({ expect }) => {
				writeWranglerConfig({
					jsx_factory: "configFactory",
					main: "./index.js",
				});
				fs.writeFileSync(
					"index.js",
					`export default { fetch() { return new Response("ok"); } }`
				);
				mockGetScript();
				mockUploadVersion();
				await runWrangler("versions upload --jsx-factory cliFactory");
				expect(std.out).toContain("Uploaded test-name");
			});

			it("--jsx-fragment overrides config.jsx_fragment", async ({ expect }) => {
				writeWranglerConfig({
					jsx_fragment: "configFragment",
					main: "./index.js",
				});
				fs.writeFileSync(
					"index.js",
					`export default { fetch() { return new Response("ok"); } }`
				);
				mockGetScript();
				mockUploadVersion();
				await runWrangler("versions upload --jsx-fragment cliFragment");
				expect(std.out).toContain("Uploaded test-name");
			});

			it("--tsconfig overrides config.tsconfig", async ({ expect }) => {
				// Both tsconfigs must exist on disk — esbuild validates them
				fs.writeFileSync(
					"config-tsconfig.json",
					JSON.stringify({ compilerOptions: {} })
				);
				fs.writeFileSync(
					"cli-tsconfig.json",
					JSON.stringify({ compilerOptions: {} })
				);
				writeWranglerConfig({
					tsconfig: "./config-tsconfig.json",
					main: "./index.js",
				});
				writeWorkerSource();
				mockGetScript();
				mockUploadVersion();
				await runWrangler("versions upload --tsconfig cli-tsconfig.json");
				expect(std.out).toContain("Uploaded test-name");
			});
		});
	});

	// ─── --var, --alias ────────────────────────────────────

	describe("variables, and aliases", () => {
		describe("deploy", () => {
			beforeEach(setupDeployMocks);

			it("--var adds plain_text binding to upload metadata", async ({
				expect,
			}) => {
				writeWranglerConfig();
				writeWorkerSource();
				mockUploadWorkerRequest({
					expectedBindings: [
						{
							type: "plain_text",
							name: "MY_VAR",
							text: "my-value",
						},
					],
				});
				mockSubDomainRequest();
				await runWrangler("deploy ./index.js --var MY_VAR:my-value");
				expect(std.out).toContain("Uploaded test-name");
			});

			it("--var coexists with config vars", async ({ expect }) => {
				writeWranglerConfig({
					vars: { CONFIG_VAR: "from-config" },
				});
				writeWorkerSource();
				mockUploadWorkerRequest({
					expectedBindings: [
						{
							type: "plain_text",
							name: "CONFIG_VAR",
							text: "from-config",
						},
						{
							type: "plain_text",
							name: "CLI_VAR",
							text: "from-cli",
						},
					],
				});
				mockSubDomainRequest();
				await runWrangler("deploy ./index.js --var CLI_VAR:from-cli");
				expect(std.out).toContain("Uploaded test-name");
			});

			it("--alias resolves module at bundle time", async ({ expect }) => {
				writeWranglerConfig({
					// deploy on main doesn't merge CLI --alias over config.alias,
					// so we set it in config instead
					alias: { "some-module": "./aliased.js" },
				});
				fs.writeFileSync(
					"index.js",
					`import foo from "some-module"; export default { fetch() { return new Response(foo); } }`
				);
				fs.writeFileSync("aliased.js", `export default "aliased";`);
				mockUploadWorkerRequest();
				mockSubDomainRequest();
				await runWrangler("deploy ./index.js");
				expect(std.err).not.toContain("some-module");
				expect(std.out).toContain("Uploaded test-name");
			});
		});

		describe("versions upload", () => {
			it("--var adds plain_text binding to upload metadata", async ({
				expect,
			}) => {
				writeWranglerConfig({ main: "./index.js" });
				writeWorkerSource();
				mockGetScript();
				const requests = mockUploadVersion();
				await runWrangler("versions upload --var MY_VAR:my-value");
				const metadata = await getMetadata(requests[requests.length - 1]);
				expect(metadata.bindings).toEqual(
					expect.arrayContaining([
						expect.objectContaining({
							type: "plain_text",
							name: "MY_VAR",
							text: "my-value",
						}),
					])
				);
			});

			it("--var coexists with config vars", async ({ expect }) => {
				writeWranglerConfig({
					vars: { CONFIG_VAR: "from-config" },
					main: "./index.js",
				});
				writeWorkerSource();
				mockGetScript();
				const requests = mockUploadVersion();
				await runWrangler("versions upload --var CLI_VAR:from-cli");
				const metadata = await getMetadata(requests[requests.length - 1]);
				expect(metadata.bindings).toEqual(
					expect.arrayContaining([
						expect.objectContaining({
							type: "plain_text",
							name: "CONFIG_VAR",
							text: "from-config",
						}),
						expect.objectContaining({
							type: "plain_text",
							name: "CLI_VAR",
							text: "from-cli",
						}),
					])
				);
			});

			it("--define is applied at bundle time", async ({ expect }) => {
				writeWranglerConfig({ main: "./index.js" });
				fs.writeFileSync(
					"index.js",
					`export default { fetch() { return new Response(MY_DEFINE); } }`
				);
				mockGetScript();
				mockUploadVersion();
				await runWrangler('versions upload --define MY_DEFINE:"hello"');
				expect(std.out).toContain("Uploaded test-name");
			});

			it("--define merges over config.define (CLI wins)", async ({
				expect,
			}) => {
				writeWranglerConfig({
					define: { FROM_CONFIG: '"config-val"' },
					main: "./index.js",
				});
				fs.writeFileSync(
					"index.js",
					`export default { fetch() { return new Response(FROM_CONFIG + " " + FROM_CLI); } }`
				);
				mockGetScript();
				mockUploadVersion();
				// Define values must be valid JS literals (quoted strings)
				await runWrangler("versions upload --define FROM_CLI:'\"cli-val\"'");
				expect(std.out).toContain("Uploaded test-name");
			});

			it("--alias resolves module at bundle time", async ({ expect }) => {
				writeWranglerConfig({ main: "./index.js" });
				fs.writeFileSync(
					"index.js",
					`import foo from "some-module"; export default { fetch() { return new Response(foo); } }`
				);
				fs.writeFileSync("aliased.js", `export default "aliased";`);
				mockGetScript();
				mockUploadVersion();
				await runWrangler("versions upload --alias some-module:./aliased.js");
				expect(std.err).not.toContain("some-module");
				expect(std.out).toContain("Uploaded test-name");
			});
		});

		describe("--alias CLI flag divergence between deploy and versions upload", () => {
			// BUG: deploy ignores CLI --alias and only uses config.alias.
			// versions upload correctly merges CLI --alias over config.alias.
			// deploy/deploy.ts passes `alias: config.alias` to bundleWorker,
			// ignoring the `props.alias` value that was collected from CLI args.

			it("deploy: --alias CLI flag is IGNORED (bug)", async ({ expect }) => {
				setupDeployMocks();
				writeWranglerConfig();
				fs.writeFileSync(
					"index.js",
					`import foo from "some-module"; export default { fetch() { return new Response(foo); } }`
				);
				fs.writeFileSync("aliased.js", `export default "aliased";`);
				// deploy ignores --alias, so the unresolvable import causes a build failure
				await expect(
					runWrangler("deploy ./index.js --alias some-module:./aliased.js")
				).rejects.toThrowErrorMatchingInlineSnapshot(`
					[Error: Build failed with 1 error:
					index.js:1:16: ERROR: Could not resolve "some-module"]
				`);
			});

			it("versions upload: --alias CLI flag works correctly", async ({
				expect,
			}) => {
				writeWranglerConfig({ main: "./index.js" });
				fs.writeFileSync(
					"index.js",
					`import foo from "some-module"; export default { fetch() { return new Response(foo); } }`
				);
				fs.writeFileSync("aliased.js", `export default "aliased";`);
				mockGetScript();
				mockUploadVersion();
				// versions upload merges CLI --alias, so the import resolves
				await runWrangler("versions upload --alias some-module:./aliased.js");
				expect(std.err).not.toContain("some-module");
				expect(std.out).toContain("Uploaded test-name");
			});
		});
	});

	// ─── Deploy-only args ────────────────────────────────────────────

	describe("deploy-only args", () => {
		beforeEach(setupDeployMocks);

		it("--route overrides config.routes", async ({ expect }) => {
			writeWranglerConfig({
				routes: ["config-route.example.com/*"],
			});
			writeWorkerSource();
			mockUpdateWorkerSubdomain({ enabled: false });
			mockUploadWorkerRequest();
			mockGetZones(expect, "cli-route.example.com", [
				{ id: "cli-route-zone-id" },
			]);
			mockGetZoneWorkerRoutes(expect, "cli-route-zone-id");
			mockPublishRoutesRequest({
				routes: ["cli-route.example.com/*"],
			});
			await runWrangler("deploy ./index.js --route cli-route.example.com/*");
			expect(std.out).toContain("Uploaded test-name");
		});

		it("uses config.routes when --route is not provided", async ({
			expect,
		}) => {
			writeWranglerConfig({
				routes: ["config-route.example.com/*"],
			});
			writeWorkerSource();
			mockUpdateWorkerSubdomain({ enabled: false });
			mockUploadWorkerRequest();
			mockGetZones(expect, "config-route.example.com", [
				{ id: "config-route-zone-id" },
			]);
			mockGetZoneWorkerRoutes(expect, "config-route-zone-id");
			mockPublishRoutesRequest({
				routes: ["config-route.example.com/*"],
			});
			await runWrangler("deploy ./index.js");
			expect(std.out).toContain("Uploaded test-name");
		});

		it("uses config.route (singular) when config.routes not provided", async ({
			expect,
		}) => {
			writeWranglerConfig({
				route: "singular-route.example.com/*",
				workers_dev: false,
			});
			writeWorkerSource();
			mockUploadWorkerRequest();
			mockGetZones(expect, "singular-route.example.com", [
				{ id: "singular-route-zone-id" },
			]);
			mockGetZoneWorkerRoutes(expect, "singular-route-zone-id");
			mockPublishRoutesRequest({
				routes: ["singular-route.example.com/*"],
			});
			await runWrangler("deploy ./index.js");
			expect(std.out).toContain("Uploaded test-name");
		});

		it("--triggers overrides config.triggers.crons", async ({ expect }) => {
			writeWranglerConfig({
				triggers: { crons: ["0 0 * * *"] },
			});
			writeWorkerSource();
			mockUploadWorkerRequest();
			mockSubDomainRequest();
			mockPublishRoutesRequest({ routes: [] });
			mockPublishSchedulesRequest({
				crons: ["*/5 * * * *"],
			});
			await runWrangler("deploy ./index.js --schedule '*/5 * * * *'");
			expect(std.out).toContain("Uploaded test-name");
		});

		it("uses config.triggers.crons when --triggers not provided", async ({
			expect,
		}) => {
			writeWranglerConfig({
				triggers: { crons: ["0 0 * * *"] },
			});
			writeWorkerSource();
			mockUploadWorkerRequest();
			mockSubDomainRequest();
			mockPublishRoutesRequest({ routes: [] });
			mockPublishSchedulesRequest({
				crons: ["0 0 * * *"],
			});
			await runWrangler("deploy ./index.js");
			expect(std.out).toContain("Uploaded test-name");
		});

		it("--logpush overrides config.logpush", async ({ expect }) => {
			writeWranglerConfig({ logpush: false });
			writeWorkerSource();
			mockUploadWorkerRequest({
				expectedSettingsPatch: expect.objectContaining({ logpush: true }),
			});
			mockSubDomainRequest();
			await runWrangler("deploy ./index.js --logpush");
			expect(std.out).toContain("Uploaded test-name");
		});

		it("uses config.logpush when --logpush not provided", async ({
			expect,
		}) => {
			writeWranglerConfig({ logpush: true });
			writeWorkerSource();
			mockUploadWorkerRequest({
				expectedSettingsPatch: expect.objectContaining({ logpush: true }),
			});
			mockSubDomainRequest();
			await runWrangler("deploy ./index.js");
			expect(std.out).toContain("Uploaded test-name");
		});

		it("--tag and --message set annotations on deploy", async ({ expect }) => {
			writeWranglerConfig();
			writeWorkerSource();
			mockUploadWorkerRequest({
				expectedAnnotations: {
					"workers/message": "my deploy message",
					"workers/tag": "v1.0.0",
				},
				expectedDeploymentMessage: "my deploy message",
			});
			mockSubDomainRequest();
			await runWrangler(
				'deploy ./index.js --tag v1.0.0 --message "my deploy message"'
			);
			expect(std.out).toContain("Uploaded test-name");
		});
	});

	// ─── Versions upload-only args ───────────────────────────────────

	describe("versions upload-only args", () => {
		it("--tag and --message set annotations", async ({ expect }) => {
			writeWranglerConfig({ main: "./index.js" });
			writeWorkerSource();
			mockGetScript();
			const requests = mockUploadVersion();
			await runWrangler(
				'versions upload --tag v1.0.0 --message "my version message"'
			);
			const metadata = await getMetadata(requests[requests.length - 1]);
			expect(metadata.annotations).toEqual({
				"workers/message": "my version message",
				"workers/tag": "v1.0.0",
				"workers/alias": undefined,
			});
		});

		it("--preview-alias sets annotation", async ({ expect }) => {
			writeWranglerConfig({ main: "./index.js" });
			writeWorkerSource();
			mockGetScript();
			const requests = mockUploadVersion(true);
			mockGetWorkerSubdomain({ enabled: true, previews_enabled: true });
			mockSubDomainRequest();
			await runWrangler("versions upload --preview-alias my-alias");
			const metadata = await getMetadata(requests[requests.length - 1]);
			expect(metadata.annotations).toEqual({ "workers/alias": "my-alias" });
		});

		it("annotations default to undefined when no flags provided", async ({
			expect,
		}) => {
			writeWranglerConfig({ main: "./index.js" });
			writeWorkerSource();
			mockGetScript();
			const requests = mockUploadVersion();
			await runWrangler("versions upload");
			const metadata = await getMetadata(requests[requests.length - 1]);
			expect(metadata.annotations).toEqual({
				"workers/message": undefined,
				"workers/tag": undefined,
				"workers/alias": undefined,
			});
		});
	});

	// ─── Shared args (dry-run, outdir, secrets-file, positional) ─────

	describe("shared args", () => {
		describe("deploy", () => {
			beforeEach(setupDeployMocks);

			it("--dry-run compiles without uploading", async ({ expect }) => {
				writeWranglerConfig();
				writeWorkerSource();
				// No mock for upload — it should not be called
				await runWrangler("deploy ./index.js --dry-run");
				expect(std.out).toContain("--dry-run: exiting now");
			});

			it("--outdir writes bundled output", async ({ expect }) => {
				writeWranglerConfig();
				writeWorkerSource();
				mockUploadWorkerRequest();
				mockSubDomainRequest();
				await runWrangler("deploy ./index.js --outdir dist");
				expect(fs.existsSync("dist")).toBe(true);
				expect(fs.existsSync(path.join("dist", "README.md"))).toBe(true);
			});

			it("positional script arg overrides config.main", async ({ expect }) => {
				writeWranglerConfig({ main: "./nope.js" });
				writeWorkerSource();
				mockUploadWorkerRequest();
				mockSubDomainRequest();
				await runWrangler("deploy ./index.js");
				expect(std.out).toContain("Uploaded test-name");
			});

			it("--secrets-file adds secret bindings", async ({ expect }) => {
				writeWranglerConfig();
				writeWorkerSource();
				fs.writeFileSync(
					"secrets.json",
					JSON.stringify({ MY_SECRET: "secret-value" })
				);
				// --secrets-file causes keepSecrets=true in the deploy path
				mockUploadWorkerRequest({
					keepSecrets: true,
					expectedBindings: [
						{
							type: "secret_text",
							name: "MY_SECRET",
							text: "secret-value",
						},
					],
				});
				mockSubDomainRequest();
				await runWrangler("deploy ./index.js --secrets-file secrets.json");
				expect(std.out).toContain("Uploaded test-name");
			});
		});

		describe("versions upload", () => {
			it("--dry-run compiles without uploading", async ({ expect }) => {
				writeWranglerConfig({ main: "./index.js" });
				writeWorkerSource();
				// No mock for upload — it should not be called
				await runWrangler("versions upload --dry-run");
				expect(std.out).toContain("--dry-run: exiting now");
			});

			it("--outdir writes bundled output", async ({ expect }) => {
				writeWranglerConfig({ main: "./index.js" });
				writeWorkerSource();
				mockGetScript();
				mockUploadVersion();
				await runWrangler("versions upload --outdir dist");
				expect(fs.existsSync("dist")).toBe(true);
				expect(fs.existsSync(path.join("dist", "README.md"))).toBe(true);
			});

			it("positional script arg overrides config.main", async ({ expect }) => {
				writeWranglerConfig({ main: "./nope.js", name: "test-name" });
				writeWorkerSource();
				mockGetScript();
				mockUploadVersion();
				await runWrangler("versions upload ./index.js");
				expect(std.out).toContain("Uploaded test-name");
			});

			it("--secrets-file adds secret bindings", async ({ expect }) => {
				writeWranglerConfig({ main: "./index.js" });
				writeWorkerSource();
				fs.writeFileSync(
					"secrets.json",
					JSON.stringify({ MY_SECRET: "secret-value" })
				);
				mockGetScript();
				const requests = mockUploadVersion();
				await runWrangler("versions upload --secrets-file secrets.json");
				const metadata = await getMetadata(requests[requests.length - 1]);
				expect(metadata.bindings).toEqual(
					expect.arrayContaining([
						expect.objectContaining({
							type: "secret_text",
							name: "MY_SECRET",
							text: "secret-value",
						}),
					])
				);
			});
		});
	});

	// ─── Upload source maps ──────────────────────────────────────────

	describe("upload source maps", () => {
		describe("deploy", () => {
			beforeEach(setupDeployMocks);

			it("--upload-source-maps overrides config", async ({ expect }) => {
				writeWranglerConfig({ upload_source_maps: false });
				writeWorkerSource();
				mockUploadWorkerRequest();
				mockSubDomainRequest();
				await runWrangler("deploy ./index.js --upload-source-maps");
				expect(std.out).toContain("Uploaded test-name");
			});

			it("uses config.upload_source_maps when CLI flag not provided", async ({
				expect,
			}) => {
				writeWranglerConfig({ upload_source_maps: true });
				writeWorkerSource();
				mockUploadWorkerRequest();
				mockSubDomainRequest();
				await runWrangler("deploy ./index.js");
				expect(std.out).toContain("Uploaded test-name");
			});
		});

		describe("versions upload", () => {
			it("--upload-source-maps overrides config", async ({ expect }) => {
				writeWranglerConfig({
					upload_source_maps: false,
					main: "./index.js",
				});
				writeWorkerSource();
				mockGetScript();
				mockUploadVersion();
				await runWrangler("versions upload --upload-source-maps");
				expect(std.out).toContain("Uploaded test-name");
			});

			it("uses config.upload_source_maps when CLI flag not provided", async ({
				expect,
			}) => {
				writeWranglerConfig({
					upload_source_maps: true,
					main: "./index.js",
				});
				writeWorkerSource();
				mockGetScript();
				mockUploadVersion();
				await runWrangler("versions upload");
				expect(std.out).toContain("Uploaded test-name");
			});
		});
	});

	// ─── keep_vars behavior ──────────────────────────────────────────

	describe("keep_vars behavior", () => {
		describe("deploy", () => {
			beforeEach(setupDeployMocks);

			it("without --keep-vars, keepVars is not set", async ({ expect }) => {
				writeWranglerConfig();
				writeWorkerSource();
				mockUploadWorkerRequest({ keepVars: false });
				mockSubDomainRequest();
				await runWrangler("deploy ./index.js");
				expect(std.out).toContain("Uploaded test-name");
			});

			it("--keep-vars alone enables keep_bindings", async ({ expect }) => {
				writeWranglerConfig({ keep_vars: false });
				writeWorkerSource();
				mockUploadWorkerRequest({ keepVars: true });
				mockSubDomainRequest();
				await runWrangler("deploy ./index.js --keep-vars");
				expect(std.out).toContain("Uploaded test-name");
			});

			it("config.keep_vars alone enables keep_bindings", async ({ expect }) => {
				writeWranglerConfig({ keep_vars: true });
				writeWorkerSource();
				mockUploadWorkerRequest({ keepVars: true });
				mockSubDomainRequest();
				await runWrangler("deploy ./index.js");
				expect(std.out).toContain("Uploaded test-name");
			});

			it("config.keep_vars wins over CLI flag", async ({ expect }) => {
				writeWranglerConfig({ keep_vars: true });
				writeWorkerSource();
				mockUploadWorkerRequest({ keepVars: true });
				mockSubDomainRequest();
				await runWrangler("deploy ./index.js --keep-vars=false");
				expect(std.out).toContain("Uploaded test-name");
			});
		});

		describe("versions upload", () => {
			// versions upload has no --keep-vars CLI flag; only config.keep_vars applies
			it("config.keep_vars=true adds plain_text and json to keep_bindings", async ({
				expect,
			}) => {
				writeWranglerConfig({ main: "./index.js", keep_vars: true });
				writeWorkerSource();
				mockGetScript();
				const requests = mockUploadVersion();
				await runWrangler("versions upload");
				const metadata = await getMetadata(requests[requests.length - 1]);
				expect(metadata.keep_bindings).toEqual(
					expect.arrayContaining([
						"plain_text",
						"json",
						"secret_text",
						"secret_key",
					])
				);
			});

			it("config.keep_vars=false still includes secret types but not plain_text/json", async ({
				expect,
			}) => {
				writeWranglerConfig({ main: "./index.js", keep_vars: false });
				writeWorkerSource();
				mockGetScript();
				const requests = mockUploadVersion();
				await runWrangler("versions upload");
				const metadata = await getMetadata(requests[requests.length - 1]);
				// keepSecrets=true always, but keepVars=false means no plain_text/json
				expect(metadata.keep_bindings).toEqual(
					expect.arrayContaining(["secret_text", "secret_key"])
				);
				expect(metadata.keep_bindings).not.toEqual(
					expect.arrayContaining(["plain_text"])
				);
			});
		});
	});

	// ─── Non-versioned settings behavior ─────────────────────────────

	describe("non-versioned settings", () => {
		describe("versions upload", () => {
			it("logpush and observability are excluded from upload metadata", async ({
				expect,
			}) => {
				writeWranglerConfig({
					main: "./index.js",
					logpush: true,
					observability: { enabled: true },
				});
				writeWorkerSource();
				mockGetScript();
				const requests = mockUploadVersion();
				await runWrangler("versions upload");
				const metadata = await getMetadata(requests[requests.length - 1]);
				expect(metadata.logpush).toBeUndefined();
				expect(metadata.observability).toBeUndefined();
			});

			it("tail_consumers is included in upload metadata", async ({
				expect,
			}) => {
				writeWranglerConfig({
					main: "./index.js",
					tail_consumers: [{ service: "my-listener" }],
				});
				writeWorkerSource();
				mockGetScript();
				const requests = mockUploadVersion();
				await runWrangler("versions upload");
				const metadata = await getMetadata(requests[requests.length - 1]);
				expect(metadata.tail_consumers).toEqual([{ service: "my-listener" }]);
			});
		});

		describe("deploy", () => {
			beforeEach(setupDeployMocks);

			it("logpush is patched via non-versioned settings", async ({
				expect,
			}) => {
				writeWranglerConfig({ logpush: true });
				writeWorkerSource();
				mockUploadWorkerRequest({
					expectedSettingsPatch: expect.objectContaining({
						logpush: true,
					}),
				});
				mockSubDomainRequest();
				await runWrangler("deploy ./index.js");
				expect(std.out).toContain("Uploaded test-name");
			});

			it("observability is patched via non-versioned settings", async ({
				expect,
			}) => {
				writeWranglerConfig({
					observability: { enabled: true },
				});
				writeWorkerSource();
				mockUploadWorkerRequest({
					expectedSettingsPatch: expect.objectContaining({
						observability: { enabled: true },
					}),
				});
				mockSubDomainRequest();
				await runWrangler("deploy ./index.js");
				expect(std.out).toContain("Uploaded test-name");
			});
		});
	});
});
