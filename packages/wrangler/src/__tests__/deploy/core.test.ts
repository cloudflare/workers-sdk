/* eslint-disable workers-sdk/no-vitest-import-expect */

import * as fs from "node:fs";
import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { writeWranglerConfig } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import * as TOML from "smol-toml";
import dedent from "ts-dedent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Static } from "../../autoconfig/frameworks/static";
import { getInstalledPackageVersion } from "../../autoconfig/frameworks/utils/packages";
import { runAutoConfig } from "../../autoconfig/run";
import { clearOutputFilePath } from "../../output";
import { NpmPackageManager } from "../../package-manager";
import { writeAuthConfigFile } from "../../user";
import { fetchSecrets } from "../../utils/fetch-secrets";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockAuthDomain } from "../helpers/mock-auth-domain";
import { mockConsoleMethods } from "../helpers/mock-console";
import { clearDialogs, mockConfirm } from "../helpers/mock-dialogs";
import { useMockIsTTY } from "../helpers/mock-istty";
import {
	mockExchangeRefreshTokenForAccessToken,
	mockGetMemberships,
	mockOAuthFlow,
} from "../helpers/mock-oauth-flow";
import { mockUploadWorkerRequest } from "../helpers/mock-upload-worker";
import { mockGetSettings } from "../helpers/mock-worker-settings";
import {
	mockGetWorkerSubdomain,
	mockSubDomainRequest,
	mockUpdateWorkerSubdomain,
} from "../helpers/mock-workers-subdomain";
import {
	createFetchResult,
	msw,
	mswSuccessDeploymentScriptAPI,
	mswSuccessOauthHandlers,
	mswSuccessUserHandlers,
} from "../helpers/msw";
import { mswListNewDeploymentsLatestFull } from "../helpers/msw/handlers/versions";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import { writeWorkerSource } from "../helpers/write-worker-source";
import {
	mockDeploymentsListRequest,
	mockLastDeploymentRequest,
	mockPatchScriptSettings,
	mockPublishRoutesRequest,
	mockServiceScriptData,
} from "./helpers";
import type { OutputEntry } from "../../output";

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
vi.mock("../../autoconfig/c3-vendor/command");

describe("deploy", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();
	const std = mockConsoleMethods();
	const {
		mockOAuthServerCallback,
		mockGrantAccessToken,
		mockDomainUsesAccess,
	} = mockOAuthFlow();

	beforeEach(() => {
		vi.stubGlobal("setTimeout", (fn: () => void) => {
			setImmediate(fn);
		});
		setIsTTY(true);
		mockLastDeploymentRequest();
		mockDeploymentsListRequest();
		mockPatchScriptSettings();
		mockGetSettings();
		msw.use(...mswListNewDeploymentsLatestFull);
		// Pretend all R2 buckets exist for the purposes of deployment testing.
		// Otherwise, wrangler deploy would try to provision them. The provisioning
		// behaviour is tested in provision.test.ts
		msw.use(
			http.get("*/accounts/:accountId/r2/buckets/:bucketName", async () => {
				return HttpResponse.json(createFetchResult({}));
			})
		);
		vi.mocked(fetchSecrets).mockResolvedValue([]);
		vi.mocked(getInstalledPackageVersion).mockReturnValue(undefined);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		clearDialogs();
		clearOutputFilePath();
	});

	it("should output log file with deployment details", async () => {
		vi.stubEnv("WRANGLER_OUTPUT_FILE_DIRECTORY", "output");
		vi.stubEnv("WRANGLER_OUTPUT_FILE_PATH", "");
		writeWorkerSource();
		writeWranglerConfig({
			routes: ["example.com/some-route/*"],
			workers_dev: true,
		});
		mockUploadWorkerRequest();
		mockSubDomainRequest();
		mockGetWorkerSubdomain({ enabled: true });
		mockPublishRoutesRequest({ routes: ["example.com/some-route/*"] });

		await runWrangler("deploy ./index.js");
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Total Upload: xx KiB / gzip: xx KiB
			Worker Startup Time: 100 ms
			Uploaded test-name (TIMINGS)
			Deployed test-name triggers (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			  example.com/some-route/*
			Current Version ID: Galaxy-Class"
		`);
		expect(std.err).toMatchInlineSnapshot(`""`);

		const outputFilePaths = fs.readdirSync("output");

		expect(outputFilePaths.length).toEqual(1);
		expect(outputFilePaths[0]).toMatch(/wrangler-output-.+\.json/);
		const outputFile = fs.readFileSync(
			path.join("output", outputFilePaths[0]),
			"utf8"
		);
		const entries = outputFile
			.split("\n")
			.filter(Boolean)
			.map((e) => JSON.parse(e));

		expect(entries.find((e) => e.type === "deploy")).toMatchObject({
			targets: [
				"https://test-name.test-sub-domain.workers.dev",
				"example.com/some-route/*",
			],
			// Omitting timestamp for matching
			// timestamp: ...
			type: "deploy",
			version: 1,
			version_id: "Galaxy-Class",
			worker_name: "test-name",
			worker_tag: "tag:test-name",
		});
	});

	it("should successfully deploy with CI tag match", async () => {
		vi.stubEnv("WRANGLER_CI_MATCH_TAG", "abc123");
		writeWorkerSource();
		writeWranglerConfig({
			routes: ["example.com/some-route/*"],
			workers_dev: true,
		});
		mockServiceScriptData({
			scriptName: "test-name",
			script: { id: "test-name", tag: "abc123" },
		});
		mockUploadWorkerRequest();
		mockSubDomainRequest();
		mockGetWorkerSubdomain({ enabled: false });
		mockUpdateWorkerSubdomain({ enabled: true });
		mockPublishRoutesRequest({ routes: ["example.com/some-route/*"] });

		await runWrangler("deploy ./index.js");
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Total Upload: xx KiB / gzip: xx KiB
			Worker Startup Time: 100 ms
			Uploaded test-name (TIMINGS)
			Deployed test-name triggers (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			  example.com/some-route/*
			Current Version ID: Galaxy-Class"
		`);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	it("should successfully override name with WRANGLER_CI_OVERRIDE_NAME", async () => {
		vi.stubEnv("WRANGLER_CI_OVERRIDE_NAME", "test-name");
		writeWorkerSource();
		writeWranglerConfig({
			name: "name-to-override",
			workers_dev: true,
		});
		mockServiceScriptData({
			scriptName: "test-name",
			script: { id: "test-name", tag: "abc123" },
		});
		mockUploadWorkerRequest();
		mockSubDomainRequest();
		mockGetWorkerSubdomain({ enabled: false });
		mockUpdateWorkerSubdomain({ enabled: true });

		await runWrangler("deploy ./index.js");
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Total Upload: xx KiB / gzip: xx KiB
			Worker Startup Time: 100 ms
			Uploaded test-name (TIMINGS)
			Deployed test-name triggers (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Version ID: Galaxy-Class"
		`);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	it("should successfully override name with WRANGLER_CI_OVERRIDE_NAME and outputs the correct output file", async () => {
		vi.stubEnv("WRANGLER_OUTPUT_FILE_DIRECTORY", "override-output");
		vi.stubEnv("WRANGLER_OUTPUT_FILE_PATH", "");
		vi.stubEnv("WRANGLER_CI_OVERRIDE_NAME", "test-name");
		writeWorkerSource();
		writeWranglerConfig({
			name: "override-name",
			workers_dev: true,
		});
		mockUploadWorkerRequest();
		mockSubDomainRequest();
		mockGetWorkerSubdomain({ enabled: true });

		await runWrangler("deploy ./index.js --env staging");
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Total Upload: xx KiB / gzip: xx KiB
			Worker Startup Time: 100 ms
			Uploaded test-name (TIMINGS)
			Deployed test-name triggers (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Version ID: Galaxy-Class"
		`);
		expect(std.err).toMatchInlineSnapshot(`""`);

		const outputFilePaths = fs.readdirSync("override-output");

		expect(outputFilePaths.length).toEqual(1);
		expect(outputFilePaths[0]).toMatch(/wrangler-output-.+\.json/);
		const outputFile = fs.readFileSync(
			path.join("override-output", outputFilePaths[0]),
			"utf8"
		);
		const entries = outputFile
			.split("\n")
			.filter(Boolean)
			.map((e) => JSON.parse(e));

		expect(entries.find((e) => e.type === "deploy")).toMatchObject({
			targets: ["https://test-name.test-sub-domain.workers.dev"],
			// Omitting timestamp for matching
			// timestamp: ...
			type: "deploy",
			version: 1,
			version_id: "Galaxy-Class",
			worker_name: "test-name",
			worker_tag: "tag:test-name",
			worker_name_overridden: true,
			wrangler_environment: "staging",
		});
	});

	it("should resolve wrangler.toml relative to the entrypoint", async () => {
		fs.mkdirSync("./some-path/worker", { recursive: true });
		fs.writeFileSync(
			"./some-path/wrangler.toml",
			TOML.stringify({
				name: "test-name",
				compatibility_date: "2022-01-12",
				vars: { xyz: 123 },
			}),
			"utf-8"
		);
		writeWorkerSource({ basePath: "./some-path/worker" });
		mockUploadWorkerRequest({
			expectedBindings: [
				{
					json: 123,
					name: "xyz",
					type: "json",
				},
			],
			expectedCompatibilityDate: "2022-01-12",
		});
		mockSubDomainRequest();
		await runWrangler("deploy ./some-path/worker/index.js");
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Total Upload: xx KiB / gzip: xx KiB
			Worker Startup Time: 100 ms
			Your Worker has access to the following bindings:
			Binding            Resource
			env.xyz (123)      Environment Variable

			Uploaded test-name (TIMINGS)
			Deployed test-name triggers (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Version ID: Galaxy-Class"
		`);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	it("should support wrangler.json", async () => {
		fs.mkdirSync("./my-worker", { recursive: true });
		fs.writeFileSync(
			"./wrangler.json",
			JSON.stringify({
				name: "test-worker",
				compatibility_date: "2024-01-01",
				vars: { xyz: 123 },
			}),
			"utf-8"
		);
		writeWorkerSource({ basePath: "./my-worker" });
		mockUploadWorkerRequest({
			expectedScriptName: "test-worker",
			expectedBindings: [
				{
					json: 123,
					name: "xyz",
					type: "json",
				},
			],
			expectedCompatibilityDate: "2024-01-01",
		});
		mockSubDomainRequest();

		await runWrangler("deploy ./my-worker/index.js");
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Total Upload: xx KiB / gzip: xx KiB
			Worker Startup Time: 100 ms
			Your Worker has access to the following bindings:
			Binding            Resource
			env.xyz (123)      Environment Variable

			Uploaded test-worker (TIMINGS)
			Deployed test-worker triggers (TIMINGS)
			  https://test-worker.test-sub-domain.workers.dev
			Current Version ID: Galaxy-Class"
		`);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	it("should include serialised FormData in debug logs", async () => {
		fs.mkdirSync("./my-worker", { recursive: true });
		fs.writeFileSync(
			"./my-worker/wrangler.toml",
			TOML.stringify({
				name: "test-worker",
				compatibility_date: "2022-01-12",
				vars: { xyz: 123 },
			}),
			"utf-8"
		);
		writeWorkerSource({ basePath: "./my-worker" });
		mockUploadWorkerRequest({
			expectedScriptName: "test-worker",
			expectedBindings: [
				{
					json: 123,
					name: "xyz",
					type: "json",
				},
			],
			expectedCompatibilityDate: "2022-01-12",
		});
		mockSubDomainRequest();

		vi.stubEnv("WRANGLER_LOG", "debug");
		vi.stubEnv("WRANGLER_LOG_SANITIZE", "false");

		await runWrangler("deploy ./my-worker/index.js");
		expect(std.debug).toContain(
			`{"main_module":"index.js","bindings":[{"name":"xyz","type":"json","json":123}],"compatibility_date":"2022-01-12","compatibility_flags":[]}`
		);
	});

	it("should support wrangler.jsonc", async () => {
		fs.mkdirSync("./my-worker", { recursive: true });
		fs.writeFileSync(
			"./wrangler.jsonc",
			JSON.stringify({
				name: "test-worker-jsonc",
				compatibility_date: "2024-01-01",
				vars: { xyz: 123 },
			}),
			"utf-8"
		);
		writeWorkerSource({ basePath: "./my-worker" });
		mockUploadWorkerRequest({
			expectedScriptName: "test-worker-jsonc",
			expectedBindings: [
				{
					json: 123,
					name: "xyz",
					type: "json",
				},
			],
			expectedCompatibilityDate: "2024-01-01",
		});
		mockSubDomainRequest();

		await runWrangler("deploy ./my-worker/index.js");
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Total Upload: xx KiB / gzip: xx KiB
			Worker Startup Time: 100 ms
			Your Worker has access to the following bindings:
			Binding            Resource
			env.xyz (123)      Environment Variable

			Uploaded test-worker-jsonc (TIMINGS)
			Deployed test-worker-jsonc triggers (TIMINGS)
			  https://test-worker-jsonc.test-sub-domain.workers.dev
			Current Version ID: Galaxy-Class"
		`);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	it("should not deploy if there's any other kind of error when checking deployment source", async () => {
		writeWorkerSource();
		writeWranglerConfig();
		mockSubDomainRequest();
		mockUploadWorkerRequest();
		msw.use(...mswSuccessOauthHandlers, ...mswSuccessUserHandlers);
		msw.use(
			http.get("*/accounts/:accountId/workers/services/:scriptName", () => {
				return HttpResponse.json(
					createFetchResult(null, false, [
						{ code: 10000, message: "Authentication error" },
					])
				);
			}),
			http.get(
				"*/accounts/:accountId/workers/deployments/by-script/:scriptTag",
				() => {
					return HttpResponse.json(
						createFetchResult({
							latest: { number: "2" },
						})
					);
				}
			),
			http.get("*/user/tokens/verify", () => {
				return HttpResponse.json(createFetchResult([]));
			})
		);

		await expect(
			runWrangler("deploy index.js")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[APIError: A request to the Cloudflare API (/accounts/some-account-id/workers/services/test-name) failed.]`
		);
		expect(std).toMatchInlineSnapshot(`
			{
			  "debug": "",
			  "err": "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mA request to the Cloudflare API (/accounts/some-account-id/workers/services/test-name) failed.[0m

			  Authentication error [code: 10000]

			",
			  "info": "",
			  "out": "
			 ⛅️ wrangler x.x.x
			──────────────────

			📎 It looks like you are authenticating Wrangler via a custom API token set in an environment variable.
			Please ensure it has the correct permissions for this operation.

			Getting User settings...
			👋 You are logged in with an User API Token, associated with the email user@example.com.
			ℹ️  The API Token is read from the CLOUDFLARE_API_TOKEN environment variable.
			┌─┬─┐
			│ Account Name │ Account ID │
			├─┼─┤
			│ Account One │ account-1 │
			├─┼─┤
			│ Account Two │ account-2 │
			├─┼─┤
			│ Account Three │ account-3 │
			└─┴─┘
			🔓 To see token permissions visit https://dash.cloudflare.com/profile/api-tokens.",
			  "warn": "",
			}
		`);
	});

	it("should error helpfully if pages_build_output_dir is set in wrangler.toml when --x-autoconfig=false", async () => {
		writeWranglerConfig({
			pages_build_output_dir: "public",
			name: "test-name",
		});
		await expect(
			runWrangler("deploy --x-autoconfig=false")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`
			[Error: It looks like you've run a Workers-specific command in a Pages project.
			For Pages, please run \`wrangler pages deploy\` instead.]
		`
		);
	});

	it("should error helpfully if pages_build_output_dir is set in wrangler.toml and --x-autoconfig is provided", async () => {
		mockConfirm({
			text: "Are you sure that you want to proceed?",
			result: true,
		});

		writeWranglerConfig({
			pages_build_output_dir: "public",
			name: "test-name",
		});
		await expect(runWrangler("deploy --x-autoconfig")).rejects.toThrowError();
		expect(std.warn).toContain(
			"It seems that you have run `wrangler deploy` on a Pages project, `wrangler pages deploy` should be used instead."
		);
	});

	it("should attempt to run the autoconfig flow when pages_build_output_dir and (--x-autoconfig is used)", async () => {
		writeWranglerConfig({
			pages_build_output_dir: "public",
			name: "test-name",
		});

		const getDetailsForAutoConfigSpy = vi
			.spyOn(
				await import("../../autoconfig/details"),
				"getDetailsForAutoConfig"
			)
			.mockResolvedValueOnce({
				configured: false,
				projectPath: process.cwd(),
				workerName: "test-name",
				framework: {
					id: "cloudflare-pages",
					name: "Cloudflare Pages",
					autoConfigSupported: false,
					configure: async () => ({ wranglerConfig: {} }),
					isConfigured: () => false,
				},
				outputDir: "public",
				packageManager: NpmPackageManager,
			});

		mockConfirm({
			text: "Are you sure that you want to proceed?",
			options: { defaultValue: false },
			result: false,
		});

		await runWrangler("deploy --x-autoconfig");

		expect(getDetailsForAutoConfigSpy).toHaveBeenCalled();

		expect(std.warn).toContain(
			"It seems that you have run `wrangler deploy` on a Pages project"
		);
	});

	it("in non-interactive mode, attempts to deploy a Pages project when --x-autoconfig is used", async () => {
		setIsTTY(false);
		writeWranglerConfig({
			pages_build_output_dir: "public",
			name: "test-name",
		});

		const getDetailsForAutoConfigSpy = vi
			.spyOn(
				await import("../../autoconfig/details"),
				"getDetailsForAutoConfig"
			)
			.mockResolvedValueOnce({
				configured: false,
				projectPath: process.cwd(),
				workerName: "test-name",
				framework: {
					id: "cloudflare-pages",
					name: "Cloudflare Pages",
					autoConfigSupported: false,
					configure: async () => ({ wranglerConfig: {} }),
					isConfigured: () => false,
				},
				outputDir: "public",
				packageManager: NpmPackageManager,
			});

		// The command will fail later due to missing entry-point, but we can still verify
		// that the deployment of the (Pages) project was attempted
		await expect(runWrangler("deploy --x-autoconfig")).rejects.toThrow();

		expect(getDetailsForAutoConfigSpy).toHaveBeenCalled();

		expect(std.warn).toContain(
			"It seems that you have run `wrangler deploy` on a Pages project"
		);
		expect(std.out).toContain(
			"Using fallback value in non-interactive context: yes"
		);
	});
	describe("output additional script information", () => {
		it("for first party workers, it should print worker information at log level", async () => {
			setIsTTY(false);
			fs.writeFileSync(
				"./wrangler.toml",
				TOML.stringify({
					compatibility_date: "2022-01-12",
					name: "test-name",
					first_party_worker: true,
				}),

				"utf-8"
			);
			writeWorkerSource();
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedType: "esm",
				useOldUploadApi: true,
			});
			mockOAuthServerCallback();

			await runWrangler("deploy ./index");

			expect(std).toMatchInlineSnapshot(`
				{
				  "debug": "",
				  "err": "",
				  "info": "",
				  "out": "
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Worker ID:  abc12345
				Worker ETag:  etag98765
				Worker PipelineHash:  hash9999
				Worker Mutable PipelineID (Development ONLY!): mutableId
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class",
				  "warn": "",
				}
			`);
		});
	});
	describe("authentication", () => {
		mockApiToken({ apiToken: null });

		beforeEach(() => {
			vi.unstubAllGlobals();
		});

		it("drops a user into the login flow if they're unauthenticated", async () => {
			setIsTTY(true);
			writeWranglerConfig();
			writeWorkerSource();
			mockDomainUsesAccess({ usesAccess: false });
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			mockExchangeRefreshTokenForAccessToken({ respondWith: "refreshSuccess" });
			mockOAuthServerCallback("success");
			mockDeploymentsListRequest();

			await expect(runWrangler("deploy index.js")).resolves.toBeUndefined();

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Attempting to login via OAuth...
				Opening a link in your default browser: https://dash.cloudflare.com/oauth2/auth?response_type=code&client_id=54d11594-84e4-41aa-b438-e81b8fa78ee7&redirect_uri=http%3A%2F%2Flocalhost%3A8976%2Foauth%2Fcallback&scope=account%3Aread%20user%3Aread%20workers%3Awrite%20workers_kv%3Awrite%20workers_routes%3Awrite%20workers_scripts%3Awrite%20workers_tail%3Aread%20d1%3Awrite%20pages%3Awrite%20zone%3Aread%20ssl_certs%3Awrite%20ai%3Awrite%20ai-search%3Awrite%20ai-search%3Arun%20queues%3Awrite%20pipelines%3Awrite%20secrets_store%3Awrite%20containers%3Awrite%20cloudchamber%3Awrite%20connectivity%3Aadmin%20offline_access&state=MOCK_STATE_PARAM&code_challenge=MOCK_CODE_CHALLENGE&code_challenge_method=S256
				Successfully logged in.
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		describe("with an alternative auth domain", () => {
			mockAuthDomain({ domain: "dash.staging.cloudflare.com" });

			it("drops a user into the login flow if they're unauthenticated", async () => {
				writeWranglerConfig();
				writeWorkerSource();
				mockDomainUsesAccess({
					usesAccess: false,
					domain: "dash.staging.cloudflare.com",
				});
				mockSubDomainRequest();
				mockUploadWorkerRequest();
				mockExchangeRefreshTokenForAccessToken({
					respondWith: "refreshSuccess",
				});
				const accessTokenRequest = mockGrantAccessToken({
					respondWith: "ok",
					domain: "dash.staging.cloudflare.com",
				});
				mockOAuthServerCallback("success");
				mockDeploymentsListRequest();

				await expect(runWrangler("deploy index.js")).resolves.toBeUndefined();

				expect(accessTokenRequest.actual).toEqual(accessTokenRequest.expected);

				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Attempting to login via OAuth...
					Opening a link in your default browser: https://dash.staging.cloudflare.com/oauth2/auth?response_type=code&client_id=54d11594-84e4-41aa-b438-e81b8fa78ee7&redirect_uri=http%3A%2F%2Flocalhost%3A8976%2Foauth%2Fcallback&scope=account%3Aread%20user%3Aread%20workers%3Awrite%20workers_kv%3Awrite%20workers_routes%3Awrite%20workers_scripts%3Awrite%20workers_tail%3Aread%20d1%3Awrite%20pages%3Awrite%20zone%3Aread%20ssl_certs%3Awrite%20ai%3Awrite%20ai-search%3Awrite%20ai-search%3Arun%20queues%3Awrite%20pipelines%3Awrite%20secrets_store%3Awrite%20containers%3Awrite%20cloudchamber%3Awrite%20connectivity%3Aadmin%20offline_access&state=MOCK_STATE_PARAM&code_challenge=MOCK_CODE_CHALLENGE&code_challenge_method=S256
					Successfully logged in.
					Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});
		});

		it("warns a user when they're authenticated with an API token in wrangler config file", async () => {
			writeWranglerConfig();
			writeWorkerSource();
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			writeAuthConfigFile({
				api_token: "some-api-token",
			});

			await expect(runWrangler("deploy index.js")).resolves.toBeUndefined();

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);

			// The current working directory is replaced with `<cwd>` to make the snapshot consistent across environments
			// But since the actual working directory could be a long string on some operating systems it is possible that the string gets wrapped to a new line.
			// To avoid failures across different environments, we remove any newline before `<cwd>` in the snapshot.
			expect(std.warn.replaceAll(/from[ \r\n]+<cwd>/g, "from <cwd>"))
				.toMatchInlineSnapshot(`
					"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mIt looks like you have used Wrangler v1's \`config\` command to login with an API token[0m

					  from <cwd>/home/.config/.wrangler/config/default.toml.
					  This is no longer supported in the current version of Wrangler.
					  If you wish to authenticate via an API token then please set the \`CLOUDFLARE_API_TOKEN\`
					  environment variable.

					"
				`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		describe("non-TTY", () => {
			it("should not throw an error in non-TTY if 'CLOUDFLARE_API_TOKEN' & 'account_id' are in scope", async () => {
				vi.stubEnv("CLOUDFLARE_API_TOKEN", "123456789");
				setIsTTY(false);
				writeWranglerConfig({
					account_id: "some-account-id",
				});
				writeWorkerSource();
				mockSubDomainRequest();
				mockUploadWorkerRequest();
				mockOAuthServerCallback();

				await runWrangler("deploy index.js");

				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should not throw an error if 'CLOUDFLARE_ACCOUNT_ID' & 'CLOUDFLARE_API_TOKEN' are in scope", async () => {
				vi.stubEnv("CLOUDFLARE_API_TOKEN", "hunter2");
				vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "some-account-id");
				setIsTTY(false);
				writeWranglerConfig();
				writeWorkerSource();
				mockSubDomainRequest();
				mockUploadWorkerRequest();
				mockOAuthServerCallback();
				mockGetMemberships([]);

				await runWrangler("deploy index.js");

				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should throw an error in non-TTY & there is more than one account associated with API token", async () => {
				setIsTTY(false);
				vi.stubEnv("CLOUDFLARE_API_TOKEN", "hunter2");
				vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "");
				writeWranglerConfig({
					account_id: undefined,
				});
				writeWorkerSource();
				mockSubDomainRequest();
				mockUploadWorkerRequest();
				mockOAuthServerCallback();
				mockGetMemberships([
					{ id: "IG-88", account: { id: "1701", name: "enterprise" } },
					{ id: "R2-D2", account: { id: "nx01", name: "enterprise-nx" } },
				]);

				await expect(runWrangler("deploy index.js")).rejects
					.toMatchInlineSnapshot(`
					[Error: More than one account available but unable to select one in non-interactive mode.
					Please set the appropriate \`account_id\` in your Wrangler configuration file or assign it to the \`CLOUDFLARE_ACCOUNT_ID\` environment variable.
					Available accounts are (\`<name>\`: \`<account_id>\`):
					  \`(redacted)\`: \`1701\`
					  \`(redacted)\`: \`nx01\`]
				`);
			});

			it("should throw error in non-TTY if 'CLOUDFLARE_API_TOKEN' is missing", async () => {
				setIsTTY(false);
				writeWranglerConfig({
					account_id: undefined,
				});
				vi.stubEnv("CLOUDFLARE_API_TOKEN", "");
				vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "badwolf");
				writeWorkerSource();
				mockSubDomainRequest();
				mockUploadWorkerRequest();
				mockOAuthServerCallback();
				mockGetMemberships([
					{ id: "IG-88", account: { id: "1701", name: "enterprise" } },
					{ id: "R2-D2", account: { id: "nx01", name: "enterprise-nx" } },
				]);

				await expect(runWrangler("deploy index.js")).rejects.toThrowError();

				expect(std.err).toMatchInlineSnapshot(`
			          "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mIn a non-interactive environment, it's necessary to set a CLOUDFLARE_API_TOKEN environment variable for wrangler to work. Please go to https://developers.cloudflare.com/fundamentals/api/get-started/create-token/ for instructions on how to create an api token, and assign its value to CLOUDFLARE_API_TOKEN.[0m

			          "
		        `);
			});
			it("should throw error with no account ID provided and no members retrieved", async () => {
				setIsTTY(false);
				writeWranglerConfig({
					account_id: undefined,
				});
				vi.stubEnv("CLOUDFLARE_API_TOKEN", "picard");
				vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "");
				writeWorkerSource();
				mockSubDomainRequest();
				mockUploadWorkerRequest();
				mockOAuthServerCallback();
				mockGetMemberships([]);

				await expect(runWrangler("deploy index.js")).rejects.toThrowError();

				expect(std.err).toMatchInlineSnapshot(`
					"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mFailed to automatically retrieve account IDs for the logged in user.[0m

					  In a non-interactive environment, it is mandatory to specify an account ID, either by assigning
					  its value to CLOUDFLARE_ACCOUNT_ID, or as \`account_id\` in your Wrangler configuration file.

					"
				`);
			});
		});
	});
	describe("warnings", () => {
		it("should warn user when worker was last deployed from api", async () => {
			msw.use(...mswSuccessDeploymentScriptAPI);
			writeWranglerConfig();
			writeWorkerSource();
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			mockConfirm({
				text: "Would you like to continue?",
				result: false,
			});

			await runWrangler("deploy ./index");

			expect(std.warn).toMatchInlineSnapshot(`
			"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mYou are about to publish a Workers Service that was last updated via the script API.[0m

			  Edits that have been made via the script API will be overridden by your local code and config.

			"
		`);
		});

		it("should warn user when additional properties are passed to a services config", async () => {
			writeWranglerConfig({
				d1_databases: [
					{
						binding: "MY_DB",
						database_name: "my-database",
						database_id: "xxxxxxxxx",
						// @ts-expect-error Depending on a users editor setup a type error in the toml will not be displayed.
						// This test is checking that warnings for type errors are displayed
						tail_consumers: [{ service: "<TAIL_WORKER_NAME>" }],
					},
				],
			});
			writeWorkerSource();
			mockSubDomainRequest();
			mockUploadWorkerRequest();

			await runWrangler("deploy ./index");

			expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

				    - Unexpected fields found in d1_databases[0] field: "tail_consumers"

				"
			`);
		});

		it("should log esbuild warnings", async () => {
			writeWranglerConfig();
			fs.writeFileSync(
				"index.js",
				dedent/* javascript */ `
					export default {
						fetch() {
							return
							new Response(dep);
						}
					}
				`
			);
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			await runWrangler("deploy ./index");

			expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe following expression is not returned because of an automatically-inserted semicolon[0m [semicolon-after-return]

				    index.js:3:8:
				[37m      3 │     return[32m[37m
				        ╵           [32m^[0m

				"
			`);
		});
	});
	describe("environments", () => {
		it("should use legacy environments by default", async () => {
			writeWranglerConfig({ env: { "some-env": {} } });
			writeWorkerSource();
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				env: "some-env",
				useServiceEnvironments: false,
			});

			await runWrangler("deploy index.js --env some-env");
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name-some-env (TIMINGS)
				Deployed test-name-some-env triggers (TIMINGS)
				  https://test-name-some-env.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		describe("legacy", () => {
			it("uses the script name when no environment is specified", async () => {
				writeWranglerConfig();
				writeWorkerSource();
				mockSubDomainRequest();
				mockUploadWorkerRequest({
					useServiceEnvironments: false,
				});

				await runWrangler("deploy index.js --legacy-env true");
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});

			it("appends the environment name when provided, and there is associated config", async () => {
				writeWranglerConfig({ env: { "some-env": {} } });
				writeWorkerSource();
				mockSubDomainRequest();
				mockUploadWorkerRequest({
					env: "some-env",
					useServiceEnvironments: false,
				});

				await runWrangler("deploy index.js --env some-env --legacy-env true");
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Uploaded test-name-some-env (TIMINGS)
					Deployed test-name-some-env triggers (TIMINGS)
					  https://test-name-some-env.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});

			it("appends the environment name when provided (with a warning), if there are no configured environments", async () => {
				writeWranglerConfig({});
				writeWorkerSource();
				mockSubDomainRequest();
				mockUploadWorkerRequest({
					env: "some-env",
					useServiceEnvironments: false,
				});

				await runWrangler("deploy index.js --env some-env --legacy-env true");
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Uploaded test-name-some-env (TIMINGS)
					Deployed test-name-some-env triggers (TIMINGS)
					  https://test-name-some-env.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`
					"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

					    - No environment found in configuration with name "some-env".
					      Before using \`--env=some-env\` there should be an equivalent environment section in the
					  configuration.

					      Consider adding an environment configuration section to the wrangler.toml file:
					      \`\`\`
					      [env.some-env]
					      \`\`\`


					"
				`);
			});

			it("should throw an error when an environment name when provided, which doesn't match those in the config", async () => {
				writeWranglerConfig({ env: { "other-env": {} } });
				writeWorkerSource();
				mockSubDomainRequest();
				await expect(
					runWrangler("deploy index.js --env some-env --legacy-env true")
				).rejects.toThrowErrorMatchingInlineSnapshot(`
					[Error: Processing wrangler.toml configuration:
					  - No environment found in configuration with name "some-env".
					    Before using \`--env=some-env\` there should be an equivalent environment section in the configuration.
					    The available configured environment names are: ["other-env"]

					    Consider adding an environment configuration section to the wrangler.toml file:
					    \`\`\`
					    [env.some-env]
					    \`\`\`
					]
				`);
			});

			it("should allow --env and --name to be used together", async () => {
				writeWranglerConfig({ env: { "some-env": {} } });
				writeWorkerSource();
				mockSubDomainRequest();
				mockUploadWorkerRequest({
					env: "some-env",
					expectedScriptName: "voyager",
					useServiceEnvironments: false,
				});
				await runWrangler(
					"deploy index.js --name voyager --env some-env --legacy-env true"
				);
			});
		});

		describe("services", () => {
			it("uses the script name when no environment is specified", async () => {
				writeWranglerConfig();
				writeWorkerSource();
				mockSubDomainRequest();
				mockUploadWorkerRequest({
					useServiceEnvironments: true,
				});

				await runWrangler("deploy index.js --legacy-env false");
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`
					"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

					    - Service environments are deprecated, and will be removed in the future. DO NOT USE IN
					  PRODUCTION.

					"
				`);
			});

			it("publishes as an environment when provided", async () => {
				writeWranglerConfig({ env: { "some-env": {} } });
				writeWorkerSource();
				mockSubDomainRequest();
				mockUploadWorkerRequest({
					env: "some-env",
					useServiceEnvironments: true,
					useOldUploadApi: true,
				});

				await runWrangler("deploy index.js --env some-env --legacy-env false");

				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Uploaded test-name (some-env) (TIMINGS)
					Deployed test-name (some-env) triggers (TIMINGS)
					  https://some-env.test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`
					"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

					    - Service environments are deprecated, and will be removed in the future. DO NOT USE IN
					  PRODUCTION.

					"
				`);
			});
		});
	});

	it("should resolve wrangler.toml relative to the entrypoint", async () => {
		fs.mkdirSync("./some-path/worker", { recursive: true });
		fs.writeFileSync(
			"./some-path/wrangler.toml",
			TOML.stringify({
				name: "test-name",
				compatibility_date: "2022-01-12",
				vars: { xyz: 123 },
			}),
			"utf-8"
		);
		writeWorkerSource({ basePath: "./some-path/worker" });
		mockUploadWorkerRequest({
			expectedBindings: [
				{
					json: 123,
					name: "xyz",
					type: "json",
				},
			],
			expectedCompatibilityDate: "2022-01-12",
		});
		mockSubDomainRequest();
		await runWrangler("deploy ./some-path/worker/index.js");
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Total Upload: xx KiB / gzip: xx KiB
			Worker Startup Time: 100 ms
			Your Worker has access to the following bindings:
			Binding            Resource
			env.xyz (123)      Environment Variable

			Uploaded test-name (TIMINGS)
			Deployed test-name triggers (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Version ID: Galaxy-Class"
		`);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	it("should output a deploy and an autoconfig output entry to WRANGLER_OUTPUT_FILE_PATH if autoconfig run", async () => {
		const outputFile = "./output.json";

		vi.spyOn(
			await import("../../autoconfig/details"),
			"getDetailsForAutoConfig"
		).mockResolvedValueOnce({
			configured: false,
			framework: new Static({ id: "static", name: "Static" }),
			workerName: "my-site",
			projectPath: ".",
			outputDir: "./public",
			packageManager: NpmPackageManager,
		});

		vi.mocked(runAutoConfig).mockImplementation(async () => {
			const wranglerConfig = {
				name: "my-site",
				compatibility_date: "2025-12-02",
				assets: {
					directory: ".",
				},
			};

			writeWranglerConfig(wranglerConfig);

			return {
				scripts: {
					build: "npm run build-my-static-site",
				},
				wranglerInstall: true,
				wranglerConfig,
				outputDir: "public",
			};
		});

		await runWrangler("deploy --x-autoconfig --dry-run", {
			...process.env,
			WRANGLER_OUTPUT_FILE_PATH: outputFile,
		});

		const outputEntries = (await readFile(outputFile, "utf8"))
			.split("\n")
			.filter(Boolean)
			.map((line) => JSON.parse(line)) as OutputEntry[];

		expect(outputEntries).toContainEqual(
			expect.objectContaining({ type: "deploy" })
		);

		const autoconfigOutputEntry = outputEntries.find(
			(obj) => obj.type === "autoconfig"
		);
		expect(autoconfigOutputEntry?.summary).toMatchInlineSnapshot(`
			{
			  "outputDir": "public",
			  "scripts": {
			    "build": "npm run build-my-static-site",
			  },
			  "wranglerConfig": {
			    "assets": {
			      "directory": ".",
			    },
			    "compatibility_date": "2025-12-02",
			    "name": "my-site",
			  },
			  "wranglerInstall": true,
			}
		`);
	});
});
