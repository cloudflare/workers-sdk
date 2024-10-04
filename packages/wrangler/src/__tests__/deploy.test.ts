import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { randomFillSync } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as TOML from "@iarna/toml";
import { sync } from "command-exists";
import * as esbuild from "esbuild";
import { http, HttpResponse } from "msw";
import dedent from "ts-dedent";
import { File } from "undici";
import { vi } from "vitest";
import {
	printBundleSize,
	printOffendingDependencies,
} from "../deployment-bundle/bundle-reporter";
import { writeAuthConfigFile } from "../user";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockAuthDomain } from "./helpers/mock-auth-domain";
import { mockConsoleMethods } from "./helpers/mock-console";
import { clearDialogs, mockConfirm } from "./helpers/mock-dialogs";
import { mockGetZoneFromHostRequest } from "./helpers/mock-get-zone-from-host";
import { useMockIsTTY } from "./helpers/mock-istty";
import { mockCollectKnownRoutesRequest } from "./helpers/mock-known-routes";
import { mockKeyListRequest } from "./helpers/mock-kv";
import {
	mockExchangeRefreshTokenForAccessToken,
	mockGetMemberships,
	mockOAuthFlow,
} from "./helpers/mock-oauth-flow";
import { mockUploadWorkerRequest } from "./helpers/mock-upload-worker";
import { mockSubDomainRequest } from "./helpers/mock-workers-subdomain";
import {
	createFetchResult,
	msw,
	mswSuccessDeployments,
	mswSuccessDeploymentScriptAPI,
	mswSuccessDeploymentScriptMetadata,
	mswSuccessOauthHandlers,
	mswSuccessUserHandlers,
} from "./helpers/msw";
import { mswListNewDeploymentsLatestFull } from "./helpers/msw/handlers/versions";
import { normalizeString } from "./helpers/normalize";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import { writeWorkerSource } from "./helpers/write-worker-source";
import { writeWranglerToml } from "./helpers/write-wrangler-toml";
import type { AssetManifest } from "../assets";
import type { Config } from "../config";
import type { CustomDomain, CustomDomainChangeset } from "../deploy/deploy";
import type { KVNamespaceInfo } from "../kv/helpers";
import type {
	PostQueueBody,
	PostTypedConsumerBody,
	QueueResponse,
} from "../queues/client";
import type { FormData } from "undici";
import type { Mock } from "vitest";

vi.mock("command-exists");

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
		msw.use(...mswListNewDeploymentsLatestFull);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		clearDialogs();
	});

	it("should output log file with deployment details", async () => {
		vi.stubEnv("WRANGLER_OUTPUT_FILE_DIRECTORY", "output");
		vi.stubEnv("WRANGLER_OUTPUT_FILE_PATH", "");
		writeWorkerSource();
		writeWranglerToml({
			routes: ["example.com/some-route/*"],
			workers_dev: true,
		});
		mockSubDomainRequest();
		mockUploadWorkerRequest();
		mockUpdateWorkerRequest({ enabled: false });
		mockPublishRoutesRequest({ routes: ["example.com/some-route/*"] });

		await runWrangler("deploy ./index.js");
		expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
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
		writeWranglerToml({
			routes: ["example.com/some-route/*"],
			workers_dev: true,
		});
		mockServiceScriptData({
			scriptName: "test-name",
			script: { id: "test-name", tag: "abc123" },
		});
		mockSubDomainRequest();
		mockUploadWorkerRequest();
		mockUpdateWorkerRequest({ enabled: false });
		mockPublishRoutesRequest({ routes: ["example.com/some-route/*"] });

		await runWrangler("deploy ./index.js");
		expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Worker Startup Time: 100 ms
			Uploaded test-name (TIMINGS)
			Deployed test-name triggers (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			  example.com/some-route/*
			Current Version ID: Galaxy-Class"
		`);
		expect(std.err).toMatchInlineSnapshot(`""`);
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
			"Total Upload: xx KiB / gzip: xx KiB
			Worker Startup Time: 100 ms
			Your worker has access to the following bindings:
			- Vars:
			  - xyz: 123
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

		await runWrangler("deploy ./my-worker/index.js --experimental-json-config");
		expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Worker Startup Time: 100 ms
			Your worker has access to the following bindings:
			- Vars:
			  - xyz: 123
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

		await runWrangler("deploy ./my-worker/index.js --experimental-json-config");
		expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Worker Startup Time: 100 ms
			Your worker has access to the following bindings:
			- Vars:
			  - xyz: 123
			Uploaded test-worker-jsonc (TIMINGS)
			Deployed test-worker-jsonc triggers (TIMINGS)
			  https://test-worker-jsonc.test-sub-domain.workers.dev
			Current Version ID: Galaxy-Class"
		`);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	it("should not deploy if there's any other kind of error when checking deployment source", async () => {
		writeWorkerSource();
		writeWranglerToml();
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
			)
		);

		await expect(
			runWrangler("deploy index.js")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[APIError: A request to the Cloudflare API (/accounts/some-account-id/workers/services/test-name) failed.]`
		);
		expect(std.out).toMatchInlineSnapshot(`
		"
		[31mX [41;31m[[41;97mERROR[41;31m][0m [1mA request to the Cloudflare API (/accounts/some-account-id/workers/services/test-name) failed.[0m

		  Authentication error [code: 10000]


		📎 It looks like you are authenticating Wrangler via a custom API token set in an environment variable.
		Please ensure it has the correct permissions for this operation.

		Getting User settings...
		ℹ️  The API Token is read from the CLOUDFLARE_API_TOKEN in your environment.
		👋 You are logged in with an API Token, associated with the email user@example.com.
		┌───────────────┬────────────┐
		│ Account Name  │ Account ID │
		├───────────────┼────────────┤
		│ Account One   │ account-1  │
		├───────────────┼────────────┤
		│ Account Two   │ account-2  │
		├───────────────┼────────────┤
		│ Account Three │ account-3  │
		└───────────────┴────────────┘
		🔓 To see token permissions visit https://dash.cloudflare.com/profile/api-tokens."
	`);
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
				Object {
				  "debug": "",
				  "err": "",
				  "info": "",
				  "out": "Total Upload: xx KiB / gzip: xx KiB
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
			writeWranglerToml();
			writeWorkerSource();
			mockDomainUsesAccess({ usesAccess: false });
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			mockExchangeRefreshTokenForAccessToken({ respondWith: "refreshSuccess" });
			mockOAuthServerCallback("success");
			mockDeploymentsListRequest();

			await expect(runWrangler("deploy index.js")).resolves.toBeUndefined();

			expect(std.out).toMatchInlineSnapshot(`
				"Attempting to login via OAuth...
				Opening a link in your default browser: https://dash.cloudflare.com/oauth2/auth?response_type=code&client_id=54d11594-84e4-41aa-b438-e81b8fa78ee7&redirect_uri=http%3A%2F%2Flocalhost%3A8976%2Foauth%2Fcallback&scope=account%3Aread%20user%3Aread%20workers%3Awrite%20workers_kv%3Awrite%20workers_routes%3Awrite%20workers_scripts%3Awrite%20workers_tail%3Aread%20d1%3Awrite%20pages%3Awrite%20zone%3Aread%20ssl_certs%3Awrite%20ai%3Awrite%20queues%3Awrite%20pipelines%3Awrite%20offline_access&state=MOCK_STATE_PARAM&code_challenge=MOCK_CODE_CHALLENGE&code_challenge_method=S256
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
				writeWranglerToml();
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
					"Attempting to login via OAuth...
					Opening a link in your default browser: https://dash.staging.cloudflare.com/oauth2/auth?response_type=code&client_id=54d11594-84e4-41aa-b438-e81b8fa78ee7&redirect_uri=http%3A%2F%2Flocalhost%3A8976%2Foauth%2Fcallback&scope=account%3Aread%20user%3Aread%20workers%3Awrite%20workers_kv%3Awrite%20workers_routes%3Awrite%20workers_scripts%3Awrite%20workers_tail%3Aread%20d1%3Awrite%20pages%3Awrite%20zone%3Aread%20ssl_certs%3Awrite%20ai%3Awrite%20queues%3Awrite%20pipelines%3Awrite%20offline_access&state=MOCK_STATE_PARAM&code_challenge=MOCK_CODE_CHALLENGE&code_challenge_method=S256
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
			writeWranglerToml();
			writeWorkerSource();
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			writeAuthConfigFile({
				api_token: "some-api-token",
			});

			await expect(runWrangler("deploy index.js")).resolves.toBeUndefined();

			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.warn).toMatchInlineSnapshot(`
			"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mIt looks like you have used Wrangler v1's \`config\` command to login with an API token.[0m

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
				writeWranglerToml({
					account_id: "some-account-id",
				});
				writeWorkerSource();
				mockSubDomainRequest();
				mockUploadWorkerRequest();
				mockOAuthServerCallback();

				await runWrangler("deploy index.js");

				expect(std.out).toMatchInlineSnapshot(`
					"Total Upload: xx KiB / gzip: xx KiB
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
				writeWranglerToml();
				writeWorkerSource();
				mockSubDomainRequest();
				mockUploadWorkerRequest();
				mockOAuthServerCallback();
				mockGetMemberships([]);

				await runWrangler("deploy index.js");

				expect(std.out).toMatchInlineSnapshot(`
					"Total Upload: xx KiB / gzip: xx KiB
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
				writeWranglerToml({
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
					Please set the appropriate \`account_id\` in your \`wrangler.toml\` file.
					Available accounts are (\`<name>\`: \`<account_id>\`):
					  \`enterprise\`: \`1701\`
					  \`enterprise-nx\`: \`nx01\`]
				`);
			});

			it("should throw error in non-TTY if 'CLOUDFLARE_API_TOKEN' is missing", async () => {
				setIsTTY(false);
				writeWranglerToml({
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
				writeWranglerToml({
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
			            its value to CLOUDFLARE_ACCOUNT_ID, or as \`account_id\` in your \`wrangler.toml\` file.

			          "
		        `);
			});
		});
	});

	describe("warnings", () => {
		it("should warn user when worker was last deployed from api", async () => {
			msw.use(...mswSuccessDeploymentScriptAPI);
			writeWranglerToml();
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
			writeWranglerToml({
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

			    - Unexpected fields found in d1_databases[0] field: \\"tail_consumers\\"

			"
		`);
		});

		it("should log esbuild warnings", async () => {
			writeWranglerToml();
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
			writeWranglerToml({ env: { "some-env": {} } });
			writeWorkerSource();
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				env: "some-env",
				legacyEnv: true,
			});

			await runWrangler("deploy index.js --env some-env");
			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
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
				writeWranglerToml();
				writeWorkerSource();
				mockSubDomainRequest();
				mockUploadWorkerRequest({
					legacyEnv: true,
				});

				await runWrangler("deploy index.js --legacy-env true");
				expect(std.out).toMatchInlineSnapshot(`
					"Total Upload: xx KiB / gzip: xx KiB
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
				writeWranglerToml({ env: { "some-env": {} } });
				writeWorkerSource();
				mockSubDomainRequest();
				mockUploadWorkerRequest({
					env: "some-env",
					legacyEnv: true,
				});

				await runWrangler("deploy index.js --env some-env --legacy-env true");
				expect(std.out).toMatchInlineSnapshot(`
					"Total Upload: xx KiB / gzip: xx KiB
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
				writeWranglerToml({});
				writeWorkerSource();
				mockSubDomainRequest();
				mockUploadWorkerRequest({
					env: "some-env",
					legacyEnv: true,
				});

				await runWrangler("deploy index.js --env some-env --legacy-env true");
				expect(std.out).toMatchInlineSnapshot(`
					"Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Uploaded test-name-some-env (TIMINGS)
					Deployed test-name-some-env triggers (TIMINGS)
					  https://test-name-some-env.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`
			"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

			    - No environment found in configuration with name \\"some-env\\".
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
				writeWranglerToml({ env: { "other-env": {} } });
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

			it("should throw an error w/ helpful message when using --env --name", async () => {
				writeWranglerToml({ env: { "some-env": {} } });
				writeWorkerSource();
				mockSubDomainRequest();
				await runWrangler(
					"deploy index.js --name voyager --env some-env --legacy-env true"
				).catch((err) =>
					expect(err).toMatchInlineSnapshot(`
						[Error: In legacy environment mode you cannot use --name and --env together. If you want to specify a Worker name for a specific environment you can add the following to your wrangler.toml config:
						    [env.some-env]
						    name = "voyager"
						    ]
					`)
				);
			});
		});

		describe("services", () => {
			it("uses the script name when no environment is specified", async () => {
				writeWranglerToml();
				writeWorkerSource();
				mockSubDomainRequest();
				mockUploadWorkerRequest({
					legacyEnv: false,
				});

				await runWrangler("deploy index.js --legacy-env false");
				expect(std.out).toMatchInlineSnapshot(`
					"Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`
			"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

			    - Experimental: Service environments are in beta, and their behaviour is guaranteed to change in
			  the future. DO NOT USE IN PRODUCTION.

			"
		`);
			});

			it("publishes as an environment when provided", async () => {
				writeWranglerToml({ env: { "some-env": {} } });
				writeWorkerSource();
				mockSubDomainRequest();
				mockUploadWorkerRequest({
					env: "some-env",
					legacyEnv: false,
					useOldUploadApi: true,
				});

				await runWrangler("deploy index.js --env some-env --legacy-env false");
				expect(std.out).toMatchInlineSnapshot(`
					"Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Uploaded test-name (some-env) (TIMINGS)
					Deployed test-name (some-env) triggers (TIMINGS)
					  https://some-env.test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`
			"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

			    - Experimental: Service environments are in beta, and their behaviour is guaranteed to change in
			  the future. DO NOT USE IN PRODUCTION.

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
			"Total Upload: xx KiB / gzip: xx KiB
			Worker Startup Time: 100 ms
			Your worker has access to the following bindings:
			- Vars:
			  - xyz: 123
			Uploaded test-name (TIMINGS)
			Deployed test-name triggers (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Version ID: Galaxy-Class"
		`);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	describe("routes", () => {
		it("should deploy the worker to a route", async () => {
			writeWranglerToml({
				routes: ["example.com/some-route/*"],
			});
			writeWorkerSource();
			mockUpdateWorkerRequest({ enabled: false });
			mockUploadWorkerRequest({ expectedType: "esm" });
			mockPublishRoutesRequest({ routes: ["example.com/some-route/*"] });
			await runWrangler("deploy ./index");
		});

		it("should deploy with an empty string route", async () => {
			writeWranglerToml({
				route: "",
			});
			writeWorkerSource();
			mockUpdateWorkerRequest({ enabled: false });
			mockUploadWorkerRequest({ expectedType: "esm" });
			mockSubDomainRequest();
			mockPublishRoutesRequest({ routes: [] });
			await runWrangler("deploy ./index");
			expect(std).toMatchInlineSnapshot(`
				Object {
				  "debug": "",
				  "err": "",
				  "info": "",
				  "out": "Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class",
				  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

				    - The \\"route\\" field in your configuration is an empty string and will be ignored.
				      Please remove the \\"route\\" field from your configuration.

				",
				}
			`);
		});
		it("should deploy to a route with a pattern/{zone_id|zone_name} combo", async () => {
			writeWranglerToml({
				routes: [
					"some-example.com/some-route/*",
					{ pattern: "*a-boring-website.com", zone_id: "54sdf7fsda" },
					{
						pattern: "*another-boring-website.com",
						zone_name: "some-zone.com",
					},
					{ pattern: "example.com/some-route/*", zone_id: "JGHFHG654gjcj" },
					"more-examples.com/*",
				],
			});
			writeWorkerSource();
			mockUpdateWorkerRequest({ enabled: false });
			mockUploadWorkerRequest({ expectedType: "esm" });
			mockPublishRoutesRequest({
				routes: [
					"some-example.com/some-route/*",
					{ pattern: "*a-boring-website.com", zone_id: "54sdf7fsda" },
					{
						pattern: "*another-boring-website.com",
						zone_name: "some-zone.com",
					},
					{ pattern: "example.com/some-route/*", zone_id: "JGHFHG654gjcj" },
					"more-examples.com/*",
				],
			});
			await runWrangler("deploy ./index");
			expect(std).toMatchInlineSnapshot(`
				Object {
				  "debug": "",
				  "err": "",
				  "info": "",
				  "out": "Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  some-example.com/some-route/*
				  *a-boring-website.com (zone id: 54sdf7fsda)
				  *another-boring-website.com (zone name: some-zone.com)
				  example.com/some-route/* (zone id: JGHFHG654gjcj)
				  more-examples.com/*
				Current Version ID: Galaxy-Class",
				  "warn": "",
				}
			`);
		});

		it("should deploy to a route with a SaaS domain", async () => {
			writeWranglerToml({
				workers_dev: false,
				routes: [
					{
						pattern: "partner.com/*",
						zone_name: "owned-zone.com",
					},
				],
			});
			writeWorkerSource();
			mockUpdateWorkerRequest({ enabled: false });
			mockUploadWorkerRequest({ available_on_subdomain: false });
			mockGetZones("owned-zone.com", [{ id: "owned-zone-id-1" }]);
			mockGetWorkerRoutes("owned-zone-id-1");
			mockPublishRoutesRequest({
				routes: [
					{
						pattern: "partner.com/*",
						zone_name: "owned-zone.com",
					},
				],
			});
			await runWrangler("deploy ./index");
			expect(std).toMatchInlineSnapshot(`
				Object {
				  "debug": "",
				  "err": "",
				  "info": "",
				  "out": "Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  partner.com/* (zone name: owned-zone.com)
				Current Version ID: Galaxy-Class",
				  "warn": "",
				}
			`);
		});

		it("should deploy to a route with a SaaS subdomain", async () => {
			writeWranglerToml({
				workers_dev: false,
				routes: [
					{
						pattern: "subdomain.partner.com/*",
						zone_name: "owned-zone.com",
					},
				],
			});
			writeWorkerSource();
			mockUpdateWorkerRequest({ enabled: false });
			mockUploadWorkerRequest({ available_on_subdomain: false });
			mockGetZones("owned-zone.com", [{ id: "owned-zone-id-1" }]);
			mockGetWorkerRoutes("owned-zone-id-1");
			mockPublishRoutesRequest({
				routes: [
					{
						pattern: "subdomain.partner.com/*",
						zone_name: "owned-zone.com",
					},
				],
			});
			await runWrangler("deploy ./index");
			expect(std).toMatchInlineSnapshot(`
				Object {
				  "debug": "",
				  "err": "",
				  "info": "",
				  "out": "Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  subdomain.partner.com/* (zone name: owned-zone.com)
				Current Version ID: Galaxy-Class",
				  "warn": "",
				}
			`);
		});

		it("should deploy to a route with a pattern/{zone_id|zone_name} combo (service environments)", async () => {
			writeWranglerToml({
				env: {
					staging: {
						routes: [
							"some-example.com/some-route/*",
							{ pattern: "*a-boring-website.com", zone_id: "54sdf7fsda" },
							{
								pattern: "*another-boring-website.com",
								zone_name: "some-zone.com",
							},
							{ pattern: "example.com/some-route/*", zone_id: "JGHFHG654gjcj" },
							"more-examples.com/*",
						],
					},
				},
			});
			mockSubDomainRequest();
			writeWorkerSource();
			mockUpdateWorkerRequest({
				enabled: false,
				env: "staging",
				legacyEnv: false,
			});
			mockUploadWorkerRequest({
				expectedType: "esm",
				env: "staging",
				legacyEnv: false,
				useOldUploadApi: true,
			});
			mockPublishRoutesRequest({
				routes: [
					"some-example.com/some-route/*",
					{ pattern: "*a-boring-website.com", zone_id: "54sdf7fsda" },
					{
						pattern: "*another-boring-website.com",
						zone_name: "some-zone.com",
					},
					{ pattern: "example.com/some-route/*", zone_id: "JGHFHG654gjcj" },
					"more-examples.com/*",
				],
				env: "staging",
				legacyEnv: false,
			});
			await runWrangler("deploy ./index --legacy-env false --env staging");
			expect(std).toMatchInlineSnapshot(`
				Object {
				  "debug": "",
				  "err": "",
				  "info": "",
				  "out": "Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (staging) (TIMINGS)
				Deployed test-name (staging) triggers (TIMINGS)
				  some-example.com/some-route/*
				  *a-boring-website.com (zone id: 54sdf7fsda)
				  *another-boring-website.com (zone name: some-zone.com)
				  example.com/some-route/* (zone id: JGHFHG654gjcj)
				  more-examples.com/*
				Current Version ID: Galaxy-Class",
				  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

				    - Experimental: Service environments are in beta, and their behaviour is guaranteed to change in
				  the future. DO NOT USE IN PRODUCTION.

				",
				}
			`);
		});

		it("should deploy to legacy environment specific routes", async () => {
			writeWranglerToml({
				routes: ["example.com/some-route/*"],
				env: {
					dev: {
						routes: ["dev-example.com/some-route/*"],
					},
				},
			});
			writeWorkerSource();
			mockUpdateWorkerRequest({ enabled: false, legacyEnv: true, env: "dev" });
			mockUploadWorkerRequest({
				expectedType: "esm",
				legacyEnv: true,
				env: "dev",
			});
			mockPublishRoutesRequest({
				routes: ["dev-example.com/some-route/*"],
				legacyEnv: true,
				env: "dev",
			});
			await runWrangler("deploy ./index --env dev --legacy-env true");
		});

		it("services: should deploy to service environment specific routes", async () => {
			writeWranglerToml({
				routes: ["example.com/some-route/*"],
				env: {
					dev: {
						routes: ["dev-example.com/some-route/*"],
					},
				},
			});
			writeWorkerSource();
			mockUpdateWorkerRequest({ enabled: false, env: "dev" });
			mockUploadWorkerRequest({
				expectedType: "esm",
				env: "dev",
			});
			mockPublishRoutesRequest({
				routes: ["dev-example.com/some-route/*"],
				env: "dev",
			});
			await runWrangler("deploy ./index --env dev --legacy-env false");
		});

		it("should fallback to the Wrangler v1 zone-based API if the bulk-routes API fails", async () => {
			writeWranglerToml({
				routes: ["example.com/some-route/*"],
			});
			writeWorkerSource();
			mockUpdateWorkerRequest({ enabled: false });
			mockUploadWorkerRequest({ expectedType: "esm" });
			// Simulate the bulk-routes API failing with a not authorized error.
			mockUnauthorizedPublishRoutesRequest();
			// Simulate that the worker has already been deployed to another route in this zone.
			mockCollectKnownRoutesRequest([
				{
					pattern: "foo.example.com/other-route",
					script: "test-name",
				},
			]);
			mockGetZoneFromHostRequest("example.com", "some-zone-id");
			mockPublishRoutesFallbackRequest({
				pattern: "example.com/some-route/*",
				script: "test-name",
			});
			await runWrangler("deploy ./index");

			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`
			"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe current authentication token does not have 'All Zones' permissions.[0m

			  Falling back to using the zone-based API endpoint to update each route individually.
			  Note that there is no access to routes associated with zones that the API token does not have
			  permission for.
			  Existing routes for this Worker in such zones will not be deleted.


			[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mPreviously deployed routes:[0m

			  The following routes were already associated with this worker, and have not been deleted:
			   - \\"foo.example.com/other-route\\"
			  If these routes are not wanted then you can remove them in the dashboard.

			"
		`);
			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  example.com/some-route/*
				Current Version ID: Galaxy-Class"
			`);
		});

		it("should error if the bulk-routes API fails and trying to push to a non-production environment", async () => {
			writeWranglerToml({
				routes: ["example.com/some-route/*"],
				legacy_env: false,
			});
			writeWorkerSource();
			mockUpdateWorkerRequest({ env: "staging", enabled: false });
			mockUploadWorkerRequest({ env: "staging", expectedType: "esm" });
			// Simulate the bulk-routes API failing with a not authorized error.
			mockUnauthorizedPublishRoutesRequest({ env: "staging" });
			// Simulate that the worker has already been deployed to another route in this zone.
			mockCollectKnownRoutesRequest([
				{
					pattern: "foo.example.com/other-route",
					script: "test-name",
				},
			]);
			mockGetZoneFromHostRequest("example.com", "some-zone-id");
			mockPublishRoutesFallbackRequest({
				pattern: "example.com/some-route/*",
				script: "test-name",
			});
			await expect(runWrangler("deploy ./index --env=staging")).rejects
				.toThrowErrorMatchingInlineSnapshot(`
				[Error: Service environments combined with an API token that doesn't have 'All Zones' permissions is not supported.
				Either turn off service environments by setting \`legacy_env = true\`, creating an API token with 'All Zones' permissions, or logging in via OAuth]
			`);
		});

		describe("custom domains", () => {
			it("should deploy routes marked with 'custom_domain' as separate custom domains", async () => {
				writeWranglerToml({
					routes: [{ pattern: "api.example.com", custom_domain: true }],
				});
				writeWorkerSource();
				mockUpdateWorkerRequest({ enabled: false });
				mockUploadWorkerRequest({ expectedType: "esm" });
				mockCustomDomainsChangesetRequest({});
				mockPublishCustomDomainsRequest({
					publishFlags: {
						override_scope: true,
						override_existing_origin: false,
						override_existing_dns_record: false,
					},
					domains: [{ hostname: "api.example.com" }],
				});
				await runWrangler("deploy ./index");
				expect(std.out).toContain("api.example.com (custom domain)");
			});

			it("should confirm override if custom domain deploy would override an existing domain", async () => {
				writeWranglerToml({
					routes: [{ pattern: "api.example.com", custom_domain: true }],
				});
				writeWorkerSource();
				mockUpdateWorkerRequest({ enabled: false });
				mockUploadWorkerRequest({ expectedType: "esm" });
				mockCustomDomainsChangesetRequest({
					originConflicts: [
						{
							id: "101",
							zone_id: "",
							zone_name: "",
							hostname: "api.example.com",
							service: "test-name",
							environment: "",
						},
					],
				});
				mockCustomDomainLookup({
					id: "101",
					zone_id: "",
					zone_name: "",
					hostname: "api.example.com",
					service: "other-script",
					environment: "",
				});
				mockPublishCustomDomainsRequest({
					publishFlags: {
						override_scope: true,
						override_existing_origin: true,
						override_existing_dns_record: false,
					},
					domains: [{ hostname: "api.example.com" }],
				});
				mockConfirm({
					text: `Custom Domains already exist for these domains:
\t• api.example.com (used as a domain for "other-script")
Update them to point to this script instead?`,
					result: true,
				});
				await runWrangler("deploy ./index");
				expect(std.out).toContain("api.example.com (custom domain)");
			});

			it("should confirm override if custom domain deploy contains a conflicting DNS record", async () => {
				writeWranglerToml({
					routes: [{ pattern: "api.example.com", custom_domain: true }],
				});
				writeWorkerSource();
				mockUpdateWorkerRequest({ enabled: false });
				mockUploadWorkerRequest({ expectedType: "esm" });
				mockCustomDomainsChangesetRequest({
					dnsRecordConflicts: [
						{
							id: "",
							zone_id: "",
							zone_name: "",
							hostname: "api.example.com",
							service: "test-name",
							environment: "",
						},
					],
				});
				mockPublishCustomDomainsRequest({
					publishFlags: {
						override_scope: true,
						override_existing_origin: false,
						override_existing_dns_record: true,
					},
					domains: [{ hostname: "api.example.com" }],
				});
				mockConfirm({
					text: `You already have DNS records that conflict for these Custom Domains:
\t• api.example.com
Update them to point to this script instead?`,
					result: true,
				});
				await runWrangler("deploy ./index");
				expect(std.out).toContain("api.example.com (custom domain)");
			});

			it("should confirm for conflicting custom domains and then again for conflicting dns", async () => {
				writeWranglerToml({
					routes: [{ pattern: "api.example.com", custom_domain: true }],
				});
				writeWorkerSource();
				mockUpdateWorkerRequest({ enabled: false });
				mockUploadWorkerRequest({ expectedType: "esm" });
				mockCustomDomainsChangesetRequest({
					originConflicts: [
						{
							id: "101",
							zone_id: "",
							zone_name: "",
							hostname: "api.example.com",
							service: "test-name",
							environment: "",
						},
					],
					dnsRecordConflicts: [
						{
							id: "",
							zone_id: "",
							zone_name: "",
							hostname: "api.example.com",
							service: "test-name",
							environment: "",
						},
					],
				});
				mockCustomDomainLookup({
					id: "101",
					zone_id: "",
					zone_name: "",
					hostname: "api.example.com",
					service: "other-script",
					environment: "",
				});
				mockPublishCustomDomainsRequest({
					publishFlags: {
						override_scope: true,
						override_existing_origin: true,
						override_existing_dns_record: true,
					},
					domains: [{ hostname: "api.example.com" }],
				});
				mockConfirm(
					{
						text: `Custom Domains already exist for these domains:
\t• api.example.com (used as a domain for "other-script")
Update them to point to this script instead?`,
						result: true,
					},
					{
						text: `You already have DNS records that conflict for these Custom Domains:
\t• api.example.com
Update them to point to this script instead?`,

						result: true,
					}
				);
				await runWrangler("deploy ./index");
				expect(std.out).toContain("api.example.com (custom domain)");
			});

			it("should throw if an invalid custom domain is requested", async () => {
				writeWranglerToml({
					routes: [{ pattern: "*.example.com", custom_domain: true }],
				});
				writeWorkerSource();
				await expect(runWrangler("deploy ./index")).rejects
					.toThrowErrorMatchingInlineSnapshot(`
					[Error: Invalid Routes:
					*.example.com:
					Wildcard operators (*) are not allowed in Custom Domains]
				`);

				writeWranglerToml({
					routes: [
						{ pattern: "api.example.com/at/a/path", custom_domain: true },
					],
				});
				writeWorkerSource();
				mockServiceScriptData({});

				await expect(runWrangler("deploy ./index")).rejects
					.toThrowErrorMatchingInlineSnapshot(`
					[Error: Invalid Routes:
					api.example.com/at/a/path:
					Paths are not allowed in Custom Domains]
				`);
			});

			it("should not continue with publishing an override if user does not confirm", async () => {
				writeWranglerToml({
					routes: [{ pattern: "api.example.com", custom_domain: true }],
				});
				writeWorkerSource();
				mockUpdateWorkerRequest({ enabled: false });
				mockUploadWorkerRequest({ expectedType: "esm" });
				mockCustomDomainsChangesetRequest({
					originConflicts: [
						{
							id: "101",
							zone_id: "",
							zone_name: "",
							hostname: "api.example.com",
							service: "test-name",
							environment: "",
						},
					],
				});
				mockCustomDomainLookup({
					id: "101",
					zone_id: "",
					zone_name: "",
					hostname: "api.example.com",
					service: "other-script",
					environment: "",
				});
				mockConfirm({
					text: `Custom Domains already exist for these domains:
\t• api.example.com (used as a domain for "other-script")
Update them to point to this script instead?`,
					result: false,
				});
				await runWrangler("deploy ./index");
				expect(std.out).toContain(
					'Publishing to Custom Domain "api.example.com" was skipped, fix conflict and try again'
				);
			});
		});

		it("should error on routes with paths if assets are present", async () => {
			writeWranglerToml({
				routes: [
					"simple.co.uk/path",
					"simple.co.uk/path/*",
					"simple.co.uk/",
					"simple.co.uk/*",
					"simple.co.uk",
					{ pattern: "route.co.uk/path", zone_id: "asdfadsf" },
					{ pattern: "route.co.uk/path/*", zone_id: "asdfadsf" },
					{ pattern: "route.co.uk/*", zone_id: "asdfadsf" },
					{ pattern: "route.co.uk/", zone_id: "asdfadsf" },
					{ pattern: "route.co.uk", zone_id: "asdfadsf" },
					{ pattern: "custom.co.uk/path", custom_domain: true },
					{ pattern: "custom.co.uk/*", custom_domain: true },
					{ pattern: "custom.co.uk", custom_domain: true },
				],
			});
			writeWorkerSource();
			writeAssets([{ filePath: "asset.txt", content: "Content of file-1" }]);

			await expect(runWrangler(`deploy --assets="assets"`)).rejects
				.toThrowErrorMatchingInlineSnapshot(`
				[Error: Invalid Routes:
				simple.co.uk/path:
				Workers which have static assets cannot be routed on a URL which has a path component. Update the route to replace /path with /*

				simple.co.uk/path/*:
				Workers which have static assets cannot be routed on a URL which has a path component. Update the route to replace /path/* with /*

				simple.co.uk/:
				Workers which have static assets must end with a wildcard path. Update the route to end with /*

				simple.co.uk:
				Workers which have static assets must end with a wildcard path. Update the route to end with /*

				route.co.uk/path:
				Workers which have static assets cannot be routed on a URL which has a path component. Update the route to replace /path with /*

				route.co.uk/path/*:
				Workers which have static assets cannot be routed on a URL which has a path component. Update the route to replace /path/* with /*

				route.co.uk/:
				Workers which have static assets must end with a wildcard path. Update the route to end with /*

				route.co.uk:
				Workers which have static assets must end with a wildcard path. Update the route to end with /*

				custom.co.uk/path:
				Paths are not allowed in Custom Domains

				custom.co.uk/*:
				Wildcard operators (*) are not allowed in Custom Domains
				Paths are not allowed in Custom Domains]
			`);
		});

		it("shouldn't error on routes with paths if there are no assets", async () => {
			writeWranglerToml({
				routes: [
					"simple.co.uk/path",
					"simple.co.uk/path/*",
					"simple.co.uk/",
					"simple.co.uk/*",
					"simple.co.uk",
					{ pattern: "route.co.uk/path", zone_id: "asdfadsf" },
					{ pattern: "route.co.uk/path/*", zone_id: "asdfadsf" },
					{ pattern: "route.co.uk/*", zone_id: "asdfadsf" },
					{ pattern: "route.co.uk/", zone_id: "asdfadsf" },
					{ pattern: "route.co.uk", zone_id: "asdfadsf" },
					{ pattern: "custom.co.uk/path", custom_domain: true },
					{ pattern: "custom.co.uk/*", custom_domain: true },
					{ pattern: "custom.co.uk", custom_domain: true },
				],
			});
			writeWorkerSource();

			await expect(runWrangler(`deploy ./index`)).rejects
				.toThrowErrorMatchingInlineSnapshot(`
				[Error: Invalid Routes:
				custom.co.uk/path:
				Paths are not allowed in Custom Domains

				custom.co.uk/*:
				Wildcard operators (*) are not allowed in Custom Domains
				Paths are not allowed in Custom Domains]
			`);
		});

		it.todo("should error if it's a workers.dev route");
	});

	describe("entry-points", () => {
		it("should be able to use `index` with no extension as the entry-point (esm)", async () => {
			writeWranglerToml();
			writeWorkerSource();
			mockUploadWorkerRequest({ expectedType: "esm" });
			mockSubDomainRequest();

			await runWrangler("deploy ./index");

			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should be able to use `index` with no extension as the entry-point (sw)", async () => {
			writeWranglerToml();
			writeWorkerSource({ type: "sw" });
			mockUploadWorkerRequest({
				expectedType: "sw",
				useOldUploadApi: true,
			});
			mockSubDomainRequest();

			await runWrangler("deploy ./index");

			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should be able to use the `main` config as the entry-point for ESM sources", async () => {
			writeWranglerToml({ main: "./index.js" });
			writeWorkerSource();
			mockUploadWorkerRequest();
			mockSubDomainRequest();

			await runWrangler("deploy");

			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should use `main` relative to the wrangler.toml not cwd", async () => {
			writeWranglerToml({
				main: "./foo/index.js",
			});
			writeWorkerSource({ basePath: "foo" });
			mockUploadWorkerRequest({ expectedEntry: "var foo = 100;" });
			mockSubDomainRequest();
			process.chdir("foo");
			await runWrangler("deploy");

			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it('should use `build.upload.main` as an entry point, where `build.upload.dir` defaults to "./dist", and log a deprecation warning', async () => {
			writeWranglerToml({ build: { upload: { main: "./index.js" } } });
			writeWorkerSource({ basePath: "./dist" });
			mockUploadWorkerRequest();
			mockSubDomainRequest();

			await runWrangler("deploy");

			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`
			"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

			    - [1mDeprecation[0m: \\"build.upload.main\\":
			      Delete the \`build.upload.main\` and \`build.upload.dir\` fields.
			      Then add the top level \`main\` field to your configuration file:
			      \`\`\`
			      main = \\"dist/index.js\\"
			      \`\`\`

			"
		`);
		});

		it("should use `build.upload.main` relative to `build.upload.dir`", async () => {
			writeWranglerToml({
				build: {
					upload: {
						main: "./index.js",
						dir: "./foo",
					},
				},
			});
			writeWorkerSource({ basePath: "./foo" });
			mockUploadWorkerRequest({ expectedEntry: "var foo = 100;" });
			mockSubDomainRequest();
			process.chdir("foo");
			await runWrangler("deploy");

			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`
			"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing ../wrangler.toml configuration:[0m

			    - [1mDeprecation[0m: \\"build.upload.main\\":
			      Delete the \`build.upload.main\` and \`build.upload.dir\` fields.
			      Then add the top level \`main\` field to your configuration file:
			      \`\`\`
			      main = \\"foo/index.js\\"
			      \`\`\`
			    - [1mDeprecation[0m: \\"build.upload.dir\\":
			      Use the top level \\"main\\" field or a command-line argument to specify the entry-point for the
			  Worker.

			"
		`);
		});

		it("should error when both `main` and `build.upload.main` are used", async () => {
			writeWranglerToml({
				main: "./index.js",
				build: {
					upload: {
						main: "./index.js",
						dir: "./foo",
					},
				},
			});
			await expect(runWrangler("deploy")).rejects
				.toThrowErrorMatchingInlineSnapshot(`
				[Error: Processing wrangler.toml configuration:
				  - Don't define both the \`main\` and \`build.upload.main\` fields in your configuration.
				    They serve the same purpose: to point to the entry-point of your worker.
				    Delete the \`build.upload.main\` and \`build.upload.dir\` field from your config.]
			`);
		});

		it("should be able to transpile TypeScript (esm)", async () => {
			writeWranglerToml();
			writeWorkerSource({ format: "ts" });
			mockUploadWorkerRequest({ expectedEntry: "var foo = 100;" });
			mockSubDomainRequest();
			await runWrangler("deploy index.ts");

			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should be able to transpile TypeScript (sw)", async () => {
			writeWranglerToml();
			writeWorkerSource({ format: "ts", type: "sw" });
			mockUploadWorkerRequest({
				expectedEntry: "var foo = 100;",
				expectedType: "sw",
				useOldUploadApi: true,
			});
			mockSubDomainRequest();
			await runWrangler("deploy index.ts");

			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should add referenced text modules into the form upload", async () => {
			writeWranglerToml();
			fs.writeFileSync(
				"./index.js",
				`
import txt from './textfile.txt';
export default{
  fetch(){
    return new Response(txt);
  }
}
`
			);
			fs.writeFileSync("./textfile.txt", "Hello, World!");
			mockUploadWorkerRequest({
				expectedModules: {
					"./0a0a9f2a6772942557ab5355d76af442f8f65e01-textfile.txt":
						"Hello, World!",
				},
			});
			mockSubDomainRequest();
			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should allow cloudflare module import", async () => {
			writeWranglerToml();
			fs.writeFileSync(
				"./index.js",
				`
import { EmailMessage } from "cloudflare:email";
export default{
  fetch(){
    return new Response("all done");
  }
}
`
			);
			mockUploadWorkerRequest();
			mockSubDomainRequest();
			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should be able to transpile entry-points in sub-directories (esm)", async () => {
			writeWranglerToml();
			writeWorkerSource({ basePath: "./src" });
			mockUploadWorkerRequest({ expectedEntry: "var foo = 100;" });
			mockSubDomainRequest();

			await runWrangler("deploy ./src/index.js");

			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should preserve exports on a module format worker", async () => {
			writeWranglerToml();
			fs.writeFileSync(
				"index.js",
				`
export const abc = 123;
export const def = "show me the money";
export default {};`
			);

			await runWrangler("deploy index.js --dry-run --outdir out");

			expect(
				(
					await esbuild.build({
						entryPoints: [path.resolve("./out/index.js")],
						metafile: true,
						write: false,
					})
				).metafile?.outputs["index.js"].exports
			).toMatchInlineSnapshot(`
			        Array [
			          "abc",
			          "def",
			          "default",
			        ]
		      `);

			expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "Total Upload: xx KiB / gzip: xx KiB
			--dry-run: exiting now.",
			  "warn": "",
			}
		`);
		});

		it("should not preserve exports on a service-worker format worker", async () => {
			writeWranglerToml();
			fs.writeFileSync(
				"index.js",
				`
export const abc = 123;
export const def = "show me the money";
addEventListener('fetch', event => {});`
			);

			await runWrangler("deploy index.js --dry-run --outdir out");

			expect(
				(
					await esbuild.build({
						entryPoints: [path.resolve("./out/index.js")],
						metafile: true,
						write: false,
					})
				).metafile?.outputs["index.js"].exports
			).toMatchInlineSnapshot(`Array []`);

			expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "Total Upload: xx KiB / gzip: xx KiB
			--dry-run: exiting now.",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe entrypoint index.js has exports like an ES Module, but hasn't defined a default export like a module worker normally would. Building the worker using \\"service-worker\\" format...[0m

			",
			}
		`);
		});

		it("should be able to transpile entry-points in sub-directories (sw)", async () => {
			writeWranglerToml();
			writeWorkerSource({ basePath: "./src", type: "sw" });
			mockUploadWorkerRequest({
				expectedEntry: "var foo = 100;",
				expectedType: "sw",
				useOldUploadApi: true,
			});
			mockSubDomainRequest();

			await runWrangler("deploy ./src/index.js");

			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it('should error if a site definition doesn\'t have a "bucket" field', async () => {
			writeWranglerToml({
				// @ts-expect-error we're intentionally setting an invalid config
				site: {},
			});
			writeWorkerSource();
			mockUploadWorkerRequest();
			mockSubDomainRequest();

			await expect(runWrangler("deploy ./index.js")).rejects
				.toThrowErrorMatchingInlineSnapshot(`
				[Error: Processing wrangler.toml configuration:
				  - "site.bucket" is a required field.]
			`);

			expect(std.out).toMatchInlineSnapshot(`""`);
			expect(std.err).toMatchInlineSnapshot(`
			        "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mProcessing wrangler.toml configuration:[0m

			            - \\"site.bucket\\" is a required field.

			        "
		      `);
			expect(normalizeString(std.warn)).toMatchInlineSnapshot(`
			        "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

			            - Because you've defined a [site] configuration, we're defaulting to \\"workers-site\\" for the
			          deprecated \`site.entry-point\`field.
			              Add the top level \`main\` field to your configuration file:
			              \`\`\`
			              main = \\"workers-site/index.js\\"
			              \`\`\`

			        "
		      `);
		});

		it("should warn if there is a `site.entry-point` configuration", async () => {
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "file-2.txt", content: "Content of file-2" },
			];
			const kvNamespace = {
				title: "__test-name-workers_sites_assets",
				id: "__test-name-workers_sites_assets-id",
			};

			writeWranglerToml({
				site: {
					"entry-point": "./index.js",
					bucket: "assets",
				},
			});
			writeWorkerSource();
			writeAssets(assets);
			mockUploadWorkerRequest();
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, []);
			mockUploadAssetsToKVRequest(kvNamespace.id, assets);
			await runWrangler("deploy ./index.js");

			expect(std).toMatchInlineSnapshot(`
				Object {
				  "debug": "",
				  "err": "",
				  "info": "Fetching list of already uploaded assets...
				Building list of assets to upload...
				 + file-1.2ca234f380.txt (uploading new version of file-1.txt)
				 + file-2.5938485188.txt (uploading new version of file-2.txt)
				Uploading 2 new assets...
				Uploaded 100% [2 out of 2]",
				  "out": "↗️  Done syncing assets
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class",
				  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

				    - [1mDeprecation[0m: \\"site.entry-point\\":
				      Delete the \`site.entry-point\` field, then add the top level \`main\` field to your configuration
				  file:
				      \`\`\`
				      main = \\"index.js\\"
				      \`\`\`

				",
				}
			`);
		});

		it("should resolve site.entry-point relative to wrangler.toml", async () => {
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "file-2.txt", content: "Content of file-2" },
			];
			const kvNamespace = {
				title: "__test-name-workers_sites_assets",
				id: "__test-name-workers_sites_assets-id",
			};
			fs.mkdirSync("my-site");
			process.chdir("my-site");
			writeWranglerToml({
				site: {
					bucket: "assets",
					"entry-point": "my-entry",
				},
			});
			fs.mkdirSync("my-entry");
			fs.writeFileSync("my-entry/index.js", "export default {}");
			writeAssets(assets);
			process.chdir("..");
			mockUploadWorkerRequest();
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, []);
			mockUploadAssetsToKVRequest(kvNamespace.id, assets);
			await runWrangler("deploy --config ./my-site/wrangler.toml");

			expect(std.info).toMatchInlineSnapshot(`
			"Fetching list of already uploaded assets...
			Building list of assets to upload...
			 + file-1.2ca234f380.txt (uploading new version of file-1.txt)
			 + file-2.5938485188.txt (uploading new version of file-2.txt)
			Uploading 2 new assets...
			Uploaded 100% [2 out of 2]"
		`);
			expect(std.out).toMatchInlineSnapshot(`
				"↗️  Done syncing assets
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(normalizeString(std.warn)).toMatchInlineSnapshot(`
			"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing my-site/wrangler.toml configuration:[0m

			    - [1mDeprecation[0m: \\"site.entry-point\\":
			      Delete the \`site.entry-point\` field, then add the top level \`main\` field to your configuration
			  file:
			      \`\`\`
			      main = \\"my-entry/index.js\\"
			      \`\`\`

			"
		`);
		});

		it("should error if both main and site.entry-point are specified", async () => {
			writeWranglerToml({
				main: "some-entry",
				site: {
					bucket: "some-bucket",
					"entry-point": "./index.js",
				},
			});

			await expect(runWrangler("deploy")).rejects
				.toThrowErrorMatchingInlineSnapshot(`
				[Error: Processing wrangler.toml configuration:
				  - Don't define both the \`main\` and \`site.entry-point\` fields in your configuration.
				    They serve the same purpose: to point to the entry-point of your worker.
				    Delete the deprecated \`site.entry-point\` field from your config.]
			`);
		});

		it("should error if there is no entry-point specified", async () => {
			writeWranglerToml();
			writeWorkerSource();
			mockUploadWorkerRequest();
			mockSubDomainRequest();
			await expect(
				runWrangler("deploy")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Missing entry-point: The entry-point should be specified via the command line (e.g. \`wrangler deploy path/to/script\`) or the \`main\` config field.]`
			);

			expect(std.out).toMatchInlineSnapshot(`""`);
			expect(std.err).toMatchInlineSnapshot(`
			        "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mMissing entry-point: The entry-point should be specified via the command line (e.g. \`wrangler deploy path/to/script\`) or the \`main\` config field.[0m

			        "
		      `);
		});

		it("should not require an explicit entry point when using --legacy-assets", async () => {
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "file-2.txt", content: "Content of file-2" },
			];
			const kvNamespace = {
				title: "__test-name-workers_sites_assets",
				id: "__test-name-workers_sites_assets-id",
			};
			writeAssets(assets);
			mockUploadWorkerRequest({
				expectedMainModule: "no-op-worker.js",
			});
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, []);
			mockUploadAssetsToKVRequest(kvNamespace.id, assets);

			await runWrangler(
				"deploy --legacy-assets assets --latest --name test-name"
			);

			expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe --legacy-assets argument has been deprecated. Please use --assets instead.[0m

				  To learn more about Workers with assets, visit our documentation at
				  [4mhttps://developers.cloudflare.com/workers/frameworks/[0m.


				[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mUsing the latest version of the Workers runtime. To silence this warning, please choose a specific version of the runtime with --compatibility-date, or add a compatibility_date to your wrangler.toml.[0m



				"
			`);
			expect(std.info).toMatchInlineSnapshot(`
				"Fetching list of already uploaded assets...
				Building list of assets to upload...
				 + file-1.2ca234f380.txt (uploading new version of file-1.txt)
				 + file-2.5938485188.txt (uploading new version of file-2.txt)
				Uploading 2 new assets...
				Uploaded 100% [2 out of 2]"
			`);
			expect(std.out).toMatchInlineSnapshot(`
				"↗️  Done syncing assets
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
		});

		describe("should source map validation errors", () => {
			function mockDeployWithValidationError(message: string) {
				const handler = http.post(
					"*/accounts/:accountId/workers/scripts/:scriptName/versions",
					async () => {
						const body = createFetchResult(null, false, [
							{ code: 10021, message },
						]);
						return HttpResponse.json(body);
					}
				);
				msw.use(handler);
			}

			it("with TypeScript source file", async () => {
				writeWranglerToml();
				fs.writeFileSync(
					`index.ts`,
					dedent`interface Env {
						THING: string;
					}
					x;
					export default {
						fetch() {
							return new Response("body");
						}
					}`
				);
				mockDeployWithValidationError(
					"Uncaught ReferenceError: x is not defined\n  at index.js:2:1\n"
				);
				mockSubDomainRequest();

				await expect(runWrangler("deploy ./index.ts")).rejects.toMatchObject({
					notes: [{ text: expect.stringContaining("index.ts:4:1") }, {}],
				});
			});

			it("with additional modules", async () => {
				writeWranglerToml({
					no_bundle: true,
					rules: [{ type: "ESModule", globs: ["**/*.js"] }],
				});

				fs.writeFileSync(
					"dep.ts",
					dedent`interface Env {
					}
					y;
					export default "message";`
				);
				await esbuild.build({
					bundle: true,
					format: "esm",
					entryPoints: [path.resolve("dep.ts")],
					outdir: process.cwd(),
					sourcemap: true,
				});

				fs.writeFileSync(
					"index.js",
					dedent`import dep from "./dep.js";
					export default {
						fetch() {
							return new Response(dep);
						}
					}`
				);

				mockDeployWithValidationError(
					"Uncaught ReferenceError: y is not defined\n  at dep.js:2:1\n"
				);
				mockSubDomainRequest();

				await expect(runWrangler("deploy ./index.js")).rejects.toMatchObject({
					notes: [{ text: expect.stringContaining("dep.ts:3:1") }, {}],
				});
			});

			it("with inline source map", async () => {
				writeWranglerToml({
					no_bundle: true,
				});

				fs.writeFileSync(
					"index.ts",
					dedent`interface Env {}
					z;
					export default {
						fetch() {
							return new Response("body");
						}
					}`
				);
				await esbuild.build({
					bundle: true,
					format: "esm",
					entryPoints: [path.resolve("index.ts")],
					outdir: process.cwd(),
					sourcemap: "inline",
				});

				mockDeployWithValidationError(
					"Uncaught ReferenceError: z is not defined\n  at index.js:2:1\n"
				);
				mockSubDomainRequest();

				await expect(runWrangler("deploy ./index.js")).rejects.toMatchObject({
					notes: [{ text: expect.stringContaining("index.ts:2:1") }, {}],
				});
			});
		});
	});

	describe("(legacy) asset upload", () => {
		it("should upload all the files in the directory specified by `config.site.bucket`", async () => {
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "file-2.txt", content: "Content of file-2" },
			];
			const kvNamespace = {
				title: "__test-name-workers_sites_assets",
				id: "__test-name-workers_sites_assets-id",
			};
			writeWranglerToml({
				main: "./index.js",
				site: {
					bucket: "assets",
				},
			});
			writeWorkerSource();
			writeAssets(assets);
			mockUploadWorkerRequest();
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, []);
			mockUploadAssetsToKVRequest(kvNamespace.id, assets);
			await runWrangler("deploy");

			expect(std.info).toMatchInlineSnapshot(`
			"Fetching list of already uploaded assets...
			Building list of assets to upload...
			 + file-1.2ca234f380.txt (uploading new version of file-1.txt)
			 + file-2.5938485188.txt (uploading new version of file-2.txt)
			Uploading 2 new assets...
			Uploaded 100% [2 out of 2]"
		`);
			expect(std.out).toMatchInlineSnapshot(`
				"↗️  Done syncing assets
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should upload all the files in the directory specified by `--legacy-assets`", async () => {
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "file-2.txt", content: "Content of file-2" },
			];
			const kvNamespace = {
				title: "__test-name-workers_sites_assets",
				id: "__test-name-workers_sites_assets-id",
			};
			writeWranglerToml({
				main: "./index.js",
			});
			writeWorkerSource();
			writeAssets(assets);
			mockUploadWorkerRequest({
				expectedMainModule: "index.js",
			});
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, []);
			mockUploadAssetsToKVRequest(kvNamespace.id, assets);
			await runWrangler("deploy --legacy-assets assets");

			expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe --legacy-assets argument has been deprecated. Please use --assets instead.[0m

				  To learn more about Workers with assets, visit our documentation at
				  [4mhttps://developers.cloudflare.com/workers/frameworks/[0m.

				"
			`);
			expect(std.out).toMatchInlineSnapshot(`
				"↗️  Done syncing assets
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);

			expect(std.info).toMatchInlineSnapshot(`
				"Fetching list of already uploaded assets...
				Building list of assets to upload...
				 + file-1.2ca234f380.txt (uploading new version of file-1.txt)
				 + file-2.5938485188.txt (uploading new version of file-2.txt)
				Uploading 2 new assets...
				Uploaded 100% [2 out of 2]"
			`);
		});

		it("should error when trying to use --legacy-assets with a service-worker Worker", async () => {
			writeWranglerToml({
				main: "./index.js",
			});
			writeWorkerSource({ type: "sw" });
			await expect(
				runWrangler("deploy --legacy-assets abc")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: You cannot use the service-worker format with an \`assets\` directory yet. For information on how to migrate to the module-worker format, see: https://developers.cloudflare.com/workers/learning/migrating-to-module-workers/]`
			);

			expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe --legacy-assets argument has been deprecated. Please use --assets instead.[0m

				  To learn more about Workers with assets, visit our documentation at
				  [4mhttps://developers.cloudflare.com/workers/frameworks/[0m.

				"
			`);
		});

		it("should error if --legacy-assets and --site are used together", async () => {
			writeWranglerToml({
				main: "./index.js",
			});
			writeWorkerSource();
			await expect(
				runWrangler("deploy --legacy-assets abc --site xyz")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Cannot use legacy assets and Workers Sites in the same Worker.]`
			);

			expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe --legacy-assets argument has been deprecated. Please use --assets instead.[0m

				  To learn more about Workers with assets, visit our documentation at
				  [4mhttps://developers.cloudflare.com/workers/frameworks/[0m.

				"
			`);
			expect(std.err).toMatchInlineSnapshot(`
				"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mCannot use legacy assets and Workers Sites in the same Worker.[0m

				"
			`);
		});

		it("should error if --legacy-assets and config.site are used together", async () => {
			writeWranglerToml({
				main: "./index.js",
				site: {
					bucket: "xyz",
				},
			});
			writeWorkerSource();
			await expect(
				runWrangler("deploy --legacy-assets abc")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Cannot use legacy assets and Workers Sites in the same Worker.]`
			);

			expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe --legacy-assets argument has been deprecated. Please use --assets instead.[0m

				  To learn more about Workers with assets, visit our documentation at
				  [4mhttps://developers.cloudflare.com/workers/frameworks/[0m.

				"
			`);
		});

		it("should error if config.legacy_assets and --site are used together", async () => {
			writeWranglerToml({
				main: "./index.js",
				legacy_assets: "abc",
			});
			writeWorkerSource();
			await expect(
				runWrangler("deploy --site xyz")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Cannot use legacy assets and Workers Sites in the same Worker.]`
			);

			expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

				    - [1mDeprecation[0m: \\"legacy_assets\\":
				      The \`legacy_assets\` feature has been deprecated. Please use \`assets\` instead.

				"
			`);
		});

		it("should error if config.legacy_assets and config.site are used together", async () => {
			writeWranglerToml({
				main: "./index.js",
				legacy_assets: "abc",
				site: {
					bucket: "xyz",
				},
			});
			writeWorkerSource();
			await expect(
				runWrangler("deploy")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Cannot use legacy assets and Workers Sites in the same Worker.]`
			);

			expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

				    - [1mDeprecation[0m: \\"legacy_assets\\":
				      The \`legacy_assets\` feature has been deprecated. Please use \`assets\` instead.

				"
			`);
		});

		it("should warn if --legacy-assets is used", async () => {
			writeWranglerToml({
				main: "./index.js",
			});
			const assets = [
				{ filePath: "subdir/file-1.txt", content: "Content of file-1" },
				{ filePath: "subdir/file-2.txt", content: "Content of file-2" },
			];
			const kvNamespace = {
				title: "__test-name-workers_sites_assets",
				id: "__test-name-workers_sites_assets-id",
			};
			fs.writeFileSync("index.js", `export default {};`);
			writeWorkerSource();
			writeAssets(assets);
			mockUploadWorkerRequest({
				expectedMainModule: "index.js",
			});
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, []);
			mockUploadAssetsToKVRequest(kvNamespace.id, assets);

			await runWrangler("deploy --legacy-assets ./assets");

			expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe --legacy-assets argument has been deprecated. Please use --assets instead.[0m

				  To learn more about Workers with assets, visit our documentation at
				  [4mhttps://developers.cloudflare.com/workers/frameworks/[0m.

				"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.info).toMatchInlineSnapshot(`
				"Fetching list of already uploaded assets...
				Building list of assets to upload...
				 + subdir/file-1.2ca234f380.txt (uploading new version of subdir/file-1.txt)
				 + subdir/file-2.5938485188.txt (uploading new version of subdir/file-2.txt)
				Uploading 2 new assets...
				Uploaded 100% [2 out of 2]"
			`);
			expect(std.out).toMatchInlineSnapshot(`
				"↗️  Done syncing assets
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
		});

		it("should warn if config.legacy_assets is used", async () => {
			writeWranglerToml({
				main: "./index.js",
				legacy_assets: "./assets",
			});
			const assets = [
				{ filePath: "subdir/file-1.txt", content: "Content of file-1" },
				{ filePath: "subdir/file-2.txt", content: "Content of file-2" },
			];
			const kvNamespace = {
				title: "__test-name-workers_sites_assets",
				id: "__test-name-workers_sites_assets-id",
			};
			fs.writeFileSync("index.js", `export default {};`);
			writeWorkerSource();
			writeAssets(assets);
			mockUploadWorkerRequest({
				expectedMainModule: "index.js",
			});
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, []);
			mockUploadAssetsToKVRequest(kvNamespace.id, assets);

			await runWrangler("deploy");

			expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

				    - [1mDeprecation[0m: \\"legacy_assets\\":
				      The \`legacy_assets\` feature has been deprecated. Please use \`assets\` instead.

				"
			`);
			expect(std.info).toMatchInlineSnapshot(`
				"Fetching list of already uploaded assets...
				Building list of assets to upload...
				 + subdir/file-1.2ca234f380.txt (uploading new version of subdir/file-1.txt)
				 + subdir/file-2.5938485188.txt (uploading new version of subdir/file-2.txt)
				Uploading 2 new assets...
				Uploaded 100% [2 out of 2]"
			`);
			expect(std.out).toMatchInlineSnapshot(`
				"↗️  Done syncing assets
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
		});

		it("should not contain backslash for assets with nested directories", async () => {
			const assets = [
				{ filePath: "subdir/file-1.txt", content: "Content of file-1" },
				{ filePath: "subdir/file-2.txt", content: "Content of file-2" },
			];
			const kvNamespace = {
				title: "__test-name-workers_sites_assets",
				id: "__test-name-workers_sites_assets-id",
			};
			writeWranglerToml({
				main: "./index.js",
				site: {
					bucket: "assets",
				},
			});
			writeWorkerSource();
			writeAssets(assets);
			mockUploadWorkerRequest({
				expectedBindings: [
					{
						name: "__STATIC_CONTENT",
						namespace_id: "__test-name-workers_sites_assets-id",
						type: "kv_namespace",
					},
				],
				expectedModules: {
					__STATIC_CONTENT_MANIFEST:
						'{"subdir/file-1.txt":"subdir/file-1.2ca234f380.txt","subdir/file-2.txt":"subdir/file-2.5938485188.txt"}',
				},
			});
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, []);
			mockUploadAssetsToKVRequest(kvNamespace.id, assets);

			await runWrangler("deploy");

			expect(std.info).toMatchInlineSnapshot(`
			"Fetching list of already uploaded assets...
			Building list of assets to upload...
			 + subdir/file-1.2ca234f380.txt (uploading new version of subdir/file-1.txt)
			 + subdir/file-2.5938485188.txt (uploading new version of subdir/file-2.txt)
			Uploading 2 new assets...
			Uploaded 100% [2 out of 2]"
		`);
			expect(std.out).toMatchInlineSnapshot(`
				"↗️  Done syncing assets
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("when using a service-worker type, it should add an asset manifest as a text_blob, and bind to a namespace", async () => {
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "file-2.txt", content: "Content of file-2" },
			];
			const kvNamespace = {
				title: "__test-name-workers_sites_assets",
				id: "__test-name-workers_sites_assets-id",
			};
			writeWranglerToml({
				main: "./index.js",
				site: {
					bucket: "assets",
				},
			});
			writeWorkerSource({ type: "sw" });
			writeAssets(assets);
			mockUploadWorkerRequest({
				expectedType: "sw",
				expectedModules: {
					__STATIC_CONTENT_MANIFEST:
						'{"file-1.txt":"file-1.2ca234f380.txt","file-2.txt":"file-2.5938485188.txt"}',
				},
				expectedBindings: [
					{
						name: "__STATIC_CONTENT",
						namespace_id: "__test-name-workers_sites_assets-id",
						type: "kv_namespace",
					},
					{
						name: "__STATIC_CONTENT_MANIFEST",
						part: "__STATIC_CONTENT_MANIFEST",
						type: "text_blob",
					},
				],
				useOldUploadApi: true,
			});
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, []);
			mockUploadAssetsToKVRequest(kvNamespace.id, assets);

			await runWrangler("deploy");

			expect(std.info).toMatchInlineSnapshot(`
			"Fetching list of already uploaded assets...
			Building list of assets to upload...
			 + file-1.2ca234f380.txt (uploading new version of file-1.txt)
			 + file-2.5938485188.txt (uploading new version of file-2.txt)
			Uploading 2 new assets...
			Uploaded 100% [2 out of 2]"
		`);
			expect(std.out).toMatchInlineSnapshot(`
				"↗️  Done syncing assets
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("when using a module worker type, it should add an asset manifest module, and bind to a namespace", async () => {
			const assets = [
				// Using `.text` extension instead of `.txt` means files won't be
				// treated as additional modules
				{ filePath: "file-1.text", content: "Content of file-1" },
				{ filePath: "file-2.text", content: "Content of file-2" },
			];
			const kvNamespace = {
				title: "__test-name-workers_sites_assets",
				id: "__test-name-workers_sites_assets-id",
			};
			writeWranglerToml({
				main: "./index.js",
				site: {
					bucket: "assets",
				},
				find_additional_modules: true,
				rules: [{ type: "ESModule", globs: ["**/*.mjs"] }],
			});
			// Create a Worker that imports a CommonJS module to trigger esbuild to add
			// extra boilerplate to convert to ESM imports.
			fs.writeFileSync(`another.cjs`, `module.exports.foo = 100;`);
			fs.writeFileSync(
				`index.js`,
				`import { foo } from "./another.cjs";
					export default {
						async fetch(request) {
							return new Response('Hello' + foo);
						},
					};`
			);
			fs.mkdirSync("a/b/c", { recursive: true });
			fs.writeFileSync(
				"a/1.mjs",
				'export { default } from "__STATIC_CONTENT_MANIFEST";'
			);
			fs.writeFileSync(
				"a/b/2.mjs",
				'export { default } from "__STATIC_CONTENT_MANIFEST";'
			);
			fs.writeFileSync(
				"a/b/3.mjs",
				'export { default } from "__STATIC_CONTENT_MANIFEST";'
			);
			fs.writeFileSync(
				"a/b/c/4.mjs",
				'export { default } from "__STATIC_CONTENT_MANIFEST";'
			);
			writeAssets(assets);
			mockUploadWorkerRequest({
				expectedEntry(entry) {
					// Ensure that we have not included the watch stub in production code.
					// This is only needed in `wrangler dev`.
					expect(entry).not.toMatch(/modules-watch-stub\.js/);
				},
				expectedBindings: [
					{
						name: "__STATIC_CONTENT",
						namespace_id: "__test-name-workers_sites_assets-id",
						type: "kv_namespace",
					},
				],
				expectedModules: {
					__STATIC_CONTENT_MANIFEST:
						'{"file-1.text":"file-1.2ca234f380.text","file-2.text":"file-2.5938485188.text"}',
					"a/__STATIC_CONTENT_MANIFEST":
						'export { default } from "../__STATIC_CONTENT_MANIFEST";',
					"a/b/__STATIC_CONTENT_MANIFEST":
						'export { default } from "../../__STATIC_CONTENT_MANIFEST";',
					"a/b/c/__STATIC_CONTENT_MANIFEST":
						'export { default } from "../../../__STATIC_CONTENT_MANIFEST";',
				},
			});
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, []);
			mockUploadAssetsToKVRequest(kvNamespace.id, assets);

			await runWrangler("deploy");

			expect(std.info).toMatchInlineSnapshot(`
			"Attaching additional modules:
			Fetching list of already uploaded assets...
			Building list of assets to upload...
			 + file-1.2ca234f380.text (uploading new version of file-1.text)
			 + file-2.5938485188.text (uploading new version of file-2.text)
			Uploading 2 new assets...
			Uploaded 100% [2 out of 2]"
		`);
			expect(std.out).toMatchInlineSnapshot(`
				"┌───────────────────┬──────┬──────────┐
				│ Name              │ Type │ Size     │
				├───────────────────┼──────┼──────────┤
				│ a/1.mjs           │ esm  │ xx KiB │
				├───────────────────┼──────┼──────────┤
				│ a/b/2.mjs         │ esm  │ xx KiB │
				├───────────────────┼──────┼──────────┤
				│ a/b/3.mjs         │ esm  │ xx KiB │
				├───────────────────┼──────┼──────────┤
				│ a/b/c/4.mjs       │ esm  │ xx KiB │
				├───────────────────┼──────┼──────────┤
				│ Total (4 modules) │      │ xx KiB │
				└───────────────────┴──────┴──────────┘
				↗️  Done syncing assets
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should make environment specific kv namespace for assets, even for service envs", async () => {
			// This is the same test as the one before this, but with an env arg
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "file-2.txt", content: "Content of file-2" },
			];
			const kvNamespace = {
				title: "__test-name-some-env-workers_sites_assets",
				id: "__test-name-some-env-workers_sites_assets-id",
			};
			writeWranglerToml({
				main: "./index.js",
				site: {
					bucket: "assets",
				},
				env: { "some-env": {} },
			});
			writeWorkerSource();
			writeAssets(assets);
			mockUploadWorkerRequest({
				env: "some-env",
				expectedBindings: [
					{
						name: "__STATIC_CONTENT",
						namespace_id: "__test-name-some-env-workers_sites_assets-id",
						type: "kv_namespace",
					},
				],
				useOldUploadApi: true,
			});
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, []);
			mockUploadAssetsToKVRequest(kvNamespace.id, assets);
			await runWrangler("deploy --env some-env --legacy-env false");

			expect(std.info).toMatchInlineSnapshot(`
			"Fetching list of already uploaded assets...
			Building list of assets to upload...
			 + file-1.2ca234f380.txt (uploading new version of file-1.txt)
			 + file-2.5938485188.txt (uploading new version of file-2.txt)
			Uploading 2 new assets...
			Uploaded 100% [2 out of 2]"
		`);
			expect(std.out).toMatchInlineSnapshot(`
				"↗️  Done syncing assets
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (some-env) (TIMINGS)
				Deployed test-name (some-env) triggers (TIMINGS)
				  https://some-env.test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should make environment specific kv namespace for assets, even for legacy envs", async () => {
			// And this is the same test as the one before this, but with legacyEnv:true
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "file-2.txt", content: "Content of file-2" },
			];
			const kvNamespace = {
				title: "__test-name-some-env-workers_sites_assets",
				id: "__test-name-some-env-workers_sites_assets-id",
			};
			writeWranglerToml({
				main: "./index.js",
				site: {
					bucket: "assets",
				},
				env: { "some-env": {} },
			});
			writeWorkerSource();
			writeAssets(assets);
			mockUploadWorkerRequest({
				legacyEnv: true,
				env: "some-env",
				expectedBindings: [
					{
						name: "__STATIC_CONTENT",
						namespace_id: "__test-name-some-env-workers_sites_assets-id",
						type: "kv_namespace",
					},
				],
			});
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, []);
			mockUploadAssetsToKVRequest(kvNamespace.id, assets);
			await runWrangler("deploy --env some-env --legacy-env true");

			expect(std.info).toMatchInlineSnapshot(`
			"Fetching list of already uploaded assets...
			Building list of assets to upload...
			 + file-1.2ca234f380.txt (uploading new version of file-1.txt)
			 + file-2.5938485188.txt (uploading new version of file-2.txt)
			Uploading 2 new assets...
			Uploaded 100% [2 out of 2]"
		`);
			expect(std.out).toMatchInlineSnapshot(`
				"↗️  Done syncing assets
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name-some-env (TIMINGS)
				Deployed test-name-some-env triggers (TIMINGS)
				  https://test-name-some-env.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should only upload files that are not already in the KV namespace", async () => {
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "file-2.txt", content: "Content of file-2" },
			];
			const kvNamespace = {
				title: "__test-name-workers_sites_assets",
				id: "__test-name-workers_sites_assets-id",
			};
			writeWranglerToml({
				main: "./index.js",
				site: {
					bucket: "assets",
				},
			});
			writeWorkerSource();
			writeAssets(assets);
			mockUploadWorkerRequest();
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			// Put file-1 in the KV namespace
			mockKeyListRequest(kvNamespace.id, [{ name: "file-1.2ca234f380.txt" }]);
			// Check we do not upload file-1
			mockUploadAssetsToKVRequest(
				kvNamespace.id,
				assets.filter((a) => a.filePath !== "file-1.txt")
			);
			await runWrangler("deploy");

			expect(std.out).toMatchInlineSnapshot(`
				"↗️  Done syncing assets
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should only upload files that match the `site-include` arg", async () => {
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "file-2.txt", content: "Content of file-2" },
			];
			const kvNamespace = {
				title: "__test-name-workers_sites_assets",
				id: "__test-name-workers_sites_assets-id",
			};
			writeWranglerToml({
				main: "./index.js",
				site: {
					bucket: "assets",
				},
			});
			writeWorkerSource();
			writeAssets(assets);
			mockUploadWorkerRequest();
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, []);
			// Check we only upload file-1
			mockUploadAssetsToKVRequest(
				kvNamespace.id,
				assets.filter((a) => a.filePath === "file-1.txt")
			);
			await runWrangler("deploy --site-include file-1.txt");

			expect(std.info).toMatchInlineSnapshot(`
			"Fetching list of already uploaded assets...
			Building list of assets to upload...
			 + file-1.2ca234f380.txt (uploading new version of file-1.txt)
			Uploading 1 new asset...
			Uploaded 100% [1 out of 1]"
		`);
			expect(std.out).toMatchInlineSnapshot(`
				"↗️  Done syncing assets
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should not upload files that match the `site-exclude` arg", async () => {
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "file-2.txt", content: "Content of file-2" },
			];
			const kvNamespace = {
				title: "__test-name-workers_sites_assets",
				id: "__test-name-workers_sites_assets-id",
			};
			writeWranglerToml({
				main: "./index.js",
				site: {
					bucket: "assets",
				},
			});
			writeWorkerSource();
			writeAssets(assets);
			mockUploadWorkerRequest();
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, []);
			// Check we only upload file-1
			mockUploadAssetsToKVRequest(
				kvNamespace.id,
				assets.filter((a) => a.filePath === "file-1.txt")
			);
			await runWrangler("deploy --site-exclude file-2.txt");

			expect(std.info).toMatchInlineSnapshot(`
			"Fetching list of already uploaded assets...
			Building list of assets to upload...
			 + file-1.2ca234f380.txt (uploading new version of file-1.txt)
			Uploading 1 new asset...
			Uploaded 100% [1 out of 1]"
		`);
			expect(std.out).toMatchInlineSnapshot(`
				"↗️  Done syncing assets
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should only upload files that match the `site.include` config", async () => {
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "file-2.txt", content: "Content of file-2" },
			];
			const kvNamespace = {
				title: "__test-name-workers_sites_assets",
				id: "__test-name-workers_sites_assets-id",
			};
			writeWranglerToml({
				main: "./index.js",
				site: {
					bucket: "assets",
					include: ["file-1.txt"],
				},
			});
			writeWorkerSource();
			writeAssets(assets);
			mockUploadWorkerRequest();
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, []);
			// Check we only upload file-1
			mockUploadAssetsToKVRequest(
				kvNamespace.id,
				assets.filter((a) => a.filePath === "file-1.txt")
			);
			await runWrangler("deploy");

			expect(std.info).toMatchInlineSnapshot(`
			"Fetching list of already uploaded assets...
			Building list of assets to upload...
			 + file-1.2ca234f380.txt (uploading new version of file-1.txt)
			Uploading 1 new asset...
			Uploaded 100% [1 out of 1]"
		`);
			expect(std.out).toMatchInlineSnapshot(`
				"↗️  Done syncing assets
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should not upload files that match the `site.exclude` config", async () => {
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "file-2.txt", content: "Content of file-2" },
			];
			const kvNamespace = {
				title: "__test-name-workers_sites_assets",
				id: "__test-name-workers_sites_assets-id",
			};
			writeWranglerToml({
				main: "./index.js",
				site: {
					bucket: "assets",
					exclude: ["file-2.txt"],
				},
			});
			writeWorkerSource();
			writeAssets(assets);
			mockUploadWorkerRequest();
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, []);
			// Check we only upload file-1
			mockUploadAssetsToKVRequest(
				kvNamespace.id,
				assets.filter((a) => a.filePath === "file-1.txt")
			);
			await runWrangler("deploy");

			expect(std.info).toMatchInlineSnapshot(`
			"Fetching list of already uploaded assets...
			Building list of assets to upload...
			 + file-1.2ca234f380.txt (uploading new version of file-1.txt)
			Uploading 1 new asset...
			Uploaded 100% [1 out of 1]"
		`);
			expect(std.out).toMatchInlineSnapshot(`
				"↗️  Done syncing assets
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should use `site-include` arg over `site.include` config", async () => {
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "file-2.txt", content: "Content of file-2" },
			];
			const kvNamespace = {
				title: "__test-name-workers_sites_assets",
				id: "__test-name-workers_sites_assets-id",
			};
			writeWranglerToml({
				main: "./index.js",
				site: {
					bucket: "assets",
					include: ["file-2.txt"],
				},
			});
			writeWorkerSource();
			writeAssets(assets);
			mockUploadWorkerRequest();
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, []);
			// Check we only upload file-1
			mockUploadAssetsToKVRequest(
				kvNamespace.id,
				assets.filter((a) => a.filePath === "file-1.txt")
			);
			await runWrangler("deploy --site-include file-1.txt");

			expect(std.info).toMatchInlineSnapshot(`
			"Fetching list of already uploaded assets...
			Building list of assets to upload...
			 + file-1.2ca234f380.txt (uploading new version of file-1.txt)
			Uploading 1 new asset...
			Uploaded 100% [1 out of 1]"
		`);
			expect(std.out).toMatchInlineSnapshot(`
				"↗️  Done syncing assets
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should use `site-exclude` arg over `site.exclude` config", async () => {
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "file-2.txt", content: "Content of file-2" },
			];
			const kvNamespace = {
				title: "__test-name-workers_sites_assets",
				id: "__test-name-workers_sites_assets-id",
			};
			writeWranglerToml({
				main: "./index.js",
				site: {
					bucket: "assets",
					exclude: ["file-1.txt"],
				},
			});
			writeWorkerSource();
			writeAssets(assets);
			mockUploadWorkerRequest();
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, []);
			// Check we only upload file-1
			mockUploadAssetsToKVRequest(
				kvNamespace.id,
				assets.filter((a) => a.filePath.endsWith("file-1.txt"))
			);
			await runWrangler("deploy --site-exclude file-2.txt");

			expect(std.info).toMatchInlineSnapshot(`
			"Fetching list of already uploaded assets...
			Building list of assets to upload...
			 + file-1.2ca234f380.txt (uploading new version of file-1.txt)
			Uploading 1 new asset...
			Uploaded 100% [1 out of 1]"
		`);
			expect(std.out).toMatchInlineSnapshot(`
				"↗️  Done syncing assets
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should walk directories except node_modules", async () => {
			const assets = [
				{
					filePath: "directory-1/file-1.txt",
					content: "Content of file-1",
				},
				{
					filePath: "node_modules/file-2.txt",
					content: "Content of file-2",
				},
			];
			const kvNamespace = {
				title: "__test-name-workers_sites_assets",
				id: "__test-name-workers_sites_assets-id",
			};
			writeWranglerToml({
				main: "./index.js",
				site: {
					bucket: "assets",
				},
			});
			writeWorkerSource();
			writeAssets(assets);
			mockUploadWorkerRequest();
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, []);
			// Only expect file-1 to be uploaded
			mockUploadAssetsToKVRequest(kvNamespace.id, assets.slice(0, 1));
			await runWrangler("deploy");

			expect(std.info).toMatchInlineSnapshot(`
			"Fetching list of already uploaded assets...
			Building list of assets to upload...
			 + directory-1/file-1.2ca234f380.txt (uploading new version of directory-1/file-1.txt)
			Uploading 1 new asset...
			Uploaded 100% [1 out of 1]"
		`);
			expect(std.out).toMatchInlineSnapshot(`
				"↗️  Done syncing assets
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should skip hidden files and directories except `.well-known`", async () => {
			const assets = [
				{
					filePath: ".hidden-file.txt",
					content: "Content of hidden-file",
				},
				{
					filePath: ".hidden/file-1.txt",
					content: "Content of file-1",
				},
				{
					filePath: ".well-known/file-2.txt",
					content: "Content of file-2",
				},
			];
			const kvNamespace = {
				title: "__test-name-workers_sites_assets",
				id: "__test-name-workers_sites_assets-id",
			};
			writeWranglerToml({
				main: "./index.js",
				site: {
					bucket: "assets",
				},
			});
			writeWorkerSource();
			writeAssets(assets);
			mockUploadWorkerRequest();
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, []);
			// Only expect file-2 to be uploaded
			mockUploadAssetsToKVRequest(kvNamespace.id, assets.slice(2));
			await runWrangler("deploy");

			expect(std.info).toMatchInlineSnapshot(`
			"Fetching list of already uploaded assets...
			Building list of assets to upload...
			 + .well-known/file-2.5938485188.txt (uploading new version of .well-known/file-2.txt)
			Uploading 1 new asset...
			Uploaded 100% [1 out of 1]"
		`);
			expect(std.out).toMatchInlineSnapshot(`
				"↗️  Done syncing assets
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should error if the asset is over 25Mb", async () => {
			const assets = [
				{
					filePath: "large-file.txt",
					// This file is greater than 25MiB when base64 encoded but small enough to be uploaded.
					content: "X".repeat(25 * 1024 * 1024 * 0.8 + 1),
				},
				{
					filePath: "too-large-file.txt",
					content: "X".repeat(25 * 1024 * 1024 + 1),
				},
			];
			const kvNamespace = {
				title: "__test-name-workers_sites_assets",
				id: "__test-name-workers_sites_assets-id",
			};
			writeWranglerToml({
				main: "./index.js",
				site: {
					bucket: "assets",
					exclude: ["file-1.txt"],
				},
			});
			writeWorkerSource();
			writeAssets(assets);
			mockUploadWorkerRequest();
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, []);

			await expect(
				runWrangler("deploy")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: File too-large-file.txt is too big, it should be under 25 MiB. See https://developers.cloudflare.com/workers/platform/limits#kv-limits]`
			);

			expect(std.info).toMatchInlineSnapshot(`
			"Fetching list of already uploaded assets...
			Building list of assets to upload...
			 + large-file.0ea0637a45.txt (uploading new version of large-file.txt)"
		`);
			expect(std.out).toMatchInlineSnapshot(`""`);
			expect(std.err).toMatchInlineSnapshot(`
			        "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mFile too-large-file.txt is too big, it should be under 25 MiB. See https://developers.cloudflare.com/workers/platform/limits#kv-limits[0m

			        "
		      `);
		});

		it("should batch assets in groups <100 mb", async () => {
			// Let's have 20 files, from size 1 - 20 mb
			const assets = Array.from({ length: 20 }, (_, index) => ({
				filePath: `file-${`${index}`.padStart(2, "0")}.txt`,
				content: "X".repeat(1024 * 1024 * (index + 1)),
			}));

			const kvNamespace = {
				title: "__test-name-workers_sites_assets",
				id: "__test-name-workers_sites_assets-id",
			};
			writeWranglerToml({
				main: "./index.js",
				site: {
					bucket: "assets",
				},
			});
			writeWorkerSource();
			writeAssets(assets);
			mockUploadWorkerRequest();
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, []);
			const requests = mockUploadAssetsToKVRequest(kvNamespace.id);

			await runWrangler("deploy");

			// We expect this to be uploaded in 4 batches
			expect(requests.length).toEqual(4);
			// Buckets may be uploaded in any order, so sort them before we assert
			requests.sort((a, b) => a.uploads[0].key.localeCompare(b.uploads[0].key));
			// The first batch has 11 files
			expect(requests[0].uploads.length).toEqual(11);
			// The next batch has 5 files
			expect(requests[1].uploads.length).toEqual(5);
			// And the next one has 3 files
			expect(requests[2].uploads.length).toEqual(3);
			// And just 1 in the last batch
			expect(requests[3].uploads.length).toEqual(1);

			let assetIndex = 0;
			for (const request of requests) {
				for (const upload of request.uploads) {
					checkAssetUpload(assets[assetIndex], upload);
					assetIndex++;
				}
			}

			expect(std.debug).toMatchInlineSnapshot(`""`);
			expect(std.out).toMatchInlineSnapshot(`
				"↗️  Done syncing assets
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			// Mask all but last upload progress message as upload order unknown
			// (regexp replaces all single/double-digit percentages, i.e. not 100%)
			expect(std.info.replace(/Uploaded \d\d?% \[\d+/g, "Uploaded X% [X"))
				.toMatchInlineSnapshot(`
			"Fetching list of already uploaded assets...
			Building list of assets to upload...
			 + file-00.be5be5dd26.txt (uploading new version of file-00.txt)
			 + file-01.4842d35994.txt (uploading new version of file-01.txt)
			 + file-02.990572ec63.txt (uploading new version of file-02.txt)
			 + file-03.9d7dda9045.txt (uploading new version of file-03.txt)
			 + file-04.2b6fac6382.txt (uploading new version of file-04.txt)
			 + file-05.55762dc758.txt (uploading new version of file-05.txt)
			 + file-06.f408a6b020.txt (uploading new version of file-06.txt)
			 + file-07.64c051715b.txt (uploading new version of file-07.txt)
			 + file-08.d286789adb.txt (uploading new version of file-08.txt)
			 + file-09.6838c183a8.txt (uploading new version of file-09.txt)
			 + file-10.6e03221d2a.txt (uploading new version of file-10.txt)
			 + file-11.37d3fb2eff.txt (uploading new version of file-11.txt)
			 + file-12.b3556942f8.txt (uploading new version of file-12.txt)
			 + file-13.680caf51b1.txt (uploading new version of file-13.txt)
			 + file-14.51e88468f0.txt (uploading new version of file-14.txt)
			 + file-15.8e3fedb394.txt (uploading new version of file-15.txt)
			 + file-16.c81c5e426f.txt (uploading new version of file-16.txt)
			 + file-17.4b2ae3c47b.txt (uploading new version of file-17.txt)
			 + file-18.07f245e02b.txt (uploading new version of file-18.txt)
			 + file-19.f0d69f705d.txt (uploading new version of file-19.txt)
			Uploading 20 new assets...
			Uploaded X% [X out of 20]
			Uploaded X% [X out of 20]
			Uploaded X% [X out of 20]
			Uploaded 100% [20 out of 20]"
		`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should error if the asset key is over 512 characters", async () => {
			const longFilePathAsset = {
				filePath: "folder/".repeat(100) + "file.txt",
				content: "content of file",
			};
			const kvNamespace = {
				title: "__test-name-workers_sites_assets",
				id: "__test-name-workers_sites_assets-id",
			};
			writeWranglerToml({
				main: "./index.js",
				site: {
					bucket: "assets",
				},
			});
			writeWorkerSource();
			writeAssets([longFilePathAsset]);
			mockUploadWorkerRequest();
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, []);

			await expect(
				runWrangler("deploy")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: The asset path key "folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/file.3da0d0cd12.txt" exceeds the maximum key size limit of 512. See https://developers.cloudflare.com/workers/platform/limits#kv-limits",]`
			);

			expect(std.info).toMatchInlineSnapshot(`
			"Fetching list of already uploaded assets...
			Building list of assets to upload..."
		`);
			expect(std.out).toMatchInlineSnapshot(`""`);
			expect(std.err).toMatchInlineSnapshot(`
			        "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mThe asset path key \\"folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/file.3da0d0cd12.txt\\" exceeds the maximum key size limit of 512. See https://developers.cloudflare.com/workers/platform/limits#kv-limits\\",[0m

			        "
		      `);
		});

		it("should delete uploaded assets that aren't included anymore", async () => {
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "file-2.txt", content: "Content of file-2" },
			];
			const kvNamespace = {
				title: "__test-name-workers_sites_assets",
				id: "__test-name-workers_sites_assets-id",
			};
			writeWranglerToml({
				main: "./index.js",
				site: {
					bucket: "assets",
				},
			});
			writeWorkerSource();
			writeAssets(assets);
			mockUploadWorkerRequest();
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, [
				// Put file-1 in the KV namespace
				{ name: "file-1.2ca234f380.txt" },
				// As well as a couple from a previous upload
				{ name: "file-3.somehash.txt" },
				{ name: "file-4.anotherhash.txt" },
			]);

			// we upload only file-1.txt
			mockUploadAssetsToKVRequest(
				kvNamespace.id,
				assets.filter((a) => a.filePath !== "file-1.txt")
			);

			// and mark file-3 and file-4 for deletion
			mockDeleteUnusedAssetsRequest(kvNamespace.id, [
				"file-3.somehash.txt",
				"file-4.anotherhash.txt",
			]);

			await runWrangler("deploy");

			expect(std.info).toMatchInlineSnapshot(`
			"Fetching list of already uploaded assets...
			Building list of assets to upload...
			 = file-1.2ca234f380.txt (already uploaded file-1.txt)
			 + file-2.5938485188.txt (uploading new version of file-2.txt)
			 - file-3.somehash.txt (removing as stale)
			 - file-4.anotherhash.txt (removing as stale)
			Uploading 1 new asset...
			Skipped uploading 1 existing asset.
			Uploaded 100% [1 out of 1]
			Removing 2 stale assets..."
		`);
			expect(std.out).toMatchInlineSnapshot(`
				"↗️  Done syncing assets
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should generate an asset manifest with keys relative to site.bucket", async () => {
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "file-2.txt", content: "Content of file-2" },
			];
			const kvNamespace = {
				title: "__test-name-workers_sites_assets",
				id: "__test-name-workers_sites_assets-id",
			};

			writeWranglerToml({
				main: "./src/index.js",
				site: {
					bucket: "assets",
				},
			});
			writeWorkerSource({ basePath: "src", type: "esm" });
			writeAssets(assets);
			mockUploadWorkerRequest({
				expectedBindings: [
					{
						name: "__STATIC_CONTENT",
						namespace_id: "__test-name-workers_sites_assets-id",
						type: "kv_namespace",
					},
				],
				expectedModules: {
					__STATIC_CONTENT_MANIFEST:
						'{"file-1.txt":"file-1.2ca234f380.txt","file-2.txt":"file-2.5938485188.txt"}',
				},
			});
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, []);
			mockUploadAssetsToKVRequest(kvNamespace.id, assets);

			process.chdir("./src");
			await runWrangler("deploy");
			process.chdir("../");

			expect(std.info).toMatchInlineSnapshot(`
			"Fetching list of already uploaded assets...
			Building list of assets to upload...
			 + file-1.2ca234f380.txt (uploading new version of file-1.txt)
			 + file-2.5938485188.txt (uploading new version of file-2.txt)
			Uploading 2 new assets...
			Uploaded 100% [2 out of 2]"
		`);
			expect(std.out).toMatchInlineSnapshot(`
				"↗️  Done syncing assets
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should use the relative path from current working directory to Worker directory when using `--site`", async () => {
			writeWranglerToml({
				main: "./index.js",
			});
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "file-2.txt", content: "Content of file-2" },
			];
			writeAssets(assets, "my-assets");

			const kvNamespace = {
				title: "__test-name-workers_sites_assets",
				id: "__test-name-workers_sites_assets-id",
			};

			mockSubDomainRequest();
			writeWorkerSource();
			mockUploadWorkerRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, []);
			mockUploadAssetsToKVRequest(kvNamespace.id, assets);
			process.chdir("./my-assets");
			await runWrangler("deploy --site .");

			expect(std).toMatchInlineSnapshot(`
				Object {
				  "debug": "",
				  "err": "",
				  "info": "Fetching list of already uploaded assets...
				Building list of assets to upload...
				 + file-1.2ca234f380.txt (uploading new version of file-1.txt)
				 + file-2.5938485188.txt (uploading new version of file-2.txt)
				Uploading 2 new assets...
				Uploaded 100% [2 out of 2]",
				  "out": "↗️  Done syncing assets
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class",
				  "warn": "",
				}
			`);
		});

		it("should use the relative path from current working directory to Worker directory when using `--legacy-assets`", async () => {
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "file-2.txt", content: "Content of file-2" },
			];
			const kvNamespace = {
				title: "__test-name-workers_sites_assets",
				id: "__test-name-workers_sites_assets-id",
			};
			writeWranglerToml({
				main: "./index.js",
			});
			writeWorkerSource();
			writeAssets(assets, "my-assets");
			mockUploadWorkerRequest({
				expectedMainModule: "index.js",
			});
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, []);
			mockUploadAssetsToKVRequest(kvNamespace.id, assets);
			process.chdir("./my-assets");
			await runWrangler("deploy --legacy-assets .");

			expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe --legacy-assets argument has been deprecated. Please use --assets instead.[0m

				  To learn more about Workers with assets, visit our documentation at
				  [4mhttps://developers.cloudflare.com/workers/frameworks/[0m.

				"
			`);
			expect(std.info).toMatchInlineSnapshot(`
				"Fetching list of already uploaded assets...
				Building list of assets to upload...
				 + file-1.2ca234f380.txt (uploading new version of file-1.txt)
				 + file-2.5938485188.txt (uploading new version of file-2.txt)
				Uploading 2 new assets...
				Uploaded 100% [2 out of 2]"
			`);
			expect(std.out).toMatchInlineSnapshot(`
				"↗️  Done syncing assets
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
		});

		it("should abort other bucket uploads if one bucket upload fails", async () => {
			// Write 9 20MiB files, should end up with 3 buckets
			const content = "X".repeat(20 * 1024 * 1024);
			const assets = Array.from({ length: 9 }, (_, index) => ({
				filePath: `file-${index}.txt`,
				content,
			}));

			const kvNamespace = {
				title: "__test-name-workers_sites_assets",
				id: "__test-name-workers_sites_assets-id",
			};
			writeWranglerToml({
				main: "./index.js",
				site: {
					bucket: "assets",
				},
			});
			writeWorkerSource();
			writeAssets(assets);
			mockUploadWorkerRequest();
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, []);

			let requestCount = 0;
			const bulkUrl =
				"*/accounts/:accountId/storage/kv/namespaces/:namespaceId/bulk";
			msw.use(
				http.put(bulkUrl, async ({ params }) => {
					expect(params.accountId).toEqual("some-account-id");
					expect(params.namespaceId).toEqual(kvNamespace.id);
					requestCount++;
					return HttpResponse.json(
						createFetchResult([], false, [
							{ code: 1000, message: "Whoops! Something went wrong!" },
						]),
						{ status: 500 }
					);
				})
			);

			await expect(
				runWrangler("deploy")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[APIError: A request to the Cloudflare API (/accounts/some-account-id/storage/kv/namespaces/__test-name-workers_sites_assets-id/bulk) failed.]`
			);

			expect(requestCount).toBeLessThan(3);
			expect(std.info).toMatchInlineSnapshot(`
			"Fetching list of already uploaded assets...
			Building list of assets to upload...
			 + file-0.f0d69f705d.txt (uploading new version of file-0.txt)
			 + file-1.f0d69f705d.txt (uploading new version of file-1.txt)
			 + file-2.f0d69f705d.txt (uploading new version of file-2.txt)
			 + file-3.f0d69f705d.txt (uploading new version of file-3.txt)
			 + file-4.f0d69f705d.txt (uploading new version of file-4.txt)
			 + file-5.f0d69f705d.txt (uploading new version of file-5.txt)
			 + file-6.f0d69f705d.txt (uploading new version of file-6.txt)
			 + file-7.f0d69f705d.txt (uploading new version of file-7.txt)
			 + file-8.f0d69f705d.txt (uploading new version of file-8.txt)
			Uploading 9 new assets...
			Upload failed, aborting..."
		`);
		});

		describe("should truncate diff with over 100 assets unless debug log level set", () => {
			beforeEach(() => {
				const assets = Array.from({ length: 110 }, (_, index) => ({
					filePath: `file-${`${index}`.padStart(3, "0")}.txt`,
					content: "X",
				}));

				const kvNamespace = {
					title: "__test-name-workers_sites_assets",
					id: "__test-name-workers_sites_assets-id",
				};
				writeWranglerToml({
					main: "./index.js",
					site: {
						bucket: "assets",
					},
				});
				writeWorkerSource();
				writeAssets(assets);
				mockUploadWorkerRequest();
				mockSubDomainRequest();
				mockListKVNamespacesRequest(kvNamespace);
				mockKeyListRequest(kvNamespace.id, []);
				mockUploadAssetsToKVRequest(kvNamespace.id);
			});

			it("default log level", async () => {
				await runWrangler("deploy");
				expect(std).toMatchInlineSnapshot(`
					Object {
					  "debug": "",
					  "err": "",
					  "info": "Fetching list of already uploaded assets...
					Building list of assets to upload...
					 + file-000.010257e8bb.txt (uploading new version of file-000.txt)
					 + file-001.010257e8bb.txt (uploading new version of file-001.txt)
					 + file-002.010257e8bb.txt (uploading new version of file-002.txt)
					 + file-003.010257e8bb.txt (uploading new version of file-003.txt)
					 + file-004.010257e8bb.txt (uploading new version of file-004.txt)
					 + file-005.010257e8bb.txt (uploading new version of file-005.txt)
					 + file-006.010257e8bb.txt (uploading new version of file-006.txt)
					 + file-007.010257e8bb.txt (uploading new version of file-007.txt)
					 + file-008.010257e8bb.txt (uploading new version of file-008.txt)
					 + file-009.010257e8bb.txt (uploading new version of file-009.txt)
					 + file-010.010257e8bb.txt (uploading new version of file-010.txt)
					 + file-011.010257e8bb.txt (uploading new version of file-011.txt)
					 + file-012.010257e8bb.txt (uploading new version of file-012.txt)
					 + file-013.010257e8bb.txt (uploading new version of file-013.txt)
					 + file-014.010257e8bb.txt (uploading new version of file-014.txt)
					 + file-015.010257e8bb.txt (uploading new version of file-015.txt)
					 + file-016.010257e8bb.txt (uploading new version of file-016.txt)
					 + file-017.010257e8bb.txt (uploading new version of file-017.txt)
					 + file-018.010257e8bb.txt (uploading new version of file-018.txt)
					 + file-019.010257e8bb.txt (uploading new version of file-019.txt)
					 + file-020.010257e8bb.txt (uploading new version of file-020.txt)
					 + file-021.010257e8bb.txt (uploading new version of file-021.txt)
					 + file-022.010257e8bb.txt (uploading new version of file-022.txt)
					 + file-023.010257e8bb.txt (uploading new version of file-023.txt)
					 + file-024.010257e8bb.txt (uploading new version of file-024.txt)
					 + file-025.010257e8bb.txt (uploading new version of file-025.txt)
					 + file-026.010257e8bb.txt (uploading new version of file-026.txt)
					 + file-027.010257e8bb.txt (uploading new version of file-027.txt)
					 + file-028.010257e8bb.txt (uploading new version of file-028.txt)
					 + file-029.010257e8bb.txt (uploading new version of file-029.txt)
					 + file-030.010257e8bb.txt (uploading new version of file-030.txt)
					 + file-031.010257e8bb.txt (uploading new version of file-031.txt)
					 + file-032.010257e8bb.txt (uploading new version of file-032.txt)
					 + file-033.010257e8bb.txt (uploading new version of file-033.txt)
					 + file-034.010257e8bb.txt (uploading new version of file-034.txt)
					 + file-035.010257e8bb.txt (uploading new version of file-035.txt)
					 + file-036.010257e8bb.txt (uploading new version of file-036.txt)
					 + file-037.010257e8bb.txt (uploading new version of file-037.txt)
					 + file-038.010257e8bb.txt (uploading new version of file-038.txt)
					 + file-039.010257e8bb.txt (uploading new version of file-039.txt)
					 + file-040.010257e8bb.txt (uploading new version of file-040.txt)
					 + file-041.010257e8bb.txt (uploading new version of file-041.txt)
					 + file-042.010257e8bb.txt (uploading new version of file-042.txt)
					 + file-043.010257e8bb.txt (uploading new version of file-043.txt)
					 + file-044.010257e8bb.txt (uploading new version of file-044.txt)
					 + file-045.010257e8bb.txt (uploading new version of file-045.txt)
					 + file-046.010257e8bb.txt (uploading new version of file-046.txt)
					 + file-047.010257e8bb.txt (uploading new version of file-047.txt)
					 + file-048.010257e8bb.txt (uploading new version of file-048.txt)
					 + file-049.010257e8bb.txt (uploading new version of file-049.txt)
					 + file-050.010257e8bb.txt (uploading new version of file-050.txt)
					 + file-051.010257e8bb.txt (uploading new version of file-051.txt)
					 + file-052.010257e8bb.txt (uploading new version of file-052.txt)
					 + file-053.010257e8bb.txt (uploading new version of file-053.txt)
					 + file-054.010257e8bb.txt (uploading new version of file-054.txt)
					 + file-055.010257e8bb.txt (uploading new version of file-055.txt)
					 + file-056.010257e8bb.txt (uploading new version of file-056.txt)
					 + file-057.010257e8bb.txt (uploading new version of file-057.txt)
					 + file-058.010257e8bb.txt (uploading new version of file-058.txt)
					 + file-059.010257e8bb.txt (uploading new version of file-059.txt)
					 + file-060.010257e8bb.txt (uploading new version of file-060.txt)
					 + file-061.010257e8bb.txt (uploading new version of file-061.txt)
					 + file-062.010257e8bb.txt (uploading new version of file-062.txt)
					 + file-063.010257e8bb.txt (uploading new version of file-063.txt)
					 + file-064.010257e8bb.txt (uploading new version of file-064.txt)
					 + file-065.010257e8bb.txt (uploading new version of file-065.txt)
					 + file-066.010257e8bb.txt (uploading new version of file-066.txt)
					 + file-067.010257e8bb.txt (uploading new version of file-067.txt)
					 + file-068.010257e8bb.txt (uploading new version of file-068.txt)
					 + file-069.010257e8bb.txt (uploading new version of file-069.txt)
					 + file-070.010257e8bb.txt (uploading new version of file-070.txt)
					 + file-071.010257e8bb.txt (uploading new version of file-071.txt)
					 + file-072.010257e8bb.txt (uploading new version of file-072.txt)
					 + file-073.010257e8bb.txt (uploading new version of file-073.txt)
					 + file-074.010257e8bb.txt (uploading new version of file-074.txt)
					 + file-075.010257e8bb.txt (uploading new version of file-075.txt)
					 + file-076.010257e8bb.txt (uploading new version of file-076.txt)
					 + file-077.010257e8bb.txt (uploading new version of file-077.txt)
					 + file-078.010257e8bb.txt (uploading new version of file-078.txt)
					 + file-079.010257e8bb.txt (uploading new version of file-079.txt)
					 + file-080.010257e8bb.txt (uploading new version of file-080.txt)
					 + file-081.010257e8bb.txt (uploading new version of file-081.txt)
					 + file-082.010257e8bb.txt (uploading new version of file-082.txt)
					 + file-083.010257e8bb.txt (uploading new version of file-083.txt)
					 + file-084.010257e8bb.txt (uploading new version of file-084.txt)
					 + file-085.010257e8bb.txt (uploading new version of file-085.txt)
					 + file-086.010257e8bb.txt (uploading new version of file-086.txt)
					 + file-087.010257e8bb.txt (uploading new version of file-087.txt)
					 + file-088.010257e8bb.txt (uploading new version of file-088.txt)
					 + file-089.010257e8bb.txt (uploading new version of file-089.txt)
					 + file-090.010257e8bb.txt (uploading new version of file-090.txt)
					 + file-091.010257e8bb.txt (uploading new version of file-091.txt)
					 + file-092.010257e8bb.txt (uploading new version of file-092.txt)
					 + file-093.010257e8bb.txt (uploading new version of file-093.txt)
					 + file-094.010257e8bb.txt (uploading new version of file-094.txt)
					 + file-095.010257e8bb.txt (uploading new version of file-095.txt)
					 + file-096.010257e8bb.txt (uploading new version of file-096.txt)
					 + file-097.010257e8bb.txt (uploading new version of file-097.txt)
					 + file-098.010257e8bb.txt (uploading new version of file-098.txt)
					 + file-099.010257e8bb.txt (uploading new version of file-099.txt)
					   (truncating changed assets log, set \`WRANGLER_LOG=debug\` environment variable to see full diff)
					Uploading 110 new assets...
					Uploaded 100% [110 out of 110]",
					  "out": "↗️  Done syncing assets
					Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class",
					  "warn": "",
					}
				`);
			});

			it("debug log level", async () => {
				vi.stubEnv("WRANGLER_LOG", "debug");
				vi.stubEnv("WRANGLER_LOG_SANITIZE", "false");

				await runWrangler("deploy");

				const diffRegexp = /^ [+=-]/;
				const diff = std.debug
					.split("\n")
					.filter((line) => diffRegexp.test(line))
					.join("\n");
				expect(diff).toMatchInlineSnapshot(`
			" + file-000.010257e8bb.txt (uploading new version of file-000.txt)
			 + file-001.010257e8bb.txt (uploading new version of file-001.txt)
			 + file-002.010257e8bb.txt (uploading new version of file-002.txt)
			 + file-003.010257e8bb.txt (uploading new version of file-003.txt)
			 + file-004.010257e8bb.txt (uploading new version of file-004.txt)
			 + file-005.010257e8bb.txt (uploading new version of file-005.txt)
			 + file-006.010257e8bb.txt (uploading new version of file-006.txt)
			 + file-007.010257e8bb.txt (uploading new version of file-007.txt)
			 + file-008.010257e8bb.txt (uploading new version of file-008.txt)
			 + file-009.010257e8bb.txt (uploading new version of file-009.txt)
			 + file-010.010257e8bb.txt (uploading new version of file-010.txt)
			 + file-011.010257e8bb.txt (uploading new version of file-011.txt)
			 + file-012.010257e8bb.txt (uploading new version of file-012.txt)
			 + file-013.010257e8bb.txt (uploading new version of file-013.txt)
			 + file-014.010257e8bb.txt (uploading new version of file-014.txt)
			 + file-015.010257e8bb.txt (uploading new version of file-015.txt)
			 + file-016.010257e8bb.txt (uploading new version of file-016.txt)
			 + file-017.010257e8bb.txt (uploading new version of file-017.txt)
			 + file-018.010257e8bb.txt (uploading new version of file-018.txt)
			 + file-019.010257e8bb.txt (uploading new version of file-019.txt)
			 + file-020.010257e8bb.txt (uploading new version of file-020.txt)
			 + file-021.010257e8bb.txt (uploading new version of file-021.txt)
			 + file-022.010257e8bb.txt (uploading new version of file-022.txt)
			 + file-023.010257e8bb.txt (uploading new version of file-023.txt)
			 + file-024.010257e8bb.txt (uploading new version of file-024.txt)
			 + file-025.010257e8bb.txt (uploading new version of file-025.txt)
			 + file-026.010257e8bb.txt (uploading new version of file-026.txt)
			 + file-027.010257e8bb.txt (uploading new version of file-027.txt)
			 + file-028.010257e8bb.txt (uploading new version of file-028.txt)
			 + file-029.010257e8bb.txt (uploading new version of file-029.txt)
			 + file-030.010257e8bb.txt (uploading new version of file-030.txt)
			 + file-031.010257e8bb.txt (uploading new version of file-031.txt)
			 + file-032.010257e8bb.txt (uploading new version of file-032.txt)
			 + file-033.010257e8bb.txt (uploading new version of file-033.txt)
			 + file-034.010257e8bb.txt (uploading new version of file-034.txt)
			 + file-035.010257e8bb.txt (uploading new version of file-035.txt)
			 + file-036.010257e8bb.txt (uploading new version of file-036.txt)
			 + file-037.010257e8bb.txt (uploading new version of file-037.txt)
			 + file-038.010257e8bb.txt (uploading new version of file-038.txt)
			 + file-039.010257e8bb.txt (uploading new version of file-039.txt)
			 + file-040.010257e8bb.txt (uploading new version of file-040.txt)
			 + file-041.010257e8bb.txt (uploading new version of file-041.txt)
			 + file-042.010257e8bb.txt (uploading new version of file-042.txt)
			 + file-043.010257e8bb.txt (uploading new version of file-043.txt)
			 + file-044.010257e8bb.txt (uploading new version of file-044.txt)
			 + file-045.010257e8bb.txt (uploading new version of file-045.txt)
			 + file-046.010257e8bb.txt (uploading new version of file-046.txt)
			 + file-047.010257e8bb.txt (uploading new version of file-047.txt)
			 + file-048.010257e8bb.txt (uploading new version of file-048.txt)
			 + file-049.010257e8bb.txt (uploading new version of file-049.txt)
			 + file-050.010257e8bb.txt (uploading new version of file-050.txt)
			 + file-051.010257e8bb.txt (uploading new version of file-051.txt)
			 + file-052.010257e8bb.txt (uploading new version of file-052.txt)
			 + file-053.010257e8bb.txt (uploading new version of file-053.txt)
			 + file-054.010257e8bb.txt (uploading new version of file-054.txt)
			 + file-055.010257e8bb.txt (uploading new version of file-055.txt)
			 + file-056.010257e8bb.txt (uploading new version of file-056.txt)
			 + file-057.010257e8bb.txt (uploading new version of file-057.txt)
			 + file-058.010257e8bb.txt (uploading new version of file-058.txt)
			 + file-059.010257e8bb.txt (uploading new version of file-059.txt)
			 + file-060.010257e8bb.txt (uploading new version of file-060.txt)
			 + file-061.010257e8bb.txt (uploading new version of file-061.txt)
			 + file-062.010257e8bb.txt (uploading new version of file-062.txt)
			 + file-063.010257e8bb.txt (uploading new version of file-063.txt)
			 + file-064.010257e8bb.txt (uploading new version of file-064.txt)
			 + file-065.010257e8bb.txt (uploading new version of file-065.txt)
			 + file-066.010257e8bb.txt (uploading new version of file-066.txt)
			 + file-067.010257e8bb.txt (uploading new version of file-067.txt)
			 + file-068.010257e8bb.txt (uploading new version of file-068.txt)
			 + file-069.010257e8bb.txt (uploading new version of file-069.txt)
			 + file-070.010257e8bb.txt (uploading new version of file-070.txt)
			 + file-071.010257e8bb.txt (uploading new version of file-071.txt)
			 + file-072.010257e8bb.txt (uploading new version of file-072.txt)
			 + file-073.010257e8bb.txt (uploading new version of file-073.txt)
			 + file-074.010257e8bb.txt (uploading new version of file-074.txt)
			 + file-075.010257e8bb.txt (uploading new version of file-075.txt)
			 + file-076.010257e8bb.txt (uploading new version of file-076.txt)
			 + file-077.010257e8bb.txt (uploading new version of file-077.txt)
			 + file-078.010257e8bb.txt (uploading new version of file-078.txt)
			 + file-079.010257e8bb.txt (uploading new version of file-079.txt)
			 + file-080.010257e8bb.txt (uploading new version of file-080.txt)
			 + file-081.010257e8bb.txt (uploading new version of file-081.txt)
			 + file-082.010257e8bb.txt (uploading new version of file-082.txt)
			 + file-083.010257e8bb.txt (uploading new version of file-083.txt)
			 + file-084.010257e8bb.txt (uploading new version of file-084.txt)
			 + file-085.010257e8bb.txt (uploading new version of file-085.txt)
			 + file-086.010257e8bb.txt (uploading new version of file-086.txt)
			 + file-087.010257e8bb.txt (uploading new version of file-087.txt)
			 + file-088.010257e8bb.txt (uploading new version of file-088.txt)
			 + file-089.010257e8bb.txt (uploading new version of file-089.txt)
			 + file-090.010257e8bb.txt (uploading new version of file-090.txt)
			 + file-091.010257e8bb.txt (uploading new version of file-091.txt)
			 + file-092.010257e8bb.txt (uploading new version of file-092.txt)
			 + file-093.010257e8bb.txt (uploading new version of file-093.txt)
			 + file-094.010257e8bb.txt (uploading new version of file-094.txt)
			 + file-095.010257e8bb.txt (uploading new version of file-095.txt)
			 + file-096.010257e8bb.txt (uploading new version of file-096.txt)
			 + file-097.010257e8bb.txt (uploading new version of file-097.txt)
			 + file-098.010257e8bb.txt (uploading new version of file-098.txt)
			 + file-099.010257e8bb.txt (uploading new version of file-099.txt)
			 + file-100.010257e8bb.txt (uploading new version of file-100.txt)
			 + file-101.010257e8bb.txt (uploading new version of file-101.txt)
			 + file-102.010257e8bb.txt (uploading new version of file-102.txt)
			 + file-103.010257e8bb.txt (uploading new version of file-103.txt)
			 + file-104.010257e8bb.txt (uploading new version of file-104.txt)
			 + file-105.010257e8bb.txt (uploading new version of file-105.txt)
			 + file-106.010257e8bb.txt (uploading new version of file-106.txt)
			 + file-107.010257e8bb.txt (uploading new version of file-107.txt)
			 + file-108.010257e8bb.txt (uploading new version of file-108.txt)
			 + file-109.010257e8bb.txt (uploading new version of file-109.txt)"
		`);
				expect(std.info).toMatchInlineSnapshot(`
			"Fetching list of already uploaded assets...
			Building list of assets to upload...
			Uploading 110 new assets...
			Uploaded 100% [110 out of 110]"
		`);
			});
		});
	});

	describe("--assets", () => {
		it("should use the directory specified in the CLI over wrangler.toml", async () => {
			const cliAssets = [
				{ filePath: "cliAsset.txt", content: "Content of file-1" },
			];
			writeAssets(cliAssets, "cli-assets");
			const configAssets = [
				{ filePath: "configAsset.txt", content: "Content of file-2" },
			];
			writeAssets(configAssets, "config-assets");
			writeWranglerToml({
				assets: { directory: "config-assets" },
			});
			const bodies: AssetManifest[] = [];
			await mockAUSRequest(bodies);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedAssets: {
					jwt: "<<aus-completion-token>>",
					config: {},
				},
				expectedType: "none",
			});
			await runWrangler("deploy --assets cli-assets");
			expect(bodies.length).toBe(1);
			expect(bodies[0]).toEqual({
				manifest: {
					"/cliAsset.txt": {
						hash: "0de3dd5df907418e9730fd2bd747bd5e",
						size: 17,
					},
				},
			});
		});

		it("should error if config.site and config.assets are used together", async () => {
			writeWranglerToml({
				main: "./index.js",
				assets: { directory: "abd" },
				site: {
					bucket: "xyz",
				},
			});
			writeWorkerSource();
			await expect(
				runWrangler("deploy")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				dedent`[Error: Cannot use assets and Workers Sites in the same Worker.
				Please remove either the \`site\` or \`assets\` field from your configuration file.]`
			);
		});

		it("should error if --assets and config.site are used together", async () => {
			writeWranglerToml({
				main: "./index.js",
				site: {
					bucket: "xyz",
				},
			});
			writeWorkerSource();
			await expect(
				runWrangler("deploy --assets abc")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				dedent`[Error: Cannot use assets and Workers Sites in the same Worker.
				Please remove either the \`site\` or \`assets\` field from your configuration file.]`
			);
		});

		it("should error if --assets and config.tail_consumers are used together", async () => {
			writeWranglerToml({
				tail_consumers: [{ service: "<TAIL_WORKER_NAME>" }],
			});
			fs.mkdirSync("public");
			await expect(
				runWrangler("deploy --assets public")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Cannot use assets and tail consumers in the same Worker. Tail Workers are not yet supported for Workers with assets.]`
			);
		});

		it("should error if config.assets and config.tail_consumers are used together", async () => {
			writeWranglerToml({
				assets: { directory: "./public" },
				tail_consumers: [{ service: "<TAIL_WORKER_NAME>" }],
			});
			fs.mkdirSync("public");
			await expect(
				runWrangler("deploy")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Cannot use assets and tail consumers in the same Worker. Tail Workers are not yet supported for Workers with assets.]`
			);
		});

		it("should error if directory specified by flag --assets does not exist", async () => {
			await expect(runWrangler("deploy --assets abc")).rejects.toThrow(
				new RegExp(
					'^The directory specified by the "--assets" command line argument does not exist:[Ss]*'
				)
			);
		});

		it("should error if directory specified by config assets does not exist", async () => {
			writeWranglerToml({
				assets: { directory: "abc" },
			});
			await expect(runWrangler("deploy")).rejects.toThrow(
				new RegExp(
					'^The directory specified by the "assets.directory" field in your configuration file does not exist:[Ss]*'
				)
			);
		});

		it("should error if an ASSET binding is provided without a user Worker", async () => {
			writeWranglerToml({
				assets: {
					directory: "xyz",
					binding: "ASSET",
				},
			});
			await expect(runWrangler("deploy")).rejects
				.toThrowErrorMatchingInlineSnapshot(`
				[Error: Cannot use assets with a binding in an assets-only Worker.
				Please remove the asset binding from your configuration file, or provide a Worker script in your configuration file (\`main\`).]
			`);
		});

		it("should be able to upload files with special characters in filepaths", async () => {
			// NB windows will disallow these characters in file paths anyway < > : " / \ | ? *
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "boop/file#1.txt", content: "Content of file-2" },
				{ filePath: "béëp/boo^p.txt", content: "Content of file-3" },
			];
			writeAssets(assets);
			writeWranglerToml({
				assets: { directory: "assets" },
			});

			const manifestBodies: AssetManifest[] = [];
			const mockBuckets = [
				[
					"ff5016e92f039aa743a4ff7abb3180fa",
					"7574a8cd3094a050388ac9663af1c1d6",
					"0de3dd5df907418e9730fd2bd747bd5e",
				],
			];
			await mockAUSRequest(manifestBodies, mockBuckets, "<<aus-token>>");
			const uploadBodies: FormData[] = [];
			const uploadAuthHeaders: (string | null)[] = [];
			const uploadContentTypeHeaders: (string | null)[] = [];
			await mockAssetUploadRequest(
				mockBuckets.length,
				uploadBodies,
				uploadContentTypeHeaders,
				uploadAuthHeaders
			);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedAssets: {
					jwt: "<<aus-completion-token>>",
					config: {},
				},
				expectedType: "none",
			});
			await runWrangler("deploy");
			expect(manifestBodies.length).toBe(1);
			expect(manifestBodies[0]).toEqual({
				manifest: {
					"/béëp/boo^p.txt": {
						hash: "ff5016e92f039aa743a4ff7abb3180fa",
						size: 17,
					},
					"/boop/file#1.txt": {
						hash: "7574a8cd3094a050388ac9663af1c1d6",
						size: 17,
					},
					"/file-1.txt": {
						hash: "0de3dd5df907418e9730fd2bd747bd5e",
						size: 17,
					},
				},
			});
			const flatBodies = Object.fromEntries(
				uploadBodies.flatMap((b) => [...b.entries()])
			);
			await expect(
				flatBodies["ff5016e92f039aa743a4ff7abb3180fa"]
			).toBeAFileWhichMatches(
				new File(
					["Q29udGVudCBvZiBmaWxlLTM="],
					"ff5016e92f039aa743a4ff7abb3180fa",
					{
						// TODO: this should be "text/plain; charset=utf-8", but msw? is stripping the charset part
						type: "text/plain",
					}
				)
			);
			await expect(
				flatBodies["7574a8cd3094a050388ac9663af1c1d6"]
			).toBeAFileWhichMatches(
				new File(
					["Q29udGVudCBvZiBmaWxlLTI="],
					"7574a8cd3094a050388ac9663af1c1d6",
					{
						type: "text/plain",
					}
				)
			);
			await expect(
				flatBodies["0de3dd5df907418e9730fd2bd747bd5e"]
			).toBeAFileWhichMatches(
				new File(
					["Q29udGVudCBvZiBmaWxlLTE="],
					"0de3dd5df907418e9730fd2bd747bd5e",
					{
						type: "text/plain",
					}
				)
			);
		});

		it("should resolve assets directory relative to wrangler.toml if using config", async () => {
			const assets = [{ filePath: "file-1.txt", content: "Content of file-1" }];
			writeAssets(assets, "some/path/assets");
			writeWranglerToml(
				{
					assets: { directory: "assets" },
				},
				"some/path/wrangler.toml"
			);
			const bodies: AssetManifest[] = [];
			await mockAUSRequest(bodies);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedAssets: {
					jwt: "<<aus-completion-token>>",
					config: {},
				},
				expectedType: "none",
			});
			await runWrangler("deploy --config some/path/wrangler.toml");
			expect(bodies.length).toBe(1);
			expect(bodies[0]).toEqual({
				manifest: {
					"/file-1.txt": {
						hash: "0de3dd5df907418e9730fd2bd747bd5e",
						size: 17,
					},
				},
			});
		});

		it("should ignore assets that match patterns in an .assetsignore file in the root of the assets directory", async () => {
			const assets = [
				{ filePath: ".assetsignore", content: "*.bak\nsub-dir" },
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "file-2.bak", content: "Content of file-2" },
				{ filePath: "file-3.txt", content: "Content of file-3" },
				{ filePath: "sub-dir/file-4.bak", content: "Content of file-4" },
				{ filePath: "sub-dir/file-5.txt", content: "Content of file-5" },
			];
			writeAssets(assets, "some/path/assets");
			writeWranglerToml(
				{
					assets: { directory: "assets" },
				},
				"some/path/wrangler.toml"
			);
			const bodies: AssetManifest[] = [];
			await mockAUSRequest(bodies);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedAssets: {
					jwt: "<<aus-completion-token>>",
					config: {},
				},
				expectedType: "none",
			});
			await runWrangler("deploy --config some/path/wrangler.toml");
			expect(bodies.length).toBe(1);
			expect(bodies[0]).toMatchInlineSnapshot(`
				Object {
				  "manifest": Object {
				    "/file-1.txt": Object {
				      "hash": "0de3dd5df907418e9730fd2bd747bd5e",
				      "size": 17,
				    },
				    "/file-3.txt": Object {
				      "hash": "ff5016e92f039aa743a4ff7abb3180fa",
				      "size": 17,
				    },
				  },
				}
			`);
		});

		it("should error if it is going to upload a _worker.js file as an asset", async () => {
			const assets = [
				{ filePath: "_worker.js", content: "// some secret server-side code." },
			];
			writeAssets(assets, "some/path/assets");
			writeWranglerToml(
				{
					assets: { directory: "assets" },
				},
				"some/path/wrangler.toml"
			);
			const bodies: AssetManifest[] = [];
			await mockAUSRequest(bodies);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedAssets: {
					jwt: "<<aus-completion-token>>",
					config: {},
				},
				expectedType: "none",
			});
			await expect(runWrangler("deploy --config some/path/wrangler.toml"))
				.rejects.toThrowErrorMatchingInlineSnapshot(`
				[Error: Uploading a Pages _worker.js file as an asset.
				This could expose your private server-side code to the public Internet. Is this intended?
				If you do not want to upload this file, either remove it or add an ".assetsignore" file, to the root of your asset directory, containing "_worker.js" to avoid uploading.
				If you do want to upload this file, you can add an empty ".assetsignore" file, to the root of your asset directory, to hide this error.]
			`);
		});

		it("should error if it is going to upload a _worker.js directory as an asset", async () => {
			const assets = [
				{
					filePath: "_worker.js/index.js",
					content: "// some secret server-side code.",
				},
				{
					filePath: "_worker.js/dep.js",
					content: "// some secret server-side code.",
				},
			];
			writeAssets(assets, "some/path/assets");
			writeWranglerToml(
				{
					assets: { directory: "assets" },
				},
				"some/path/wrangler.toml"
			);
			const bodies: AssetManifest[] = [];
			await mockAUSRequest(bodies);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedAssets: {
					jwt: "<<aus-completion-token>>",
					config: {},
				},
				expectedType: "none",
			});
			await expect(runWrangler("deploy --config some/path/wrangler.toml"))
				.rejects.toThrowErrorMatchingInlineSnapshot(`
				[Error: Uploading a Pages _worker.js directory as an asset.
				This could expose your private server-side code to the public Internet. Is this intended?
				If you do not want to upload this directory, either remove it or add an ".assetsignore" file, to the root of your asset directory, containing "_worker.js" to avoid uploading.
				If you do want to upload this directory, you can add an empty ".assetsignore" file, to the root of your asset directory, to hide this error.]
			`);
		});

		it("should not error if it is going to upload a _worker.js file as an asset and there is an .assetsignore file", async () => {
			const assets = [
				{ filePath: ".assetsignore", content: "" },
				{ filePath: "_worker.js", content: "// some secret server-side code." },
			];
			writeAssets(assets, "some/path/assets");
			writeWranglerToml(
				{
					assets: { directory: "assets" },
				},
				"some/path/wrangler.toml"
			);
			const bodies: AssetManifest[] = [];
			await mockAUSRequest(bodies);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedAssets: {
					jwt: "<<aus-completion-token>>",
					config: {},
				},
				expectedType: "none",
			});
			await runWrangler("deploy --config some/path/wrangler.toml");
			expect(bodies.length).toBe(1);
			expect(bodies[0]).toMatchInlineSnapshot(`
				Object {
				  "manifest": Object {
				    "/_worker.js": Object {
				      "hash": "266570622a24a5fb8913d53fd3ac8562",
				      "size": 32,
				    },
				  },
				}
			`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("should not error if it is going to upload a _worker.js file that is not at the root of the asset directory", async () => {
			const assets = [
				{
					filePath: "foo/_worker.js",
					content: "// some secret server-side code.",
				},
			];
			writeAssets(assets, "some/path/assets");
			writeWranglerToml(
				{
					assets: { directory: "assets" },
				},
				"some/path/wrangler.toml"
			);
			const bodies: AssetManifest[] = [];
			await mockAUSRequest(bodies);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedAssets: {
					jwt: "<<aus-completion-token>>",
					config: {},
				},
				expectedType: "none",
			});
			await runWrangler("deploy --config some/path/wrangler.toml");
			expect(bodies.length).toBe(1);
			expect(bodies[0]).toMatchInlineSnapshot(`
				Object {
				  "manifest": Object {
				    "/foo/_worker.js": Object {
				      "hash": "266570622a24a5fb8913d53fd3ac8562",
				      "size": 32,
				    },
				  },
				}
			`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("should resolve assets directory relative to cwd if using cli", async () => {
			const assets = [{ filePath: "file-1.txt", content: "Content of file-1" }];
			writeAssets(assets, "some/path/assets");
			const bodies: AssetManifest[] = [];
			await mockAUSRequest(bodies);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedAssets: {
					jwt: "<<aus-completion-token>>",
					config: {},
				},
				expectedType: "none",
			});
			process.chdir("some/path");
			await runWrangler(
				"deploy --name test-name --compatibility-date 2024-07-31 --assets assets"
			);
			expect(bodies.length).toBe(1);
			expect(bodies[0]).toEqual({
				manifest: {
					"/file-1.txt": {
						hash: "0de3dd5df907418e9730fd2bd747bd5e",
						size: 17,
					},
				},
			});
		});

		it("should upload an asset manifest of the files in the directory specified by --assets", async () => {
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "boop/file-2.txt", content: "Content of file-2" },
			];
			writeAssets(assets);
			const bodies: AssetManifest[] = [];
			await mockAUSRequest(bodies);
			// skips asset uploading since empty buckets returned
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedAssets: {
					jwt: "<<aus-completion-token>>",
					config: {},
				},
				expectedType: "none",
			});
			await runWrangler(
				"deploy --name test-name --compatibility-date 2024-07-31 --assets assets"
			);
			expect(bodies.length).toBe(1);
			expect(bodies[0]).toStrictEqual({
				manifest: {
					"/file-1.txt": {
						hash: "0de3dd5df907418e9730fd2bd747bd5e",
						size: 17,
					},
					"/boop/file-2.txt": {
						hash: "7574a8cd3094a050388ac9663af1c1d6",
						size: 17,
					},
				},
			});
		});

		it("should upload an asset manifest of the files in the directory specified by [assets] config", async () => {
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "boop/file-2.txt", content: "Content of file-2" },
			];
			writeAssets(assets);
			writeWranglerToml({
				assets: { directory: "assets" },
			});
			const bodies: AssetManifest[] = [];
			await mockAUSRequest(bodies);
			// skips asset uploading since empty buckets returned
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedAssets: {
					jwt: "<<aus-completion-token>>",
					config: {},
				},
				expectedType: "none",
			});
			await runWrangler("deploy");
			expect(bodies.length).toBe(1);
			expect(bodies[0]).toStrictEqual({
				manifest: {
					"/file-1.txt": {
						hash: "0de3dd5df907418e9730fd2bd747bd5e",
						size: 17,
					},
					"/boop/file-2.txt": {
						hash: "7574a8cd3094a050388ac9663af1c1d6",
						size: 17,
					},
				},
			});
		});

		it("should upload assets in the requested buckets", async () => {
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "boop/file-2.txt", content: "Content of file-2" },
				{ filePath: "boop/file-3.txt", content: "Content of file-3" },
				{ filePath: "file-4.txt", content: "Content of file-4" },
				{ filePath: "beep/file-5.txt", content: "Content of file-5" },
				{
					filePath: "beep/boop/beep/boop/file-6.txt",
					content: "Content of file-6",
				},
			];
			writeAssets(assets);
			writeWranglerToml({
				assets: { directory: "assets" },
			});
			const mockBuckets = [
				[
					"0de3dd5df907418e9730fd2bd747bd5e",
					"7574a8cd3094a050388ac9663af1c1d6",
				],
				["ff5016e92f039aa743a4ff7abb3180fa"],
				["f05e28a3d0bdb90d3cf4bdafe592488f"],
				["0de3dd5df907418e9730fd2bd747bd5e"],
			];
			await mockAUSRequest([], mockBuckets, "<<aus-token>>");
			const bodies: FormData[] = [];
			const uploadAuthHeaders: (string | null)[] = [];
			const uploadContentTypeHeaders: (string | null)[] = [];
			await mockAssetUploadRequest(
				mockBuckets.length,
				bodies,
				uploadContentTypeHeaders,
				uploadAuthHeaders
			);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedAssets: {
					jwt: "<<aus-completion-token>>",
					config: {},
				},
				expectedType: "none",
			});
			await runWrangler("deploy");
			expect(uploadAuthHeaders).toStrictEqual([
				"Bearer <<aus-token>>",
				"Bearer <<aus-token>>",
				"Bearer <<aus-token>>",
				"Bearer <<aus-token>>",
			]);
			for (const uploadContentTypeHeader of uploadContentTypeHeaders) {
				expect(uploadContentTypeHeader).toMatch(/multipart\/form-data/);
			}

			expect(
				bodies
					.map((b) => [...b.entries()])
					.map((entry) => entry.length)
					.sort()
			).toEqual([1, 1, 1, 2]);

			const flatBodies = Object.fromEntries(
				bodies.flatMap((b) => [...b.entries()])
			);
			await expect(
				flatBodies["0de3dd5df907418e9730fd2bd747bd5e"]
			).toBeAFileWhichMatches(
				new File(
					["Q29udGVudCBvZiBmaWxlLTE="],
					"0de3dd5df907418e9730fd2bd747bd5e",
					{
						type: "text/plain",
					}
				)
			);
			await expect(
				flatBodies["7574a8cd3094a050388ac9663af1c1d6"]
			).toBeAFileWhichMatches(
				new File(
					["Q29udGVudCBvZiBmaWxlLTI="],
					"7574a8cd3094a050388ac9663af1c1d6",
					{
						// TODO: this should be "text/plain; charset=utf-8", but msw? is stripping the charset part
						type: "text/plain",
					}
				)
			);
			await expect(
				flatBodies["ff5016e92f039aa743a4ff7abb3180fa"]
			).toBeAFileWhichMatches(
				new File(
					["Q29udGVudCBvZiBmaWxlLTM="],
					"ff5016e92f039aa743a4ff7abb3180fa",
					{
						type: "text/plain",
					}
				)
			);
			await expect(
				flatBodies["f05e28a3d0bdb90d3cf4bdafe592488f"]
			).toBeAFileWhichMatches(
				new File(
					["Q29udGVudCBvZiBmaWxlLTU="],
					"f05e28a3d0bdb90d3cf4bdafe592488f",
					{
						type: "text/plain",
					}
				)
			);
		});

		it("should be able to upload a user worker with ASSETS binding and config", async () => {
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "boop/file-2.txt", content: "Content of file-2" },
			];
			writeAssets(assets);
			writeWorkerSource({ format: "js" });
			writeWranglerToml({
				main: "index.js",
				compatibility_date: "2024-09-27",
				compatibility_flags: ["nodejs_compat"],
				assets: {
					directory: "assets",
					binding: "ASSETS",
					html_handling: "none",
					not_found_handling: "404-page",
				},
			});
			await mockAUSRequest();
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedAssets: {
					jwt: "<<aus-completion-token>>",
					config: { html_handling: "none", not_found_handling: "404-page" },
				},
				expectedBindings: [{ name: "ASSETS", type: "assets" }],
				expectedMainModule: "index.js",
				expectedCompatibilityDate: "2024-09-27",
				expectedCompatibilityFlags: ["nodejs_compat"],
			});
			await runWrangler("deploy");
		});

		it("should be able to upload an asset-only project", async () => {
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "boop/file-2.txt", content: "Content of file-2" },
			];
			writeAssets(assets);
			writeWorkerSource({ format: "js" });
			writeWranglerToml({
				compatibility_date: "2024-09-27",
				compatibility_flags: ["nodejs_compat"],
				assets: {
					directory: "assets",
					html_handling: "none",
				},
			});
			await mockAUSRequest();
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedAssets: {
					jwt: "<<aus-completion-token>>",
					config: { html_handling: "none" },
				},
				expectedCompatibilityDate: "2024-09-27",
				expectedCompatibilityFlags: ["nodejs_compat"],
				expectedMainModule: undefined,
			});
			await runWrangler("deploy");
		});
	});

	describe("workers_dev setting", () => {
		it("should deploy to a workers.dev domain if workers_dev is undefined", async () => {
			writeWranglerToml();
			writeWorkerSource();
			mockUploadWorkerRequest();
			mockSubDomainRequest();

			await runWrangler("deploy ./index");

			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should deploy to the workers.dev domain if workers_dev is `true`", async () => {
			writeWranglerToml({
				workers_dev: true,
			});
			writeWorkerSource();
			mockUploadWorkerRequest({ available_on_subdomain: false });
			mockSubDomainRequest();
			mockUpdateWorkerRequest({ enabled: true });

			await runWrangler("deploy ./index");

			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should not try to enable the workers.dev domain if it has been enabled before", async () => {
			writeWranglerToml({
				workers_dev: true,
			});
			writeWorkerSource();
			mockUploadWorkerRequest({ available_on_subdomain: true });
			mockSubDomainRequest();

			await runWrangler("deploy ./index");

			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should disable the workers.dev domain if workers_dev is `false`", async () => {
			writeWranglerToml({
				workers_dev: false,
			});
			writeWorkerSource();
			mockUploadWorkerRequest();
			mockUpdateWorkerRequest({ enabled: false });

			await runWrangler("deploy ./index");

			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				No deploy targets for test-name (TIMINGS)
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should not try to disable the workers.dev domain if it is not already available", async () => {
			writeWranglerToml({
				workers_dev: false,
			});
			writeWorkerSource();
			mockSubDomainRequest("test-sub-domain", false);
			mockUploadWorkerRequest({ available_on_subdomain: false });

			// note the lack of a mock for the subdomain disable request

			await runWrangler("deploy ./index");

			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				No deploy targets for test-name (TIMINGS)
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should disable the workers.dev domain if workers_dev is undefined but overwritten to `false` in environment", async () => {
			writeWranglerToml({
				env: {
					dev: {
						workers_dev: false,
					},
				},
			});
			writeWorkerSource();
			mockUploadWorkerRequest({
				env: "dev",
				useOldUploadApi: true,
			});
			mockUpdateWorkerRequest({ enabled: false, env: "dev" });

			await runWrangler("deploy ./index --env dev --legacy-env false");

			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (dev) (TIMINGS)
				No deploy targets for test-name (dev) (TIMINGS)
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should disable the workers.dev domain if workers_dev is `true` but overwritten to `false` in environment", async () => {
			writeWranglerToml({
				workers_dev: true,
				env: {
					dev: {
						workers_dev: false,
					},
				},
			});
			writeWorkerSource();
			mockUploadWorkerRequest({
				env: "dev",
			});
			mockUpdateWorkerRequest({ enabled: false, env: "dev" });

			await runWrangler("deploy ./index --env dev --legacy-env false");

			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (dev) (TIMINGS)
				No deploy targets for test-name (dev) (TIMINGS)
				Current Version ID: undefined"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should deploy to a workers.dev domain if workers_dev is undefined but overwritten to `true` in environment", async () => {
			writeWranglerToml({
				env: {
					dev: {
						workers_dev: true,
					},
				},
			});
			writeWorkerSource();
			mockUploadWorkerRequest({
				env: "dev",
				useOldUploadApi: true,
			});
			mockSubDomainRequest();
			mockUpdateWorkerRequest({ enabled: true, env: "dev" });

			await runWrangler("deploy ./index --env dev --legacy-env false");

			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (dev) (TIMINGS)
				Deployed test-name (dev) triggers (TIMINGS)
				  https://dev.test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should deploy to a workers.dev domain if workers_dev is `false` but overwritten to `true` in environment", async () => {
			writeWranglerToml({
				workers_dev: false,
				env: {
					dev: {
						workers_dev: true,
					},
				},
			});
			writeWorkerSource();
			mockUploadWorkerRequest({
				env: "dev",
				useOldUploadApi: true,
			});
			mockSubDomainRequest();
			mockUpdateWorkerRequest({ enabled: true, env: "dev" });

			await runWrangler("deploy ./index --env dev --legacy-env false");

			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (dev) (TIMINGS)
				Deployed test-name (dev) triggers (TIMINGS)
				  https://dev.test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should use the global compatibility_date and compatibility_flags if they are not overwritten by the environment", async () => {
			writeWranglerToml({
				compatibility_date: "2022-01-12",
				compatibility_flags: ["no_global_navigator"],
				env: {
					dev: {},
				},
			});
			writeWorkerSource();
			mockUploadWorkerRequest({
				env: "dev",
				expectedCompatibilityDate: "2022-01-12",
				expectedCompatibilityFlags: ["no_global_navigator"],
				useOldUploadApi: true,
			});
			mockSubDomainRequest();
			mockUpdateWorkerRequest({ enabled: true, env: "dev" });

			await runWrangler("deploy ./index --env dev --legacy-env false");

			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (dev) (TIMINGS)
				Deployed test-name (dev) triggers (TIMINGS)
				  https://dev.test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should use the environment specific compatibility_date and compatibility_flags", async () => {
			writeWranglerToml({
				compatibility_date: "2022-01-12",
				compatibility_flags: ["no_global_navigator"],
				env: {
					dev: {
						compatibility_date: "2022-01-13",
						compatibility_flags: ["global_navigator"],
					},
				},
			});
			writeWorkerSource();
			mockUploadWorkerRequest({
				env: "dev",
				expectedCompatibilityDate: "2022-01-13",
				expectedCompatibilityFlags: ["global_navigator"],
				useOldUploadApi: true,
			});
			mockSubDomainRequest();
			mockUpdateWorkerRequest({ enabled: true, env: "dev" });

			await runWrangler("deploy ./index --env dev --legacy-env false");

			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (dev) (TIMINGS)
				Deployed test-name (dev) triggers (TIMINGS)
				  https://dev.test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should use the command line --compatibility-date and --compatibility-flags if they are specified", async () => {
			writeWranglerToml({
				compatibility_date: "2022-01-12",
				compatibility_flags: ["no_global_navigator"],
				env: {
					dev: {
						compatibility_date: "2022-01-13",
						compatibility_flags: ["global_navigator"],
					},
				},
			});
			writeWorkerSource();
			mockUploadWorkerRequest({
				env: "dev",
				expectedCompatibilityDate: "2022-01-14",
				expectedCompatibilityFlags: ["url_standard"],
			});
			mockSubDomainRequest();
			mockUpdateWorkerRequest({ enabled: true, env: "dev" });

			await runWrangler(
				"deploy ./index --env dev --legacy-env false --compatibility-date 2022-01-14 --compatibility-flags url_standard"
			);

			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (dev) (TIMINGS)
				Deployed test-name (dev) triggers (TIMINGS)
				  https://dev.test-name.test-sub-domain.workers.dev
				Current Version ID: undefined"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should error if a compatibility_date is not available in wrangler.toml or cli args", async () => {
			writeWorkerSource();
			let err: undefined | Error;
			try {
				await runWrangler("deploy ./index.js --name my-worker");
			} catch (e) {
				err = e as Error;
			}

			expect(err?.message.replaceAll(/\d/g, "X")).toMatchInlineSnapshot(`
			        "A compatibility_date is required when publishing. Add the following to your wrangler.toml file:.
			            \`\`\`
			            compatibility_date = \\"XXXX-XX-XX\\"
			            \`\`\`
			            Or you could pass it in your terminal as \`--compatibility-date XXXX-XX-XX\`
			        See https://developers.cloudflare.com/workers/platform/compatibility-dates for more information."
		      `);
		});

		it("should error if a compatibility_date is missing and suggest the correct month", async () => {
			vi.spyOn(Date.prototype, "getMonth").mockImplementation(() => 11);
			vi.spyOn(Date.prototype, "getFullYear").mockImplementation(() => 2020);
			vi.spyOn(Date.prototype, "getDate").mockImplementation(() => 1);

			writeWorkerSource();
			let err: undefined | Error;
			try {
				await runWrangler("deploy ./index.js --name my-worker");
			} catch (e) {
				err = e as Error;
			}

			expect(err?.message).toMatchInlineSnapshot(`
			"A compatibility_date is required when publishing. Add the following to your wrangler.toml file:.
			    \`\`\`
			    compatibility_date = \\"2020-12-01\\"
			    \`\`\`
			    Or you could pass it in your terminal as \`--compatibility-date 2020-12-01\`
			See https://developers.cloudflare.com/workers/platform/compatibility-dates for more information."
		`);
		});

		it("should enable the workers.dev domain if workers_dev is undefined and subdomain is not already available", async () => {
			writeWranglerToml();
			writeWorkerSource();
			mockUploadWorkerRequest({ available_on_subdomain: false });
			mockSubDomainRequest();
			mockUpdateWorkerRequest({ enabled: true });

			await runWrangler("deploy ./index");

			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should enable the workers.dev domain if workers_dev is true and subdomain is not already available", async () => {
			writeWranglerToml({ workers_dev: true });
			writeWorkerSource();
			mockUploadWorkerRequest({ available_on_subdomain: false });
			mockSubDomainRequest();
			mockUpdateWorkerRequest({ enabled: true });

			await runWrangler("deploy ./index");

			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should fail to deploy to the workers.dev domain if email is unverified", async () => {
			writeWranglerToml({ workers_dev: true });
			writeWorkerSource();
			mockUploadWorkerRequest({ available_on_subdomain: false });
			mockSubDomainRequest();
			msw.use(
				http.post(
					`*/accounts/:accountId/workers/scripts/:scriptName/subdomain`,
					async () => {
						return HttpResponse.json(
							createFetchResult(null, /* success */ false, [
								{
									code: 10034,
									message: "workers.api.error.email_verification_required",
								},
							])
						);
					},
					{ once: true }
				)
			);

			await expect(runWrangler("deploy ./index")).rejects.toMatchObject({
				text: "Please verify your account's email address and try again.",
				notes: [
					{
						text: "Check your email for a verification link, or login to https://dash.cloudflare.com and request a new one.",
					},
					{},
				],
			});
		});

		it("should offer to create a new workers.dev subdomain when publishing to workers_dev without one", async () => {
			writeWranglerToml({
				workers_dev: true,
			});
			writeWorkerSource();
			mockUploadWorkerRequest();
			mockSubDomainRequest("does-not-exist", false);

			mockConfirm({
				text: "Would you like to register a workers.dev subdomain now?",
				result: false,
			});

			await expect(runWrangler("deploy ./index")).rejects
				.toThrowErrorMatchingInlineSnapshot(`
				[Error: You can either deploy your worker to one or more routes by specifying them in wrangler.toml, or register a workers.dev subdomain here:
				https://dash.cloudflare.com/some-account-id/workers/onboarding]
			`);
		});

		it("should not deploy to workers.dev if there are any routes defined", async () => {
			writeWranglerToml({
				routes: ["http://example.com/*"],
			});
			writeWorkerSource();
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			mockUpdateWorkerRequest({
				enabled: false,
			});
			mockPublishRoutesRequest({ routes: ["http://example.com/*"] });
			await runWrangler("deploy index.js");

			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  http://example.com/*
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("should not deploy to workers.dev if there are any routes defined (environments)", async () => {
			writeWranglerToml({
				routes: ["http://example.com/*"],
				env: {
					production: {
						routes: ["http://production.example.com/*"],
					},
				},
			});
			writeWorkerSource();
			mockSubDomainRequest();
			mockUploadWorkerRequest({ env: "production", legacyEnv: true });
			mockUpdateWorkerRequest({
				enabled: false,
				env: "production",
				legacyEnv: true,
			});
			mockPublishRoutesRequest({
				routes: ["http://production.example.com/*"],
				env: "production",
				legacyEnv: true,
			});
			await runWrangler("deploy index.js --env production");

			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name-production (TIMINGS)
				Deployed test-name-production triggers (TIMINGS)
				  http://production.example.com/*
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("should not deploy to workers.dev if there are any routes defined (only in environments)", async () => {
			writeWranglerToml({
				env: {
					production: {
						routes: ["http://production.example.com/*"],
					},
				},
			});
			writeWorkerSource();
			mockSubDomainRequest();
			mockUploadWorkerRequest({ env: "production", legacyEnv: true });
			mockUpdateWorkerRequest({
				enabled: false,
				env: "production",
				legacyEnv: true,
			});
			mockPublishRoutesRequest({
				routes: ["http://production.example.com/*"],
				env: "production",
				legacyEnv: true,
			});
			await runWrangler("deploy index.js --env production");

			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name-production (TIMINGS)
				Deployed test-name-production triggers (TIMINGS)
				  http://production.example.com/*
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("can deploy to both workers.dev and routes if both defined ", async () => {
			writeWranglerToml({
				workers_dev: true,
				routes: ["http://example.com/*"],
			});
			writeWorkerSource();
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			mockUpdateWorkerRequest({
				enabled: false,
			});
			mockPublishRoutesRequest({
				routes: ["http://example.com/*"],
			});
			await runWrangler("deploy index.js");

			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				  http://example.com/*
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("can deploy to both workers.dev and routes if both defined (environments: 1)", async () => {
			writeWranglerToml({
				workers_dev: true,
				env: {
					production: {
						routes: ["http://production.example.com/*"],
					},
				},
			});
			writeWorkerSource();
			mockSubDomainRequest();
			mockUploadWorkerRequest({ env: "production", legacyEnv: true });
			mockUpdateWorkerRequest({
				enabled: false,
				env: "production",
				legacyEnv: true,
			});
			mockPublishRoutesRequest({
				routes: ["http://production.example.com/*"],
				env: "production",
				legacyEnv: true,
			});
			await runWrangler("deploy index.js --env production");

			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name-production (TIMINGS)
				Deployed test-name-production triggers (TIMINGS)
				  https://test-name-production.test-sub-domain.workers.dev
				  http://production.example.com/*
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("can deploy to both workers.dev and routes if both defined (environments: 2)", async () => {
			writeWranglerToml({
				env: {
					production: {
						workers_dev: true,
						routes: ["http://production.example.com/*"],
					},
				},
			});
			writeWorkerSource();
			mockSubDomainRequest();
			mockUploadWorkerRequest({ env: "production", legacyEnv: true });
			mockUpdateWorkerRequest({
				enabled: false,
				env: "production",
				legacyEnv: true,
			});
			mockPublishRoutesRequest({
				routes: ["http://production.example.com/*"],
				env: "production",
				legacyEnv: true,
			});
			await runWrangler("deploy index.js --env production");

			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name-production (TIMINGS)
				Deployed test-name-production triggers (TIMINGS)
				  https://test-name-production.test-sub-domain.workers.dev
				  http://production.example.com/*
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("will deploy only to routes when workers_dev is false (environments 1) ", async () => {
			writeWranglerToml({
				workers_dev: false,
				env: {
					production: {
						routes: ["http://production.example.com/*"],
					},
				},
			});
			writeWorkerSource();
			mockSubDomainRequest();
			mockUploadWorkerRequest({ env: "production", legacyEnv: true });
			mockUpdateWorkerRequest({
				enabled: false,
				env: "production",
				legacyEnv: true,
			});
			mockPublishRoutesRequest({
				routes: ["http://production.example.com/*"],
				env: "production",
				legacyEnv: true,
			});
			await runWrangler("deploy index.js --env production");

			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name-production (TIMINGS)
				Deployed test-name-production triggers (TIMINGS)
				  http://production.example.com/*
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("will deploy only to routes when workers_dev is false (environments 2) ", async () => {
			writeWranglerToml({
				env: {
					production: {
						workers_dev: false,
						routes: ["http://production.example.com/*"],
					},
				},
			});
			writeWorkerSource();
			mockSubDomainRequest();
			mockUploadWorkerRequest({ env: "production", legacyEnv: true });
			mockUpdateWorkerRequest({
				enabled: false,
				env: "production",
				legacyEnv: true,
			});
			mockPublishRoutesRequest({
				routes: ["http://production.example.com/*"],
				env: "production",
				legacyEnv: true,
			});
			await runWrangler("deploy index.js --env production");

			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name-production (TIMINGS)
				Deployed test-name-production triggers (TIMINGS)
				  http://production.example.com/*
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});
	});

	describe("[define]", () => {
		it("should be able to define values that will be substituted into top-level identifiers", async () => {
			writeWranglerToml({
				main: "index.js",
				define: {
					abc: "123",
				},
			});
			fs.writeFileSync(
				"index.js",
				`
        // this should get replaced
        console.log(abc);
        // this should not get replaced
        console.log(globalThis.abc);

        function foo(){
          const abc = "a string";
          // this should not get replaced
          console.log(abc);
        }

        console.log(foo);
      `
			);
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			await runWrangler("build");

			const outFile = normalizeString(
				fs.readFileSync("dist/index.js", "utf-8")
			);

			// We don't check against the whole file as there is middleware being injected
			expect(outFile).toContain("console.log(123);");
			expect(outFile).toContain("console.log(globalThis.abc);");
			expect(outFile).toContain(`const abc2 = "a string";`);
			expect(outFile).toContain("console.log(abc2);");
			expect(outFile).toContain("console.log(foo);");
		});

		it("can be overriden in environments", async () => {
			writeWranglerToml({
				main: "index.js",
				define: {
					abc: "123",
				},
				env: {
					staging: {
						define: {
							abc: "456",
						},
					},
				},
			});
			fs.writeFileSync(
				"index.js",
				`
        console.log(abc);
      `
			);
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			await runWrangler("build --env staging");

			const outFile = normalizeString(
				fs.readFileSync("dist/index.js", "utf-8")
			);

			// We don't check against the whole file as there is middleware being injected
			expect(outFile).toContain("console.log(456);");
		});

		it("can be overridden with cli args", async () => {
			writeWranglerToml({
				main: "index.js",
				define: {
					abc: "123",
				},
			});
			fs.writeFileSync(
				"index.js",
				`
				console.log(abc);
			`
			);
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			await runWrangler("deploy --dry-run --outdir dist --define abc:789");

			expect(fs.readFileSync("dist/index.js", "utf-8")).toContain(
				`console.log(789);`
			);
		});

		it("can be overridden with cli args containing colons", async () => {
			writeWranglerToml({
				main: "index.js",
				define: {
					abc: "123",
				},
			});
			fs.writeFileSync(
				"index.js",
				`
				console.log(abc);
			`
			);
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			await runWrangler(
				`deploy --dry-run --outdir dist --define "abc:'https://www.abc.net.au/news/'"`
			);

			expect(fs.readFileSync("dist/index.js", "utf-8")).toContain(
				// eslint-disable-next-line no-useless-escape
				`console.log(\"https://www.abc.net.au/news/\");`
			);
		});
	});

	describe("custom builds", () => {
		beforeEach(() => {
			vi.unstubAllGlobals();
		});
		it("should run a custom build before publishing", async () => {
			writeWranglerToml({
				build: {
					command: `node -e "4+4; require('fs').writeFileSync('index.js', 'export default { fetch(){ return new Response(123) } }')"`,
				},
			});

			mockUploadWorkerRequest({
				expectedEntry: "return new Response(123)",
			});
			mockSubDomainRequest();

			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"Running custom build: node -e \\"4+4; require('fs').writeFileSync('index.js', 'export default { fetch(){ return new Response(123) } }')\\"
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

		if (process.platform !== "win32") {
			it("should run a custom build of multiple steps combined by && before publishing", async () => {
				writeWranglerToml({
					build: {
						command: `echo "export default { fetch(){ return new Response(123) } }" > index.js`,
					},
				});

				mockUploadWorkerRequest({
					expectedEntry: "return new Response(123)",
				});
				mockSubDomainRequest();

				await runWrangler("deploy index.js");
				expect(std.out).toMatchInlineSnapshot(`
					"Running custom build: echo \\"export default { fetch(){ return new Response(123) } }\\" > index.js
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
		}

		it("should throw an error if the entry doesn't exist after the build finishes", async () => {
			writeWranglerToml({
				main: "index.js",
				build: {
					command: `node -e "4+4;"`,
				},
			});

			await expect(runWrangler("deploy index.js")).rejects
				.toThrowErrorMatchingInlineSnapshot(`
				[Error: The expected output file at "index.js" was not found after running custom build: node -e "4+4;".
				The \`main\` property in wrangler.toml should point to the file generated by the custom build.]
			`);
			expect(std.out).toMatchInlineSnapshot(`
			"Running custom build: node -e \\"4+4;\\"
			"
		`);
			expect(std.err).toMatchInlineSnapshot(`
			        "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mThe expected output file at \\"index.js\\" was not found after running custom build: node -e \\"4+4;\\".[0m

			          The \`main\` property in wrangler.toml should point to the file generated by the custom build.

			        "
		      `);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("should throw an error if the entry is a directory after the build finishes", async () => {
			writeWranglerToml({
				main: "./",
				build: {
					command: `node -e "4+4;"`,
				},
			});

			fs.writeFileSync("./worker.js", "some content", "utf-8");
			fs.mkdirSync("./dist");
			fs.writeFileSync("./dist/index.ts", "some content", "utf-8");

			await expect(runWrangler("deploy")).rejects
				.toThrowErrorMatchingInlineSnapshot(`
				[Error: The expected output file at "." was not found after running custom build: node -e "4+4;".
				The \`main\` property in wrangler.toml should point to the file generated by the custom build.
				The provided entry-point path, ".", points to a directory, rather than a file.

				Did you mean to set the main field to one of:
				\`\`\`
				main = "./worker.js"
				main = "./dist/index.ts"
				\`\`\`]
			`);
			expect(std.out).toMatchInlineSnapshot(`
			"Running custom build: node -e \\"4+4;\\"
			"
		`);
			expect(std.err).toMatchInlineSnapshot(`
			        "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mThe expected output file at \\".\\" was not found after running custom build: node -e \\"4+4;\\".[0m

			          The \`main\` property in wrangler.toml should point to the file generated by the custom build.
			          The provided entry-point path, \\".\\", points to a directory, rather than a file.

			          Did you mean to set the main field to one of:
			          \`\`\`
			          main = \\"./worker.js\\"
			          main = \\"./dist/index.ts\\"
			          \`\`\`

			        "
		      `);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("should minify the script when `--minify` is true (sw)", async () => {
			writeWranglerToml({
				main: "./index.js",
			});
			fs.writeFileSync(
				"./index.js",
				`export
        default {
          fetch() {
            return new Response(     "hello Cpt Picard"     )
                  }
            }
        `
			);

			mockUploadWorkerRequest({
				expectedEntry: 'fetch(){return new Response("hello Cpt Picard")',
			});

			mockSubDomainRequest();
			await runWrangler("deploy index.js --minify");
			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should minify the script when `minify` in config is true (esm)", async () => {
			writeWranglerToml({
				main: "./index.js",
				legacy_env: false,
				env: {
					testEnv: {
						minify: true,
					},
				},
			});
			fs.writeFileSync(
				"./index.js",
				`export
        default {
          fetch() {
            return new Response(     "hello Cpt Picard"     )
                  }
            }
        `
			);

			mockUploadWorkerRequest({
				env: "testEnv",
				expectedType: "esm",
				legacyEnv: false,
				expectedEntry: `fetch(){return new Response("hello Cpt Picard")`,
			});

			mockSubDomainRequest();
			await runWrangler("deploy -e testEnv index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (testEnv) (TIMINGS)
				Deployed test-name (testEnv) triggers (TIMINGS)
				  https://testEnv.test-name.test-sub-domain.workers.dev
				Current Version ID: undefined"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});
	});

	describe("durable object migrations", () => {
		it("should warn when you try to deploy durable objects without migrations", async () => {
			writeWranglerToml({
				durable_objects: {
					bindings: [{ name: "SOMENAME", class_name: "SomeClass" }],
				},
			});
			fs.writeFileSync(
				"index.js",
				`export class SomeClass{}; export default {};`
			);
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Your worker has access to the following bindings:
				- Durable Objects:
				  - SOMENAME: SomeClass
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`
			"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

			    - In wrangler.toml, you have configured [durable_objects] exported by this Worker (SomeClass),
			  but no [migrations] for them. This may not work as expected until you add a [migrations] section
			  to your wrangler.toml. Add this configuration to your wrangler.toml:

			        \`\`\`
			        [[migrations]]
			        tag = \\"v1\\" # Should be unique for each entry
			        new_classes = [\\"SomeClass\\"]
			        \`\`\`

			      Refer to
			  [4mhttps://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/[0m for more
			  details.

			"
		`);
		});

		it("does not warn if all the durable object bindings are to external classes", async () => {
			writeWranglerToml({
				durable_objects: {
					bindings: [
						{
							name: "SOMENAME",
							class_name: "SomeClass",
							script_name: "some-script",
						},
					],
				},
			});
			fs.writeFileSync(
				"index.js",
				`export class SomeClass{}; export default {};`
			);
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Your worker has access to the following bindings:
				- Durable Objects:
				  - SOMENAME: SomeClass (defined in some-script)
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("should deploy all migrations on first deploy", async () => {
			writeWranglerToml({
				durable_objects: {
					bindings: [
						{ name: "SOMENAME", class_name: "SomeClass" },
						{ name: "SOMEOTHERNAME", class_name: "SomeOtherClass" },
					],
				},
				migrations: [
					{ tag: "v1", new_classes: ["SomeClass"] },
					{ tag: "v2", new_classes: ["SomeOtherClass"] },
				],
			});
			fs.writeFileSync(
				"index.js",
				`export class SomeClass{}; export class SomeOtherClass{}; export default {};`
			);
			mockSubDomainRequest();
			mockLegacyScriptData({ scripts: [] }); // no previously uploaded scripts at all
			mockUploadWorkerRequest({
				expectedMigrations: {
					new_tag: "v2",
					steps: [
						{ new_classes: ["SomeClass"] },
						{ new_classes: ["SomeOtherClass"] },
					],
				},
				useOldUploadApi: true,
			});

			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Your worker has access to the following bindings:
				- Durable Objects:
				  - SOMENAME: SomeClass
				  - SOMEOTHERNAME: SomeOtherClass
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("should upload migrations past a previously uploaded tag", async () => {
			writeWranglerToml({
				durable_objects: {
					bindings: [
						{ name: "SOMENAME", class_name: "SomeClass" },
						{ name: "SOMEOTHERNAME", class_name: "SomeOtherClass" },
					],
				},
				migrations: [
					{ tag: "v1", new_classes: ["SomeClass"] },
					{ tag: "v2", new_classes: ["SomeOtherClass"] },
				],
			});
			fs.writeFileSync(
				"index.js",
				`export class SomeClass{}; export class SomeOtherClass{}; export default {};`
			);
			mockSubDomainRequest();
			mockLegacyScriptData({
				scripts: [{ id: "test-name", migration_tag: "v1" }],
			});
			mockUploadWorkerRequest({
				expectedMigrations: {
					old_tag: "v1",
					new_tag: "v2",
					steps: [
						{
							new_classes: ["SomeOtherClass"],
						},
					],
				},
				useOldUploadApi: true,
			});

			await runWrangler("deploy index.js");
			expect(std).toMatchInlineSnapshot(`
				Object {
				  "debug": "",
				  "err": "",
				  "info": "",
				  "out": "Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Your worker has access to the following bindings:
				- Durable Objects:
				  - SOMENAME: SomeClass
				  - SOMEOTHERNAME: SomeOtherClass
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class",
				  "warn": "",
				}
			`);
		});

		it("should not send migrations if they've all already been sent", async () => {
			writeWranglerToml({
				durable_objects: {
					bindings: [
						{ name: "SOMENAME", class_name: "SomeClass" },
						{ name: "SOMEOTHERNAME", class_name: "SomeOtherClass" },
					],
				},
				migrations: [
					{ tag: "v1", new_classes: ["SomeClass"] },
					{ tag: "v2", new_classes: ["SomeOtherClass"] },
					{ tag: "v3", new_classes: ["YetAnotherClass"] },
				],
			});
			fs.writeFileSync(
				"index.js",
				`export class SomeClass{}; export class SomeOtherClass{}; export class YetAnotherClass{}; export default {};`
			);
			mockSubDomainRequest();
			mockLegacyScriptData({
				scripts: [{ id: "test-name", migration_tag: "v3" }],
			});
			mockUploadWorkerRequest({
				expectedMigrations: undefined,
			});

			await runWrangler("deploy index.js");
			expect(std).toMatchInlineSnapshot(`
				Object {
				  "debug": "",
				  "err": "",
				  "info": "",
				  "out": "Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Your worker has access to the following bindings:
				- Durable Objects:
				  - SOMENAME: SomeClass
				  - SOMEOTHERNAME: SomeOtherClass
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class",
				  "warn": "",
				}
			`);
		});

		describe("service environments", () => {
			it("should deploy all migrations on first deploy", async () => {
				writeWranglerToml({
					durable_objects: {
						bindings: [
							{ name: "SOMENAME", class_name: "SomeClass" },
							{ name: "SOMEOTHERNAME", class_name: "SomeOtherClass" },
						],
					},
					migrations: [
						{ tag: "v1", new_classes: ["SomeClass"] },
						{ tag: "v2", new_classes: ["SomeOtherClass"] },
					],
				});
				fs.writeFileSync(
					"index.js",
					`export class SomeClass{}; export class SomeOtherClass{}; export default {};`
				);
				mockSubDomainRequest();
				mockServiceScriptData({}); // no scripts at all
				mockUploadWorkerRequest({
					legacyEnv: false,
					expectedMigrations: {
						new_tag: "v2",
						steps: [
							{ new_classes: ["SomeClass"] },
							{ new_classes: ["SomeOtherClass"] },
						],
					},
					useOldUploadApi: true,
				});

				await runWrangler("deploy index.js --legacy-env false");
				expect(std.out).toMatchInlineSnapshot(`
					"Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your worker has access to the following bindings:
					- Durable Objects:
					  - SOMENAME: SomeClass
					  - SOMEOTHERNAME: SomeOtherClass
					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`
			"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

			    - Experimental: Service environments are in beta, and their behaviour is guaranteed to change in
			  the future. DO NOT USE IN PRODUCTION.

			"
		`);
			});

			it("should deploy all migrations on first deploy (--env)", async () => {
				writeWranglerToml({
					durable_objects: {
						bindings: [
							{ name: "SOMENAME", class_name: "SomeClass" },
							{ name: "SOMEOTHERNAME", class_name: "SomeOtherClass" },
						],
					},
					env: {
						xyz: {
							durable_objects: {
								bindings: [
									{ name: "SOMENAME", class_name: "SomeClass" },
									{ name: "SOMEOTHERNAME", class_name: "SomeOtherClass" },
								],
							},
						},
					},
					migrations: [
						{ tag: "v1", new_classes: ["SomeClass"] },
						{ tag: "v2", new_classes: ["SomeOtherClass"] },
					],
				});
				fs.writeFileSync(
					"index.js",
					`export class SomeClass{}; export class SomeOtherClass{}; export default {};`
				);
				mockSubDomainRequest();
				mockServiceScriptData({ env: "xyz" }); // no scripts at all
				mockUploadWorkerRequest({
					legacyEnv: false,
					env: "xyz",
					expectedMigrations: {
						new_tag: "v2",
						steps: [
							{ new_classes: ["SomeClass"] },
							{ new_classes: ["SomeOtherClass"] },
						],
					},
					useOldUploadApi: true,
				});

				await runWrangler("deploy index.js --legacy-env false --env xyz");
				expect(std.out).toMatchInlineSnapshot(`
					"Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your worker has access to the following bindings:
					- Durable Objects:
					  - SOMENAME: SomeClass
					  - SOMEOTHERNAME: SomeOtherClass
					Uploaded test-name (xyz) (TIMINGS)
					Deployed test-name (xyz) triggers (TIMINGS)
					  https://xyz.test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`
			"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

			    - Experimental: Service environments are in beta, and their behaviour is guaranteed to change in
			  the future. DO NOT USE IN PRODUCTION.

			"
		`);
			});

			it("should use a script's current migration tag when publishing migrations", async () => {
				writeWranglerToml({
					durable_objects: {
						bindings: [
							{ name: "SOMENAME", class_name: "SomeClass" },
							{ name: "SOMEOTHERNAME", class_name: "SomeOtherClass" },
						],
					},
					migrations: [
						{ tag: "v1", new_classes: ["SomeClass"] },
						{ tag: "v2", new_classes: ["SomeOtherClass"] },
					],
				});
				fs.writeFileSync(
					"index.js",
					`export class SomeClass{}; export class SomeOtherClass{}; export default {};`
				);
				mockSubDomainRequest();
				mockServiceScriptData({
					script: { id: "test-name", migration_tag: "v2" },
				});
				mockUploadWorkerRequest({
					legacyEnv: false,
					expectedMigrations: {
						new_tag: "v2",
						steps: [
							{
								new_classes: ["SomeClass"],
							},
							{
								new_classes: ["SomeOtherClass"],
							},
						],
					},
					useOldUploadApi: true,
				});

				await runWrangler("deploy index.js --legacy-env false");
				expect(std).toMatchInlineSnapshot(`
					Object {
					  "debug": "",
					  "err": "",
					  "info": "",
					  "out": "Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your worker has access to the following bindings:
					- Durable Objects:
					  - SOMENAME: SomeClass
					  - SOMEOTHERNAME: SomeOtherClass
					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class",
					  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

					    - Experimental: Service environments are in beta, and their behaviour is guaranteed to change in
					  the future. DO NOT USE IN PRODUCTION.

					",
					}
				`);
			});

			it("should use an environment's current migration tag when publishing migrations", async () => {
				writeWranglerToml({
					durable_objects: {
						bindings: [
							{ name: "SOMENAME", class_name: "SomeClass" },
							{ name: "SOMEOTHERNAME", class_name: "SomeOtherClass" },
						],
					},
					env: {
						xyz: {
							durable_objects: {
								bindings: [
									{ name: "SOMENAME", class_name: "SomeClass" },
									{ name: "SOMEOTHERNAME", class_name: "SomeOtherClass" },
								],
							},
						},
					},
					migrations: [
						{ tag: "v1", new_classes: ["SomeClass"] },
						{ tag: "v2", new_classes: ["SomeOtherClass"] },
					],
				});
				fs.writeFileSync(
					"index.js",
					`export class SomeClass{}; export class SomeOtherClass{}; export default {};`
				);
				mockSubDomainRequest();
				mockServiceScriptData({
					script: { id: "test-name", migration_tag: "v1" },
					env: "xyz",
				});
				mockUploadWorkerRequest({
					legacyEnv: false,
					env: "xyz",
					expectedMigrations: {
						old_tag: "v1",
						new_tag: "v2",
						steps: [
							{
								new_classes: ["SomeOtherClass"],
							},
						],
					},
					useOldUploadApi: true,
				});

				await runWrangler("deploy index.js --legacy-env false --env xyz");
				expect(std).toMatchInlineSnapshot(`
					Object {
					  "debug": "",
					  "err": "",
					  "info": "",
					  "out": "Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your worker has access to the following bindings:
					- Durable Objects:
					  - SOMENAME: SomeClass
					  - SOMEOTHERNAME: SomeOtherClass
					Uploaded test-name (xyz) (TIMINGS)
					Deployed test-name (xyz) triggers (TIMINGS)
					  https://xyz.test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class",
					  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

					    - Experimental: Service environments are in beta, and their behaviour is guaranteed to change in
					  the future. DO NOT USE IN PRODUCTION.

					",
					}
				`);
			});
		});
	});

	describe("tail consumers", () => {
		it("should allow specifying workers as tail consumers", async () => {
			writeWranglerToml({
				tail_consumers: [
					{ service: "listener " },
					{ service: "test-listener", environment: "production" },
				],
			});
			await fs.promises.writeFile("index.js", `export default {};`);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedTailConsumers: [
					{ service: "listener " },
					{ service: "test-listener", environment: "production" },
				],
			});

			await runWrangler("publish index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
		});
	});

	describe("user limits", () => {
		it("should allow specifying a cpu millisecond limit", async () => {
			writeWranglerToml({
				limits: { cpu_ms: 15_000 },
			});

			await fs.promises.writeFile("index.js", `export default {};`);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedLimits: { cpu_ms: 15_000 },
			});

			await runWrangler("publish index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
		});
	});

	describe("bindings", () => {
		it("should allow bindings with different names", async () => {
			writeWranglerToml({
				migrations: [
					{
						tag: "v1",
						new_classes: ["SomeDurableObject", "AnotherDurableObject"],
					},
				],
				durable_objects: {
					bindings: [
						{
							name: "DURABLE_OBJECT_ONE",
							class_name: "SomeDurableObject",
							script_name: "some-durable-object-worker",
						},
						{
							name: "DURABLE_OBJECT_TWO",
							class_name: "AnotherDurableObject",
							script_name: "another-durable-object-worker",
							environment: "staging",
						},
					],
				},
				kv_namespaces: [
					{ binding: "KV_NAMESPACE_ONE", id: "kv-ns-one-id" },
					{ binding: "KV_NAMESPACE_TWO", id: "kv-ns-two-id" },
				],
				r2_buckets: [
					{ binding: "R2_BUCKET_ONE", bucket_name: "r2-bucket-one-name" },
					{ binding: "R2_BUCKET_TWO", bucket_name: "r2-bucket-two-name" },
					{
						binding: "R2_BUCKET_ONE_EU",
						bucket_name: "r2-bucket-one-name",
						jurisdiction: "eu",
					},
					{
						binding: "R2_BUCKET_TWO_EU",
						bucket_name: "r2-bucket-two-name",
						jurisdiction: "eu",
					},
				],
				analytics_engine_datasets: [
					{ binding: "AE_DATASET_ONE", dataset: "ae-dataset-one-name" },
					{ binding: "AE_DATASET_TWO", dataset: "ae-dataset-two-name" },
				],
				text_blobs: {
					TEXT_BLOB_ONE: "./my-entire-app-depends-on-this.cfg",
					TEXT_BLOB_TWO: "./the-entirety-of-human-knowledge.txt",
				},
				unsafe: {
					bindings: [
						{
							name: "UNSAFE_BINDING_ONE",
							type: "some unsafe thing",
							data: { some: { unsafe: "thing" } },
						},
						{
							name: "UNSAFE_BINDING_TWO",
							type: "another unsafe thing",
							data: 1337,
						},
					],
					metadata: {
						extra_data: "interesting value",
						more_data: "dubious value",
					},
				},
				vars: {
					ENV_VAR_ONE: 123,
					ENV_VAR_TWO: "Hello, I'm an environment variable",
				},
				wasm_modules: {
					WASM_MODULE_ONE: "./some_wasm.wasm",
					WASM_MODULE_TWO: "./more_wasm.wasm",
				},
				data_blobs: {
					DATA_BLOB_ONE: "./some-data-blob.bin",
					DATA_BLOB_TWO: "./more-data-blob.bin",
				},
				logfwdr: {
					bindings: [
						{
							name: "httplogs",
							destination: "httplogs",
						},
						{
							name: "trace",
							destination: "trace",
						},
					],
				},
			});

			writeWorkerSource({ type: "sw" });
			fs.writeFileSync("./my-entire-app-depends-on-this.cfg", "config = value");
			fs.writeFileSync(
				"./the-entirety-of-human-knowledge.txt",
				"Everything's bigger in Texas"
			);
			fs.writeFileSync("./some_wasm.wasm", "some wasm");
			fs.writeFileSync("./more_wasm.wasm", "more wasm");

			fs.writeFileSync("./some-data-blob.bin", "some data");
			fs.writeFileSync("./more-data-blob.bin", "more data");

			mockUploadWorkerRequest({
				expectedType: "sw",
				expectedUnsafeMetaData: {
					extra_data: "interesting value",
					more_data: "dubious value",
				},
				expectedBindings: [
					{ json: 123, name: "ENV_VAR_ONE", type: "json" },
					{
						name: "ENV_VAR_TWO",
						text: "Hello, I'm an environment variable",
						type: "plain_text",
					},
					{
						name: "KV_NAMESPACE_ONE",
						namespace_id: "kv-ns-one-id",
						type: "kv_namespace",
					},
					{
						name: "KV_NAMESPACE_TWO",
						namespace_id: "kv-ns-two-id",
						type: "kv_namespace",
					},
					{
						class_name: "SomeDurableObject",
						name: "DURABLE_OBJECT_ONE",
						script_name: "some-durable-object-worker",
						type: "durable_object_namespace",
					},
					{
						class_name: "AnotherDurableObject",
						environment: "staging",
						name: "DURABLE_OBJECT_TWO",
						script_name: "another-durable-object-worker",
						type: "durable_object_namespace",
					},
					{
						bucket_name: "r2-bucket-one-name",
						name: "R2_BUCKET_ONE",
						type: "r2_bucket",
					},
					{
						bucket_name: "r2-bucket-two-name",
						name: "R2_BUCKET_TWO",
						type: "r2_bucket",
					},
					{
						bucket_name: "r2-bucket-one-name",
						jurisdiction: "eu",
						name: "R2_BUCKET_ONE_EU",
						type: "r2_bucket",
					},
					{
						bucket_name: "r2-bucket-two-name",
						jurisdiction: "eu",
						name: "R2_BUCKET_TWO_EU",
						type: "r2_bucket",
					},
					{
						dataset: "ae-dataset-one-name",
						name: "AE_DATASET_ONE",
						type: "analytics_engine",
					},
					{
						dataset: "ae-dataset-two-name",
						name: "AE_DATASET_TWO",
						type: "analytics_engine",
					},
					{
						name: "httplogs",
						type: "logfwdr",
						destination: "httplogs",
					},
					{
						name: "trace",
						type: "logfwdr",
						destination: "trace",
					},
					{
						name: "WASM_MODULE_ONE",
						part: "WASM_MODULE_ONE",
						type: "wasm_module",
					},
					{
						name: "WASM_MODULE_TWO",
						part: "WASM_MODULE_TWO",
						type: "wasm_module",
					},
					{ name: "TEXT_BLOB_ONE", part: "TEXT_BLOB_ONE", type: "text_blob" },
					{ name: "TEXT_BLOB_TWO", part: "TEXT_BLOB_TWO", type: "text_blob" },
					{ name: "DATA_BLOB_ONE", part: "DATA_BLOB_ONE", type: "data_blob" },
					{ name: "DATA_BLOB_TWO", part: "DATA_BLOB_TWO", type: "data_blob" },
					{
						data: { some: { unsafe: "thing" } },
						name: "UNSAFE_BINDING_ONE",
						type: "some unsafe thing",
					},
					{
						data: 1337,
						name: "UNSAFE_BINDING_TWO",
						type: "another unsafe thing",
					},
				],
				useOldUploadApi: true,
			});
			mockSubDomainRequest();
			mockLegacyScriptData({ scripts: [] });

			await expect(runWrangler("deploy index.js")).resolves.toBeUndefined();
			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Your worker has access to the following bindings:
				- Data Blobs:
				  - DATA_BLOB_ONE: some-data-blob.bin
				  - DATA_BLOB_TWO: more-data-blob.bin
				- Durable Objects:
				  - DURABLE_OBJECT_ONE: SomeDurableObject (defined in some-durable-object-worker)
				  - DURABLE_OBJECT_TWO: AnotherDurableObject (defined in another-durable-object-worker) - staging
				- KV Namespaces:
				  - KV_NAMESPACE_ONE: kv-ns-one-id
				  - KV_NAMESPACE_TWO: kv-ns-two-id
				- R2 Buckets:
				  - R2_BUCKET_ONE: r2-bucket-one-name
				  - R2_BUCKET_TWO: r2-bucket-two-name
				  - R2_BUCKET_ONE_EU: r2-bucket-one-name (eu)
				  - R2_BUCKET_TWO_EU: r2-bucket-two-name (eu)
				- logfwdr:
				  - httplogs: httplogs
				  - trace: trace
				- Analytics Engine Datasets:
				  - AE_DATASET_ONE: ae-dataset-one-name
				  - AE_DATASET_TWO: ae-dataset-two-name
				- Text Blobs:
				  - TEXT_BLOB_ONE: my-entire-app-depends-on-this.cfg
				  - TEXT_BLOB_TWO: the-entirety-of-human-knowledge.txt
				- Unsafe:
				  - some unsafe thing: UNSAFE_BINDING_ONE
				  - another unsafe thing: UNSAFE_BINDING_TWO
				- Vars:
				  - ENV_VAR_ONE: 123
				  - ENV_VAR_TWO: \\"Hello, I'm an environment variable\\"
				- Wasm Modules:
				  - WASM_MODULE_ONE: some_wasm.wasm
				  - WASM_MODULE_TWO: more_wasm.wasm
				- Unsafe Metadata:
				  - extra_data: \\"interesting value\\"
				  - more_data: \\"dubious value\\"
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`
			"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

			    - \\"unsafe\\" fields are experimental and may change or break at any time.

			"
		`);
		});

		it("should error when bindings of different types have the same name", async () => {
			writeWranglerToml({
				durable_objects: {
					bindings: [
						{
							name: "CONFLICTING_NAME_ONE",
							class_name: "SomeDurableObject",
							script_name: "some-durable-object-worker",
						},
						{
							name: "CONFLICTING_NAME_TWO",
							class_name: "AnotherDurableObject",
							script_name: "another-durable-object-worker",
						},
					],
				},
				kv_namespaces: [
					{ binding: "CONFLICTING_NAME_ONE", id: "kv-ns-one-id" },
					{ binding: "CONFLICTING_NAME_TWO", id: "kv-ns-two-id" },
				],
				r2_buckets: [
					{
						binding: "CONFLICTING_NAME_ONE",
						bucket_name: "r2-bucket-one-name",
					},
					{
						binding: "CONFLICTING_NAME_THREE",
						bucket_name: "r2-bucket-two-name",
					},
				],
				analytics_engine_datasets: [
					{
						binding: "CONFLICTING_NAME_FOUR",
						dataset: "analytics-engine-dataset-name",
					},
				],
				text_blobs: {
					CONFLICTING_NAME_THREE: "./my-entire-app-depends-on-this.cfg",
					CONFLICTING_NAME_FOUR: "./the-entirety-of-human-knowledge.txt",
				},
				unsafe: {
					bindings: [
						{
							name: "CONFLICTING_NAME_THREE",
							type: "some unsafe thing",
							data: { some: { unsafe: "thing" } },
						},
						{
							name: "CONFLICTING_NAME_FOUR",
							type: "another unsafe thing",
							data: 1337,
						},
					],
					metadata: undefined,
				},
				vars: {
					ENV_VAR_ONE: 123,
					CONFLICTING_NAME_THREE: "Hello, I'm an environment variable",
				},
				wasm_modules: {
					WASM_MODULE_ONE: "./some_wasm.wasm",
					CONFLICTING_NAME_THREE: "./more_wasm.wasm",
				},
				data_blobs: {
					DATA_BLOB_ONE: "./some_data.bin",
					CONFLICTING_NAME_THREE: "./more_data.bin",
				},
			});

			writeWorkerSource({ type: "sw" });
			fs.writeFileSync("./my-entire-app-depends-on-this.cfg", "config = value");
			fs.writeFileSync(
				"./the-entirety-of-human-knowledge.txt",
				"Everything's bigger in Texas"
			);
			fs.writeFileSync("./some_wasm.wasm", "some wasm");
			fs.writeFileSync("./more_wasm.wasm", "more wasm");

			await expect(runWrangler("deploy index.js")).rejects
				.toMatchInlineSnapshot(`
				[Error: Processing wrangler.toml configuration:
				  - CONFLICTING_NAME_ONE assigned to Durable Object, KV Namespace, and R2 Bucket bindings.
				  - CONFLICTING_NAME_TWO assigned to Durable Object and KV Namespace bindings.
				  - CONFLICTING_NAME_THREE assigned to R2 Bucket, Text Blob, Unsafe, Environment Variable, WASM Module, and Data Blob bindings.
				  - CONFLICTING_NAME_FOUR assigned to Analytics Engine Dataset, Text Blob, and Unsafe bindings.
				  - Bindings must have unique names, so that they can all be referenced in the worker.
				    Please change your bindings to have unique names.]
			`);
			expect(std.out).toMatchInlineSnapshot(`""`);
			expect(std.err).toMatchInlineSnapshot(`
			        "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mProcessing wrangler.toml configuration:[0m

			            - CONFLICTING_NAME_ONE assigned to Durable Object, KV Namespace, and R2 Bucket bindings.
			            - CONFLICTING_NAME_TWO assigned to Durable Object and KV Namespace bindings.
			            - CONFLICTING_NAME_THREE assigned to R2 Bucket, Text Blob, Unsafe, Environment Variable, WASM
			          Module, and Data Blob bindings.
			            - CONFLICTING_NAME_FOUR assigned to Analytics Engine Dataset, Text Blob, and Unsafe bindings.
			            - Bindings must have unique names, so that they can all be referenced in the worker.
			              Please change your bindings to have unique names.

			        "
		      `);
			expect(std.warn).toMatchInlineSnapshot(`
			        "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

			            - \\"unsafe\\" fields are experimental and may change or break at any time.

			        "
		      `);
		});

		it("should error when bindings of the same type have the same name", async () => {
			writeWranglerToml({
				durable_objects: {
					bindings: [
						{
							name: "CONFLICTING_DURABLE_OBJECT_NAME",
							class_name: "SomeDurableObject",
							script_name: "some-durable-object-worker",
						},
						{
							name: "CONFLICTING_DURABLE_OBJECT_NAME",
							class_name: "AnotherDurableObject",
							script_name: "another-durable-object-worker",
						},
					],
				},
				kv_namespaces: [
					{ binding: "CONFLICTING_KV_NAMESPACE_NAME", id: "kv-ns-one-id" },
					{ binding: "CONFLICTING_KV_NAMESPACE_NAME", id: "kv-ns-two-id" },
				],
				r2_buckets: [
					{
						binding: "CONFLICTING_R2_BUCKET_NAME",
						bucket_name: "r2-bucket-one-name",
					},
					{
						binding: "CONFLICTING_R2_BUCKET_NAME",
						bucket_name: "r2-bucket-two-name",
					},
				],
				analytics_engine_datasets: [
					{
						binding: "CONFLICTING_AE_DATASET_NAME",
						dataset: "ae-dataset-one-name",
					},
					{
						binding: "CONFLICTING_AE_DATASET_NAME",
						dataset: "ae-dataset-two-name",
					},
				],
				unsafe: {
					bindings: [
						{
							name: "CONFLICTING_UNSAFE_NAME",
							type: "some unsafe thing",
							data: { some: { unsafe: "thing" } },
						},
						{
							name: "CONFLICTING_UNSAFE_NAME",
							type: "another unsafe thing",
							data: 1337,
						},
					],
					metadata: undefined,
				},
				// text_blobs, vars, wasm_modules and data_blobs are fine because they're object literals,
				// and by definition cannot have two keys of the same name
				//
				// text_blobs: {
				//   CONFLICTING_TEXT_BLOB_NAME: "./my-entire-app-depends-on-this.cfg",
				//   CONFLICTING_TEXT_BLOB_NAME: "./the-entirety-of-human-knowledge.txt",
				// },
				// vars: {
				//   CONFLICTING_VARS_NAME: 123,
				//   CONFLICTING_VARS_NAME: "Hello, I'm an environment variable",
				// },
				// wasm_modules: {
				//   CONFLICTING_WASM_MODULE_NAME: "./some_wasm.wasm",
				//   CONFLICTING_WASM_MODULE_NAME: "./more_wasm.wasm",
				// },
			});

			writeWorkerSource({ type: "sw" });

			await expect(runWrangler("deploy index.js")).rejects
				.toMatchInlineSnapshot(`
				[Error: Processing wrangler.toml configuration:
				  - CONFLICTING_DURABLE_OBJECT_NAME assigned to multiple Durable Object bindings.
				  - CONFLICTING_KV_NAMESPACE_NAME assigned to multiple KV Namespace bindings.
				  - CONFLICTING_R2_BUCKET_NAME assigned to multiple R2 Bucket bindings.
				  - CONFLICTING_AE_DATASET_NAME assigned to multiple Analytics Engine Dataset bindings.
				  - CONFLICTING_UNSAFE_NAME assigned to multiple Unsafe bindings.
				  - Bindings must have unique names, so that they can all be referenced in the worker.
				    Please change your bindings to have unique names.]
			`);
			expect(std.out).toMatchInlineSnapshot(`""`);
			expect(std.err).toMatchInlineSnapshot(`
			        "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mProcessing wrangler.toml configuration:[0m

			            - CONFLICTING_DURABLE_OBJECT_NAME assigned to multiple Durable Object bindings.
			            - CONFLICTING_KV_NAMESPACE_NAME assigned to multiple KV Namespace bindings.
			            - CONFLICTING_R2_BUCKET_NAME assigned to multiple R2 Bucket bindings.
			            - CONFLICTING_AE_DATASET_NAME assigned to multiple Analytics Engine Dataset bindings.
			            - CONFLICTING_UNSAFE_NAME assigned to multiple Unsafe bindings.
			            - Bindings must have unique names, so that they can all be referenced in the worker.
			              Please change your bindings to have unique names.

			        "
		      `);
			expect(std.warn).toMatchInlineSnapshot(`
			        "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

			            - \\"unsafe\\" fields are experimental and may change or break at any time.

			        "
		      `);
		});

		it("should error correctly when bindings of the same and different types use the same name", async () => {
			writeWranglerToml({
				durable_objects: {
					bindings: [
						{
							name: "CONFLICTING_DURABLE_OBJECT_NAME",
							class_name: "SomeDurableObject",
							script_name: "some-durable-object-worker",
						},
						{
							name: "CONFLICTING_DURABLE_OBJECT_NAME",
							class_name: "AnotherDurableObject",
							script_name: "another-durable-object-worker",
						},
					],
				},
				kv_namespaces: [
					{
						binding: "CONFLICTING_KV_NAMESPACE_NAME",
						id: "kv-ns-one-id",
					},
					{
						binding: "CONFLICTING_KV_NAMESPACE_NAME",
						id: "kv-ns-two-id",
					},
					{ binding: "CONFLICTING_NAME_ONE", id: "kv-ns-three-id" },
					{ binding: "CONFLICTING_NAME_TWO", id: "kv-ns-four-id" },
				],
				r2_buckets: [
					{
						binding: "CONFLICTING_R2_BUCKET_NAME",
						bucket_name: "r2-bucket-one-name",
					},
					{
						binding: "CONFLICTING_R2_BUCKET_NAME",
						bucket_name: "r2-bucket-two-name",
					},
					{
						binding: "CONFLICTING_NAME_THREE",
						bucket_name: "r2-bucket-three-name",
					},
					{
						binding: "CONFLICTING_NAME_FOUR",
						bucket_name: "r2-bucket-four-name",
					},
				],
				analytics_engine_datasets: [
					{
						binding: "CONFLICTING_AE_DATASET_NAME",
						dataset: "ae-dataset-one-name",
					},
					{
						binding: "CONFLICTING_AE_DATASET_NAME",
						dataset: "ae-dataset-two-name",
					},
					{
						binding: "CONFLICTING_NAME_THREE",
						dataset: "ae-dataset-three-name",
					},
					{
						binding: "CONFLICTING_NAME_FOUR",
						dataset: "ae-dataset-four-name",
					},
				],
				text_blobs: {
					CONFLICTING_NAME_THREE: "./my-entire-app-depends-on-this.cfg",
					CONFLICTING_NAME_FOUR: "./the-entirety-of-human-knowledge.txt",
				},
				unsafe: {
					bindings: [
						{
							name: "CONFLICTING_UNSAFE_NAME",
							type: "some unsafe thing",
							data: { some: { unsafe: "thing" } },
						},
						{
							name: "CONFLICTING_UNSAFE_NAME",
							type: "another unsafe thing",
							data: 1337,
						},
						{
							name: "CONFLICTING_NAME_THREE",
							type: "yet another unsafe thing",
							data: "how is a string unsafe?",
						},
						{
							name: "CONFLICTING_NAME_FOUR",
							type: "a fourth unsafe thing",
							data: null,
						},
					],
					metadata: undefined,
				},
				vars: {
					ENV_VAR_ONE: 123,
					CONFLICTING_NAME_THREE: "Hello, I'm an environment variable",
				},
				wasm_modules: {
					WASM_MODULE_ONE: "./some_wasm.wasm",
					CONFLICTING_NAME_THREE: "./more_wasm.wasm",
				},
				data_blobs: {
					DATA_BLOB_ONE: "./some_data.bin",
					CONFLICTING_NAME_THREE: "./more_data.bin",
				},
			});

			writeWorkerSource({ type: "sw" });
			fs.writeFileSync("./my-entire-app-depends-on-this.cfg", "config = value");
			fs.writeFileSync(
				"./the-entirety-of-human-knowledge.txt",
				"Everything's bigger in Texas"
			);
			fs.writeFileSync("./some_wasm.wasm", "some wasm");
			fs.writeFileSync("./more_wasm.wasm", "more wasm");

			await expect(runWrangler("deploy index.js")).rejects
				.toMatchInlineSnapshot(`
				[Error: Processing wrangler.toml configuration:
				  - CONFLICTING_DURABLE_OBJECT_NAME assigned to multiple Durable Object bindings.
				  - CONFLICTING_KV_NAMESPACE_NAME assigned to multiple KV Namespace bindings.
				  - CONFLICTING_R2_BUCKET_NAME assigned to multiple R2 Bucket bindings.
				  - CONFLICTING_NAME_THREE assigned to R2 Bucket, Analytics Engine Dataset, Text Blob, Unsafe, Environment Variable, WASM Module, and Data Blob bindings.
				  - CONFLICTING_NAME_FOUR assigned to R2 Bucket, Analytics Engine Dataset, Text Blob, and Unsafe bindings.
				  - CONFLICTING_AE_DATASET_NAME assigned to multiple Analytics Engine Dataset bindings.
				  - CONFLICTING_UNSAFE_NAME assigned to multiple Unsafe bindings.
				  - Bindings must have unique names, so that they can all be referenced in the worker.
				    Please change your bindings to have unique names.]
			`);
			expect(std.out).toMatchInlineSnapshot(`""`);
			expect(std.err).toMatchInlineSnapshot(`
			        "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mProcessing wrangler.toml configuration:[0m

			            - CONFLICTING_DURABLE_OBJECT_NAME assigned to multiple Durable Object bindings.
			            - CONFLICTING_KV_NAMESPACE_NAME assigned to multiple KV Namespace bindings.
			            - CONFLICTING_R2_BUCKET_NAME assigned to multiple R2 Bucket bindings.
			            - CONFLICTING_NAME_THREE assigned to R2 Bucket, Analytics Engine Dataset, Text Blob, Unsafe,
			          Environment Variable, WASM Module, and Data Blob bindings.
			            - CONFLICTING_NAME_FOUR assigned to R2 Bucket, Analytics Engine Dataset, Text Blob, and Unsafe
			          bindings.
			            - CONFLICTING_AE_DATASET_NAME assigned to multiple Analytics Engine Dataset bindings.
			            - CONFLICTING_UNSAFE_NAME assigned to multiple Unsafe bindings.
			            - Bindings must have unique names, so that they can all be referenced in the worker.
			              Please change your bindings to have unique names.

			        "
		      `);
			expect(std.warn).toMatchInlineSnapshot(`
			        "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

			            - \\"unsafe\\" fields are experimental and may change or break at any time.

			        "
		      `);
		});

		describe("[wasm_modules]", () => {
			it("should be able to define wasm modules for service-worker format workers", async () => {
				writeWranglerToml({
					wasm_modules: {
						TESTWASMNAME: "./path/to/test.wasm",
					},
				});
				writeWorkerSource({ type: "sw" });
				fs.mkdirSync("./path/to", { recursive: true });
				fs.writeFileSync("./path/to/test.wasm", "SOME WASM CONTENT");
				mockUploadWorkerRequest({
					expectedType: "sw",
					expectedModules: { TESTWASMNAME: "SOME WASM CONTENT" },
					expectedBindings: [
						{ name: "TESTWASMNAME", part: "TESTWASMNAME", type: "wasm_module" },
					],
					useOldUploadApi: true,
				});
				mockSubDomainRequest();

				await runWrangler("deploy index.js");
				expect(std.out).toMatchInlineSnapshot(`
					"Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your worker has access to the following bindings:
					- Wasm Modules:
					  - TESTWASMNAME: path/to/test.wasm
					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});

			it("should error when defining wasm modules for modules format workers", async () => {
				writeWranglerToml({
					wasm_modules: {
						TESTWASMNAME: "./path/to/test.wasm",
					},
				});
				writeWorkerSource({ type: "esm" });
				fs.mkdirSync("./path/to", { recursive: true });
				fs.writeFileSync("./path/to/test.wasm", "SOME WASM CONTENT");

				await expect(
					runWrangler("deploy index.js")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: You cannot configure [wasm_modules] with an ES module worker. Instead, import the .wasm module directly in your code]`
				);
				expect(std.out).toMatchInlineSnapshot(`""`);
				expect(std.err).toMatchInlineSnapshot(`
			          "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mYou cannot configure [wasm_modules] with an ES module worker. Instead, import the .wasm module directly in your code[0m

			          "
		        `);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});

			it("should resolve wasm modules relative to the wrangler.toml file", async () => {
				fs.mkdirSync("./path/to/and/the/path/to/", { recursive: true });
				fs.writeFileSync(
					"./path/to/wrangler.toml",
					TOML.stringify({
						compatibility_date: "2022-01-12",
						name: "test-name",
						wasm_modules: {
							TESTWASMNAME: "./and/the/path/to/test.wasm",
						},
					}),

					"utf-8"
				);

				writeWorkerSource({ type: "sw" });
				fs.writeFileSync(
					"./path/to/and/the/path/to/test.wasm",
					"SOME WASM CONTENT"
				);
				mockUploadWorkerRequest({
					expectedType: "sw",
					expectedModules: { TESTWASMNAME: "SOME WASM CONTENT" },
					expectedBindings: [
						{ name: "TESTWASMNAME", part: "TESTWASMNAME", type: "wasm_module" },
					],
					expectedCompatibilityDate: "2022-01-12",
					useOldUploadApi: true,
				});
				mockSubDomainRequest();
				await runWrangler("deploy index.js --config ./path/to/wrangler.toml");
				expect(std.out).toMatchInlineSnapshot(`
					"Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your worker has access to the following bindings:
					- Wasm Modules:
					  - TESTWASMNAME: path/to/and/the/path/to/test.wasm
					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});

			it("should be able to import .wasm modules from service-worker format workers", async () => {
				writeWranglerToml();
				fs.writeFileSync(
					"./index.js",
					"import TESTWASMNAME from './test.wasm';"
				);
				fs.writeFileSync("./test.wasm", "SOME WASM CONTENT");
				mockUploadWorkerRequest({
					expectedType: "sw",
					expectedModules: {
						__94b240d0d692281e6467aa42043986e5c7eea034_test_wasm:
							"SOME WASM CONTENT",
					},
					expectedBindings: [
						{
							name: "__94b240d0d692281e6467aa42043986e5c7eea034_test_wasm",
							part: "__94b240d0d692281e6467aa42043986e5c7eea034_test_wasm",
							type: "wasm_module",
						},
					],
					useOldUploadApi: true,
				});
				mockSubDomainRequest();
				await runWrangler("deploy index.js");
				expect(std.out).toMatchInlineSnapshot(`
					"Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});
		});

		describe("[text_blobs]", () => {
			it("should be able to define text blobs for service-worker format workers", async () => {
				writeWranglerToml({
					text_blobs: {
						TESTTEXTBLOBNAME: "./path/to/text.file",
					},
				});
				writeWorkerSource({ type: "sw" });
				fs.mkdirSync("./path/to", { recursive: true });
				fs.writeFileSync("./path/to/text.file", "SOME TEXT CONTENT");
				mockUploadWorkerRequest({
					expectedType: "sw",
					expectedModules: { TESTTEXTBLOBNAME: "SOME TEXT CONTENT" },
					expectedBindings: [
						{
							name: "TESTTEXTBLOBNAME",
							part: "TESTTEXTBLOBNAME",
							type: "text_blob",
						},
					],
					useOldUploadApi: true,
				});
				mockSubDomainRequest();
				await runWrangler("deploy index.js");
				expect(std.out).toMatchInlineSnapshot(`
					"Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your worker has access to the following bindings:
					- Text Blobs:
					  - TESTTEXTBLOBNAME: path/to/text.file
					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});

			it("should error when defining text blobs for modules format workers", async () => {
				writeWranglerToml({
					text_blobs: {
						TESTTEXTBLOBNAME: "./path/to/text.file",
					},
				});
				writeWorkerSource({ type: "esm" });
				fs.mkdirSync("./path/to", { recursive: true });
				fs.writeFileSync("./path/to/text.file", "SOME TEXT CONTENT");

				await expect(
					runWrangler("deploy index.js")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: You cannot configure [text_blobs] with an ES module worker. Instead, import the file directly in your code, and optionally configure \`[rules]\` in your wrangler.toml]`
				);
				expect(std.out).toMatchInlineSnapshot(`""`);
				expect(std.err).toMatchInlineSnapshot(`
			          "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mYou cannot configure [text_blobs] with an ES module worker. Instead, import the file directly in your code, and optionally configure \`[rules]\` in your wrangler.toml[0m

			          "
		        `);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});

			it("should resolve text blobs relative to the wrangler.toml file", async () => {
				fs.mkdirSync("./path/to/and/the/path/to/", { recursive: true });
				fs.writeFileSync(
					"./path/to/wrangler.toml",
					TOML.stringify({
						compatibility_date: "2022-01-12",
						name: "test-name",
						text_blobs: {
							TESTTEXTBLOBNAME: "./and/the/path/to/text.file",
						},
					}),

					"utf-8"
				);

				writeWorkerSource({ type: "sw" });
				fs.writeFileSync(
					"./path/to/and/the/path/to/text.file",
					"SOME TEXT CONTENT"
				);
				mockUploadWorkerRequest({
					expectedType: "sw",
					expectedModules: { TESTTEXTBLOBNAME: "SOME TEXT CONTENT" },
					expectedBindings: [
						{
							name: "TESTTEXTBLOBNAME",
							part: "TESTTEXTBLOBNAME",
							type: "text_blob",
						},
					],
					expectedCompatibilityDate: "2022-01-12",
					useOldUploadApi: true,
				});
				mockSubDomainRequest();
				await runWrangler("deploy index.js --config ./path/to/wrangler.toml");
				expect(std.out).toMatchInlineSnapshot(`
					"Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your worker has access to the following bindings:
					- Text Blobs:
					  - TESTTEXTBLOBNAME: path/to/and/the/path/to/text.file
					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});
		});

		describe("[data_blobs]", () => {
			it("should be able to define data blobs for service-worker format workers", async () => {
				writeWranglerToml({
					data_blobs: {
						TESTDATABLOBNAME: "./path/to/data.bin",
					},
				});
				writeWorkerSource({ type: "sw" });
				fs.mkdirSync("./path/to", { recursive: true });
				fs.writeFileSync("./path/to/data.bin", "SOME DATA CONTENT");
				mockUploadWorkerRequest({
					expectedType: "sw",
					expectedModules: { TESTDATABLOBNAME: "SOME DATA CONTENT" },
					expectedBindings: [
						{
							name: "TESTDATABLOBNAME",
							part: "TESTDATABLOBNAME",
							type: "data_blob",
						},
					],
					useOldUploadApi: true,
				});
				mockSubDomainRequest();
				await runWrangler("deploy index.js");
				expect(std.out).toMatchInlineSnapshot(`
					"Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your worker has access to the following bindings:
					- Data Blobs:
					  - TESTDATABLOBNAME: path/to/data.bin
					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});

			it("should error when defining data blobs for modules format workers", async () => {
				writeWranglerToml({
					data_blobs: {
						TESTDATABLOBNAME: "./path/to/data.bin",
					},
				});
				writeWorkerSource({ type: "esm" });
				fs.mkdirSync("./path/to", { recursive: true });
				fs.writeFileSync("./path/to/data.bin", "SOME DATA CONTENT");

				await expect(
					runWrangler("deploy index.js")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: You cannot configure [data_blobs] with an ES module worker. Instead, import the file directly in your code, and optionally configure \`[rules]\` in your wrangler.toml]`
				);
				expect(std.out).toMatchInlineSnapshot(`""`);
				expect(std.err).toMatchInlineSnapshot(`
			          "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mYou cannot configure [data_blobs] with an ES module worker. Instead, import the file directly in your code, and optionally configure \`[rules]\` in your wrangler.toml[0m

			          "
		        `);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});

			it("should resolve data blobs relative to the wrangler.toml file", async () => {
				fs.mkdirSync("./path/to/and/the/path/to/", { recursive: true });
				fs.writeFileSync(
					"./path/to/wrangler.toml",
					TOML.stringify({
						compatibility_date: "2022-01-12",
						name: "test-name",
						data_blobs: {
							TESTDATABLOBNAME: "./and/the/path/to/data.bin",
						},
					}),

					"utf-8"
				);

				writeWorkerSource({ type: "sw" });
				fs.writeFileSync(
					"./path/to/and/the/path/to/data.bin",
					"SOME DATA CONTENT"
				);
				mockUploadWorkerRequest({
					expectedType: "sw",
					expectedModules: { TESTDATABLOBNAME: "SOME DATA CONTENT" },
					expectedBindings: [
						{
							name: "TESTDATABLOBNAME",
							part: "TESTDATABLOBNAME",
							type: "data_blob",
						},
					],
					expectedCompatibilityDate: "2022-01-12",
					useOldUploadApi: true,
				});
				mockSubDomainRequest();
				await runWrangler("deploy index.js --config ./path/to/wrangler.toml");
				expect(std.out).toMatchInlineSnapshot(`
					"Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your worker has access to the following bindings:
					- Data Blobs:
					  - TESTDATABLOBNAME: path/to/and/the/path/to/data.bin
					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});
		});

		describe("[vars]", () => {
			it("should support json bindings", async () => {
				writeWranglerToml({
					vars: {
						text: "plain ol' string",
						count: 1,
						complex: { enabled: true, id: 123 },
					},
				});
				writeWorkerSource();
				mockSubDomainRequest();
				mockUploadWorkerRequest({
					expectedBindings: [
						{ name: "text", type: "plain_text", text: "plain ol' string" },
						{ name: "count", type: "json", json: 1 },
						{
							name: "complex",
							type: "json",
							json: { enabled: true, id: 123 },
						},
					],
				});

				await runWrangler("deploy index.js");
				expect(std.out).toMatchInlineSnapshot(`
					"Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your worker has access to the following bindings:
					- Vars:
					  - text: \\"plain ol' string\\"
					  - count: 1
					  - complex: {
					 \\"enabled\\": true,
					 \\"id\\": 123
					}
					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});

			it("should read vars passed as cli arguments", async () => {
				writeWranglerToml();
				writeWorkerSource();
				mockSubDomainRequest();
				mockUploadWorkerRequest();
				await runWrangler("deploy index.js --var TEXT:sometext --var COUNT:1");
				expect(std).toMatchInlineSnapshot(`
					Object {
					  "debug": "",
					  "err": "",
					  "info": "",
					  "out": "Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your worker has access to the following bindings:
					- Vars:
					  - TEXT: \\"(hidden)\\"
					  - COUNT: \\"(hidden)\\"
					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class",
					  "warn": "",
					}
				`);
			});
		});

		describe("[r2_buckets]", () => {
			it("should support r2 bucket bindings", async () => {
				writeWranglerToml({
					r2_buckets: [{ binding: "FOO", bucket_name: "foo-bucket" }],
				});
				writeWorkerSource();
				mockSubDomainRequest();
				mockUploadWorkerRequest({
					expectedBindings: [
						{ bucket_name: "foo-bucket", name: "FOO", type: "r2_bucket" },
					],
				});

				await runWrangler("deploy index.js");
				expect(std.out).toMatchInlineSnapshot(`
					"Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your worker has access to the following bindings:
					- R2 Buckets:
					  - FOO: foo-bucket
					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});
		});

		describe("[logfwdr]", () => {
			it("should support logfwdr bindings", async () => {
				writeWranglerToml({
					logfwdr: {
						bindings: [
							{
								name: "httplogs",
								destination: "httplogs",
							},
							{
								name: "trace",
								destination: "trace",
							},
						],
					},
				});
				writeWorkerSource();
				mockSubDomainRequest();
				mockUploadWorkerRequest({
					expectedBindings: [
						{
							name: "httplogs",
							type: "logfwdr",
							destination: "httplogs",
						},
						{
							name: "trace",
							type: "logfwdr",
							destination: "trace",
						},
					],
				});

				await runWrangler("deploy index.js");
				expect(std.out).toMatchInlineSnapshot(`
					"Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your worker has access to the following bindings:
					- logfwdr:
					  - httplogs: httplogs
					  - trace: trace
					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});

			it("should error when logfwdr schemas are specified", async () => {
				writeWranglerToml({
					logfwdr: {
						// @ts-expect-error this property been replaced with the unsafe.capnp section
						schema: "./message.capnp.compiled",
						bindings: [
							{
								name: "httplogs",
								destination: "httplogs",
							},
							{
								name: "trace",
								destination: "trace",
							},
						],
					},
				});

				await expect(() => runWrangler("deploy index.js")).rejects
					.toThrowErrorMatchingInlineSnapshot(`
					[Error: Processing wrangler.toml configuration:
					  - "logfwdr" binding "schema" property has been replaced with the "unsafe.capnp" object, which expects a "base_path" and an array of "source_schemas" to compile, or a "compiled_schema" property.]
				`);
			});
		});

		describe("[durable_objects]", () => {
			it("should support durable object bindings", async () => {
				writeWranglerToml({
					durable_objects: {
						bindings: [
							{
								name: "EXAMPLE_DO_BINDING",
								class_name: "ExampleDurableObject",
							},
						],
					},
					migrations: [{ tag: "v1", new_classes: ["ExampleDurableObject"] }],
				});
				fs.writeFileSync(
					"index.js",
					`export class ExampleDurableObject {}; export default{};`
				);
				mockSubDomainRequest();
				mockLegacyScriptData({
					scripts: [{ id: "test-name", migration_tag: "v1" }],
				});
				mockUploadWorkerRequest({
					expectedBindings: [
						{
							class_name: "ExampleDurableObject",
							name: "EXAMPLE_DO_BINDING",
							type: "durable_object_namespace",
						},
					],
				});

				await runWrangler("deploy index.js");
				expect(std.out).toMatchInlineSnapshot(`
					"Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your worker has access to the following bindings:
					- Durable Objects:
					  - EXAMPLE_DO_BINDING: ExampleDurableObject
					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});

			it("should support durable object bindings to SQLite classes", async () => {
				writeWranglerToml({
					durable_objects: {
						bindings: [
							{
								name: "EXAMPLE_DO_BINDING",
								class_name: "ExampleDurableObject",
							},
						],
					},
					migrations: [
						{ tag: "v1", new_sqlite_classes: ["ExampleDurableObject"] },
					],
				});
				fs.writeFileSync(
					"index.js",
					`export class ExampleDurableObject {}; export default{};`
				);
				mockSubDomainRequest();
				mockLegacyScriptData({
					scripts: [{ id: "test-name", migration_tag: "v1" }],
				});
				mockUploadWorkerRequest({
					expectedBindings: [
						{
							class_name: "ExampleDurableObject",
							name: "EXAMPLE_DO_BINDING",
							type: "durable_object_namespace",
						},
					],
				});

				await runWrangler("deploy index.js");
				expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Worker Startup Time: 100 ms
			Your worker has access to the following bindings:
			- Durable Objects:
			  - EXAMPLE_DO_BINDING: ExampleDurableObject
			Uploaded test-name (TIMINGS)
			Deployed test-name triggers (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Version ID: Galaxy-Class"
		`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});

			it("should support service-workers binding to external durable objects", async () => {
				writeWranglerToml({
					durable_objects: {
						bindings: [
							{
								name: "EXAMPLE_DO_BINDING",
								class_name: "ExampleDurableObject",
								script_name: "example-do-binding-worker",
							},
						],
					},
				});
				writeWorkerSource({ type: "sw" });
				mockSubDomainRequest();
				mockUploadWorkerRequest({
					expectedType: "sw",
					expectedBindings: [
						{
							name: "EXAMPLE_DO_BINDING",
							class_name: "ExampleDurableObject",
							script_name: "example-do-binding-worker",
							type: "durable_object_namespace",
						},
					],
					useOldUploadApi: true,
				});

				await runWrangler("deploy index.js");
				expect(std.out).toMatchInlineSnapshot(`
					"Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your worker has access to the following bindings:
					- Durable Objects:
					  - EXAMPLE_DO_BINDING: ExampleDurableObject (defined in example-do-binding-worker)
					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});

			it("should support module workers implementing durable objects", async () => {
				writeWranglerToml({
					durable_objects: {
						bindings: [
							{
								name: "EXAMPLE_DO_BINDING",
								class_name: "ExampleDurableObject",
							},
						],
					},
					migrations: [{ tag: "v1", new_classes: ["ExampleDurableObject"] }],
				});
				fs.writeFileSync(
					"index.js",
					`export class ExampleDurableObject {}; export default{};`
				);
				mockSubDomainRequest();
				mockLegacyScriptData({
					scripts: [{ id: "test-name", migration_tag: "v1" }],
				});
				mockUploadWorkerRequest({
					expectedType: "esm",
					expectedBindings: [
						{
							name: "EXAMPLE_DO_BINDING",
							class_name: "ExampleDurableObject",
							type: "durable_object_namespace",
						},
					],
				});

				await runWrangler("deploy index.js");
				expect(std.out).toMatchInlineSnapshot(`
					"Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your worker has access to the following bindings:
					- Durable Objects:
					  - EXAMPLE_DO_BINDING: ExampleDurableObject
					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});

			it("should support durable objects and D1", async () => {
				writeWranglerToml({
					main: "index.js",
					durable_objects: {
						bindings: [
							{
								name: "EXAMPLE_DO_BINDING",
								class_name: "ExampleDurableObject",
							},
						],
					},
					migrations: [{ tag: "v1", new_classes: ["ExampleDurableObject"] }],
					d1_databases: [
						{
							binding: "DB",
							database_name: "test-d1-db",
							database_id: "UUID-1-2-3-4",
							preview_database_id: "UUID-1-2-3-4",
						},
					],
				});
				const scriptContent = `export class ExampleDurableObject {}; export default{};`;
				fs.writeFileSync("index.js", scriptContent);
				mockSubDomainRequest();
				mockLegacyScriptData({
					scripts: [{ id: "test-name", migration_tag: "v1" }],
				});
				mockUploadWorkerRequest({
					expectedType: "esm",
					expectedBindings: [
						{
							name: "EXAMPLE_DO_BINDING",
							class_name: "ExampleDurableObject",
							type: "durable_object_namespace",
						},
						{ name: "DB", type: "d1_database" },
					],
				});

				await runWrangler("deploy index.js --outdir tmp --dry-run");
				expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Your worker has access to the following bindings:
			- Durable Objects:
			  - EXAMPLE_DO_BINDING: ExampleDurableObject
			- D1 Databases:
			  - DB: test-d1-db (UUID-1-2-3-4), Preview: (UUID-1-2-3-4)
			--dry-run: exiting now."
		`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
				const output = fs.readFileSync("tmp/index.js", "utf-8");
				// D1 no longer injects middleware, so we can pass through the user's code unchanged
				expect(output).not.toContain(`ExampleDurableObject2`);
				// ExampleDurableObject is exported directly
				expect(output).toContain("export {\n  ExampleDurableObject,");
			});

			it("should error when detecting a service-worker worker implementing durable objects", async () => {
				writeWranglerToml({
					durable_objects: {
						bindings: [
							{
								name: "EXAMPLE_DO_BINDING",
								class_name: "ExampleDurableObject",
							},
						],
					},
				});
				writeWorkerSource({ type: "sw" });
				mockSubDomainRequest();

				await expect(runWrangler("deploy index.js")).rejects
					.toThrowErrorMatchingInlineSnapshot(`
					[Error: You seem to be trying to use Durable Objects in a Worker written as a service-worker.
					You can use Durable Objects defined in other Workers by specifying a \`script_name\` in your wrangler.toml, where \`script_name\` is the name of the Worker that implements that Durable Object. For example:
					{ name = EXAMPLE_DO_BINDING, class_name = ExampleDurableObject } ==> { name = EXAMPLE_DO_BINDING, class_name = ExampleDurableObject, script_name = example-do-binding-worker }
					Alternatively, migrate your worker to ES Module syntax to implement a Durable Object in this Worker:
					https://developers.cloudflare.com/workers/learning/migrating-to-module-workers/]
				`);
			});
		});

		describe("[services]", () => {
			it("should support service bindings", async () => {
				writeWranglerToml({
					services: [
						{
							binding: "FOO",
							service: "foo-service",
							environment: "production",
						},
					],
				});
				writeWorkerSource();
				mockSubDomainRequest();
				mockUploadWorkerRequest({
					expectedBindings: [
						{
							type: "service",
							name: "FOO",
							service: "foo-service",
							environment: "production",
						},
					],
				});

				await runWrangler("deploy index.js");
				expect(std.out).toMatchInlineSnapshot(`
					"Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your worker has access to the following bindings:
					- Services:
					  - FOO: foo-service - production
					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});

			it("should support service bindings with entrypoints", async () => {
				writeWranglerToml({
					services: [
						{
							binding: "FOO",
							service: "foo-service",
							environment: "production",
							entrypoint: "MyHandler",
						},
					],
				});
				writeWorkerSource();
				mockSubDomainRequest();
				mockUploadWorkerRequest({
					expectedBindings: [
						{
							type: "service",
							name: "FOO",
							service: "foo-service",
							environment: "production",
							entrypoint: "MyHandler",
						},
					],
				});

				await runWrangler("deploy index.js");
				expect(std.out).toMatchInlineSnapshot(`
					"Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your worker has access to the following bindings:
					- Services:
					  - FOO: foo-service - production (#MyHandler)
					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});
		});

		describe("[analytics_engine_datasets]", () => {
			it("should support analytics engine bindings", async () => {
				writeWranglerToml({
					analytics_engine_datasets: [
						{ binding: "FOO", dataset: "foo-dataset" },
					],
				});
				writeWorkerSource();
				mockSubDomainRequest();
				mockUploadWorkerRequest({
					expectedBindings: [
						{ dataset: "foo-dataset", name: "FOO", type: "analytics_engine" },
					],
				});

				await runWrangler("deploy index.js");
				expect(std.out).toMatchInlineSnapshot(`
					"Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your worker has access to the following bindings:
					- Analytics Engine Datasets:
					  - FOO: foo-dataset
					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});
		});

		describe("[dispatch_namespaces]", () => {
			it("should support bindings to a dispatch namespace", async () => {
				writeWranglerToml({
					dispatch_namespaces: [
						{
							binding: "foo",
							namespace: "Foo",
						},
					],
				});
				writeWorkerSource();
				mockSubDomainRequest();
				mockUploadWorkerRequest({
					expectedBindings: [
						{
							type: "dispatch_namespace",
							name: "foo",
							namespace: "Foo",
						},
					],
				});
				await runWrangler("deploy index.js");
				expect(std.out).toMatchInlineSnapshot(`
					"Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your worker has access to the following bindings:
					- dispatch namespaces:
					  - foo: Foo
					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});

			it("should support dispatch namespace bindings with an outbound worker", async () => {
				writeWranglerToml({
					dispatch_namespaces: [
						{
							binding: "foo",
							namespace: "Foo",
							outbound: { service: "foo_outbound" },
						},
						{
							binding: "bar",
							namespace: "Bar",
							outbound: { service: "bar_outbound", environment: "production" },
						},
					],
				});
				writeWorkerSource();
				mockSubDomainRequest();
				mockUploadWorkerRequest({
					expectedBindings: [
						{
							type: "dispatch_namespace",
							name: "foo",
							namespace: "Foo",
							outbound: {
								worker: {
									service: "foo_outbound",
								},
							},
						},
						{
							type: "dispatch_namespace",
							name: "bar",
							namespace: "Bar",
							outbound: {
								worker: {
									service: "bar_outbound",
									environment: "production",
								},
							},
						},
					],
				});
				await runWrangler("publish index.js");
				expect(std.out).toMatchInlineSnapshot(`
					"Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your worker has access to the following bindings:
					- dispatch namespaces:
					  - foo: Foo (outbound -> foo_outbound)
					  - bar: Bar (outbound -> bar_outbound)
					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`
			"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1m\`wrangler publish\` is deprecated and will be removed in the next major version.[0m

			  Please use \`wrangler deploy\` instead, which accepts exactly the same arguments.

			"
		`);
			});

			it("should support dispatch namespace bindings with parameterized outbounds", async () => {
				writeWranglerToml({
					dispatch_namespaces: [
						{
							binding: "foo",
							namespace: "Foo",
							outbound: {
								service: "foo_outbound",
								parameters: ["some", "outbound", "params"],
							},
						},
					],
				});
				writeWorkerSource();
				mockSubDomainRequest();
				mockUploadWorkerRequest({
					expectedBindings: [
						{
							type: "dispatch_namespace",
							name: "foo",
							namespace: "Foo",
							outbound: {
								worker: {
									service: "foo_outbound",
								},
								params: [
									{ name: "some" },
									{ name: "outbound" },
									{ name: "params" },
								],
							},
						},
					],
				});
				await runWrangler("publish index.js");
				expect(std.out).toMatchInlineSnapshot(`
					"Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your worker has access to the following bindings:
					- dispatch namespaces:
					  - foo: Foo (outbound -> foo_outbound)
					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`
			"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1m\`wrangler publish\` is deprecated and will be removed in the next major version.[0m

			  Please use \`wrangler deploy\` instead, which accepts exactly the same arguments.

			"
		`);
			});
		});

		describe("[unsafe]", () => {
			describe("[unsafe.bindings]", () => {
				it("should stringify object in unsafe metadata", async () => {
					writeWranglerToml({
						unsafe: {
							metadata: {
								stringify: true,
								something: "else",
								undefined: undefined,
								null: null,
								nested: {
									stuff: "here",
								},
							},
						},
					});
					writeWorkerSource();
					mockSubDomainRequest();
					mockUploadWorkerRequest({
						expectedUnsafeMetaData: {
							stringify: true,
							something: "else",
							nested: {
								stuff: "here",
							},
						},
					});
					await runWrangler("deploy index.js");
					expect(std.out).toMatchInlineSnapshot(`
						"Total Upload: xx KiB / gzip: xx KiB
						Worker Startup Time: 100 ms
						Your worker has access to the following bindings:
						- Unsafe Metadata:
						  - stringify: true
						  - something: \\"else\\"
						  - nested: {\\"stuff\\":\\"here\\"}
						Uploaded test-name (TIMINGS)
						Deployed test-name triggers (TIMINGS)
						  https://test-name.test-sub-domain.workers.dev
						Current Version ID: Galaxy-Class"
					`);
				});

				it("should warn if using unsafe bindings", async () => {
					writeWranglerToml({
						unsafe: {
							bindings: [
								{
									name: "my-binding",
									type: "binding-type",
									param: "binding-param",
								},
							],
							metadata: undefined,
						},
					});
					writeWorkerSource();
					mockSubDomainRequest();
					mockUploadWorkerRequest({
						expectedBindings: [
							{
								name: "my-binding",
								type: "binding-type",
								param: "binding-param",
							},
						],
					});

					await runWrangler("deploy index.js");
					expect(std.out).toMatchInlineSnapshot(`
						"Total Upload: xx KiB / gzip: xx KiB
						Worker Startup Time: 100 ms
						Your worker has access to the following bindings:
						- Unsafe:
						  - binding-type: my-binding
						Uploaded test-name (TIMINGS)
						Deployed test-name triggers (TIMINGS)
						  https://test-name.test-sub-domain.workers.dev
						Current Version ID: Galaxy-Class"
					`);
					expect(std.err).toMatchInlineSnapshot(`""`);
					expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

				    - \\"unsafe\\" fields are experimental and may change or break at any time.

				"
			`);
				});

				it("should warn if using unsafe bindings already handled by wrangler", async () => {
					writeWranglerToml({
						unsafe: {
							bindings: [
								{
									name: "my-binding",
									type: "plain_text",
									text: "text",
								},
							],
							metadata: undefined,
						},
					});
					writeWorkerSource();
					mockSubDomainRequest();
					mockUploadWorkerRequest({
						expectedBindings: [
							{
								name: "my-binding",
								type: "plain_text",
								text: "text",
							},
						],
					});

					await runWrangler("deploy index.js");
					expect(std.out).toMatchInlineSnapshot(`
						"Total Upload: xx KiB / gzip: xx KiB
						Worker Startup Time: 100 ms
						Your worker has access to the following bindings:
						- Unsafe:
						  - plain_text: my-binding
						Uploaded test-name (TIMINGS)
						Deployed test-name triggers (TIMINGS)
						  https://test-name.test-sub-domain.workers.dev
						Current Version ID: Galaxy-Class"
					`);
					expect(std.err).toMatchInlineSnapshot(`""`);
					expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

				    - \\"unsafe\\" fields are experimental and may change or break at any time.
				    - \\"unsafe.bindings[0]\\": {\\"name\\":\\"my-binding\\",\\"type\\":\\"plain_text\\",\\"text\\":\\"text\\"}
				      - The binding type \\"plain_text\\" is directly supported by wrangler.
				        Consider migrating this unsafe binding to a format for 'plain_text' bindings that is
				  supported by wrangler for optimal support.
				        For more details, see [4mhttps://developers.cloudflare.com/workers/cli-wrangler/configuration[0m

				"
			`);
				});
			});
			describe("[unsafe.capnp]", () => {
				it("should accept a pre-compiled capnp schema", async () => {
					writeWranglerToml({
						unsafe: {
							capnp: {
								compiled_schema: "./my-compiled-schema",
							},
						},
					});
					writeWorkerSource();
					mockSubDomainRequest();
					mockUploadWorkerRequest({
						expectedCapnpSchema: "my compiled capnp data",
					});
					fs.writeFileSync("./my-compiled-schema", "my compiled capnp data");

					await runWrangler("deploy index.js");
					expect(std.out).toMatchInlineSnapshot(`
						"Total Upload: xx KiB / gzip: xx KiB
						Worker Startup Time: 100 ms
						Uploaded test-name (TIMINGS)
						Deployed test-name triggers (TIMINGS)
						  https://test-name.test-sub-domain.workers.dev
						Current Version ID: Galaxy-Class"
					`);
					expect(std.err).toMatchInlineSnapshot(`""`);
					expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

				    - \\"unsafe\\" fields are experimental and may change or break at any time.

				"
			`);
				});
				it("should error when both pre-compiled and uncompiled-capnp schemas are used", async () => {
					writeWranglerToml({
						unsafe: {
							capnp: {
								compiled_schema: "./my-compiled-schema",
								// @ts-expect-error This should error as the types don't accept having both
								source_schemas: ["./my-src-schema"],
							},
						},
					});
					writeWorkerSource();

					await expect(() => runWrangler("deploy index.js")).rejects
						.toThrowErrorMatchingInlineSnapshot(`
						[Error: Processing wrangler.toml configuration:
						  - The field "unsafe.capnp" cannot contain both "compiled_schema" and one of "base_path" or "source_schemas".]
					`);
				});
				it("should error when no schemas are specified", async () => {
					writeWranglerToml({
						unsafe: {
							// @ts-expect-error This should error as the types expect something to be present
							capnp: {},
						},
					});
					writeWorkerSource();

					await expect(() => runWrangler("deploy index.js")).rejects
						.toThrowErrorMatchingInlineSnapshot(`
						[Error: Processing wrangler.toml configuration:
						  - The field "unsafe.capnp.base_path", when present, should be a string but got undefined
						  - Expected "unsafe.capnp.source_schemas" to be an array of strings but got undefined]
					`);
				});
				it("should error when the capnp compiler is not present, but is required", async () => {
					(sync as Mock).mockReturnValue(false);
					writeWranglerToml({
						unsafe: {
							capnp: {
								base_path: "./",
								source_schemas: ["./my-src-schema"],
							},
						},
					});
					writeWorkerSource();

					await expect(() =>
						runWrangler("deploy index.js")
					).rejects.toThrowErrorMatchingInlineSnapshot(
						`[Error: The capnp compiler is required to upload capnp schemas, but is not present.]`
					);
				});
				it("should accept an uncompiled capnp schema", async () => {
					(sync as Mock).mockReturnValue(true);
					(spawnSync as Mock).mockImplementationOnce((cmd, args) => {
						expect(cmd).toBe("capnp");
						expect(args?.[0]).toBe("compile");
						expect(args?.[1]).toBe("-o-");
						expect(args?.[2]).toContain("--src-prefix=");
						expect(args?.[3]).toContain("my-compiled-schema");
						return {
							pid: -1,
							error: undefined,
							stderr: Buffer.from([]),
							stdout: Buffer.from("my compiled capnp data"),
							status: 0,
							signal: null,
							output: [null],
						};
					});

					writeWranglerToml({
						unsafe: {
							capnp: {
								base_path: "./",
								source_schemas: ["./my-compiled-schema"],
							},
						},
					});
					writeWorkerSource();
					mockSubDomainRequest();
					mockUploadWorkerRequest({
						expectedCapnpSchema: "my compiled capnp data",
					});
					fs.writeFileSync("./my-compiled-schema", "my compiled capnp data");

					await runWrangler("deploy index.js");
					expect(std.out).toMatchInlineSnapshot(`
						"Total Upload: xx KiB / gzip: xx KiB
						Worker Startup Time: 100 ms
						Uploaded test-name (TIMINGS)
						Deployed test-name triggers (TIMINGS)
						  https://test-name.test-sub-domain.workers.dev
						Current Version ID: Galaxy-Class"
					`);
					expect(std.err).toMatchInlineSnapshot(`""`);
					expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

				    - \\"unsafe\\" fields are experimental and may change or break at any time.

				"
			`);
				});
			});
		});
	});

	describe("upload rules", () => {
		it("should be able to define rules for uploading non-js modules (sw)", async () => {
			writeWranglerToml({
				rules: [{ type: "Text", globs: ["**/*.file"], fallthrough: true }],
			});
			fs.writeFileSync("./index.js", `import TEXT from './text.file';`);
			fs.writeFileSync("./text.file", "SOME TEXT CONTENT");
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedType: "sw",
				expectedBindings: [
					{
						name: "__2d91d1c4dd6e57d4f5432187ab7c25f45a8973f0_text_file",
						part: "__2d91d1c4dd6e57d4f5432187ab7c25f45a8973f0_text_file",
						type: "text_blob",
					},
				],
				expectedModules: {
					__2d91d1c4dd6e57d4f5432187ab7c25f45a8973f0_text_file:
						"SOME TEXT CONTENT",
				},
				useOldUploadApi: true,
			});
			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("should be able to define rules for uploading non-js modules (esm)", async () => {
			writeWranglerToml({
				rules: [{ type: "Text", globs: ["**/*.file"], fallthrough: true }],
			});
			fs.writeFileSync(
				"./index.js",
				`import TEXT from './text.file'; export default {};`
			);
			fs.writeFileSync("./text.file", "SOME TEXT CONTENT");
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedType: "esm",
				expectedBindings: [],
				expectedModules: {
					"./2d91d1c4dd6e57d4f5432187ab7c25f45a8973f0-text.file":
						"SOME TEXT CONTENT",
				},
			});
			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("should log a deprecation warning when using `build.upload.rules`", async () => {
			writeWranglerToml({
				build: {
					upload: {
						rules: [{ type: "Text", globs: ["**/*.file"], fallthrough: true }],
					},
				},
			});
			fs.writeFileSync(
				"./index.js",
				`import TEXT from './text.file'; export default {};`
			);
			fs.writeFileSync("./text.file", "SOME TEXT CONTENT");
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedType: "esm",
				expectedBindings: [],
				expectedModules: {
					"./2d91d1c4dd6e57d4f5432187ab7c25f45a8973f0-text.file":
						"SOME TEXT CONTENT",
				},
			});
			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`
			"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

			    - Deprecation: The \`build.upload.rules\` config field is no longer used, the rules should be
			  specified via the \`rules\` config field. Delete the \`build.upload\` field from the configuration
			  file, and add this:
			      \`\`\`
			      [[rules]]
			      type = \\"Text\\"
			      globs = [ \\"**/*.file\\" ]
			      fallthrough = true
			      \`\`\`

			"
		`);
		});

		it("should be able to use fallthrough:true for multiple rules", async () => {
			writeWranglerToml({
				rules: [
					{ type: "Text", globs: ["**/*.file"], fallthrough: true },
					{ type: "Text", globs: ["**/*.other"], fallthrough: true },
				],
			});
			fs.writeFileSync(
				"./index.js",
				`import TEXT from './text.file'; import OTHER from './other.other'; export default {};`
			);
			fs.writeFileSync("./text.file", "SOME TEXT CONTENT");
			fs.writeFileSync("./other.other", "SOME OTHER TEXT CONTENT");
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedType: "esm",
				expectedBindings: [],
				expectedModules: {
					"./2d91d1c4dd6e57d4f5432187ab7c25f45a8973f0-text.file":
						"SOME TEXT CONTENT",
					"./16347a01366873ed80fe45115119de3c92ab8db0-other.other":
						"SOME OTHER TEXT CONTENT",
				},
			});
			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("should be able to use fallthrough:false for multiple rules", async () => {
			writeWranglerToml({
				rules: [
					{ type: "Text", globs: ["**/*.file"], fallthrough: false },
					{ type: "Text", globs: ["**/*.other"] },
				],
			});
			fs.writeFileSync(
				"./index.js",
				`import TEXT from './text.file'; import OTHER from './other.other'; export default {};`
			);
			fs.writeFileSync("./text.file", "SOME TEXT CONTENT");
			fs.writeFileSync("./other.other", "SOME OTHER TEXT CONTENT");

			// We throw an error when we come across a file that matched a rule
			// but was skipped because of fallthrough = false
			let err: Error | undefined;
			try {
				await runWrangler("deploy index.js");
			} catch (e) {
				err = e as Error;
			}
			expect(err?.message).toMatch(
				`The file ./other.other matched a module rule in your configuration ({"type":"Text","globs":["**/*.other"]}), but was ignored because a previous rule with the same type was not marked as \`fallthrough = true\`.`
			);
		});

		it("should warn when multiple rules for the same type do not have fallback defined", async () => {
			writeWranglerToml({
				rules: [
					{ type: "Text", globs: ["**/*.file"] },
					{ type: "Text", globs: ["**/*.other"] },
				],
			});
			fs.writeFileSync(
				"./index.js",
				`import TEXT from './text.file'; import OTHER from './other.other'; export default {};`
			);
			fs.writeFileSync("./text.file", "SOME TEXT CONTENT");
			fs.writeFileSync("./other.other", "SOME OTHER TEXT CONTENT");

			// We throw an error when we come across a file that matched a rule
			// but was skipped because of fallthrough = false
			let err: Error | undefined;
			try {
				await runWrangler("deploy index.js");
			} catch (e) {
				err = e as Error;
			}
			expect(err?.message).toMatch(
				`The file ./other.other matched a module rule in your configuration ({"type":"Text","globs":["**/*.other"]}), but was ignored because a previous rule with the same type was not marked as \`fallthrough = true\`.`
			);
			// and the warnings because fallthrough was not explicitly set
			expect(std.warn).toMatchInlineSnapshot(`
			"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe module rule {\\"type\\":\\"Text\\",\\"globs\\":[\\"**/*.file\\"]} does not have a fallback, the following rules will be ignored:[0m

			   {\\"type\\":\\"Text\\",\\"globs\\":[\\"**/*.other\\"]}
			   {\\"type\\":\\"Text\\",\\"globs\\":[\\"**/*.txt\\",\\"**/*.html\\"]} (DEFAULT)

			  Add \`fallthrough = true\` to rule to allow next rule to be used or \`fallthrough = false\` to silence
			  this warning

			"
		`);
		});

		it("should be able to preserve file names when defining rules for uploading non-js modules (sw)", async () => {
			writeWranglerToml({
				rules: [{ type: "Text", globs: ["**/*.file"], fallthrough: true }],
				preserve_file_names: true,
			});
			fs.writeFileSync("./index.js", `import TEXT from './text.file';`);
			fs.writeFileSync("./text.file", "SOME TEXT CONTENT");
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedType: "sw",
				expectedBindings: [
					{
						name: "__text_file",
						part: "__text_file",
						type: "text_blob",
					},
				],
				expectedModules: {
					__text_file: "SOME TEXT CONTENT",
				},
				useOldUploadApi: true,
			});
			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("should be able to preserve file names when defining rules for uploading non-js modules (esm)", async () => {
			writeWranglerToml({
				rules: [{ type: "Text", globs: ["**/*.file"], fallthrough: true }],
				preserve_file_names: true,
			});
			fs.writeFileSync(
				"./index.js",
				`import TEXT from './text.file'; export default {};`
			);
			fs.writeFileSync("./text.file", "SOME TEXT CONTENT");
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedType: "esm",
				expectedBindings: [],
				expectedModules: {
					"./text.file": "SOME TEXT CONTENT",
				},
			});
			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		describe("inject process.env.NODE_ENV", () => {
			beforeEach(() => {
				vi.stubEnv("NODE_ENV", "some-node-env");
			});

			it("should replace `process.env.NODE_ENV` in scripts", async () => {
				writeWranglerToml();
				fs.writeFileSync(
					"./index.js",
					`export default {
            fetch(){
              return new Response(process.env.NODE_ENV);
            }
          }`
				);
				mockSubDomainRequest();
				mockUploadWorkerRequest({
					expectedEntry: `return new Response("some-node-env");`,
				});
				await runWrangler("deploy index.js");
				expect(std.out).toMatchInlineSnapshot(`
					"Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});
		});
	});

	describe("service worker format", () => {
		it("should error if trying to import a cloudflare prefixed external when in service worker format", async () => {
			writeWranglerToml();
			fs.writeFileSync(
				"dep-1.js",
				dedent`
					import sockets from 'cloudflare:sockets';
					export const external = sockets;
				`
			);
			fs.writeFileSync(
				"dep-2.js",
				dedent`
					export const internal = 100;
				`
			);
			fs.writeFileSync(
				"index.js",
				dedent`
					import {external} from "./dep-1"; // will the external import check be transitive?
					import {internal} from "./dep-2"; // ensure that we can still have a non-external import
					let x = [external, internal]; // to ensure that esbuild doesn't tree shake the imports
					// no default export making this a service worker format
					addEventListener('fetch', (event) => {
						event.respondWith(new Response(''));
					});
			`
			);

			await expect(
				runWrangler("deploy index.js --dry-run").catch((e) =>
					normalizeString(
						esbuild
							.formatMessagesSync(e?.errors ?? [], { kind: "error" })
							.join()
							.trim()
					)
				)
			).resolves.toMatchInlineSnapshot(`
				"X [ERROR] Unexpected external import of \\"cloudflare:sockets\\".
				Your worker has no default export, which means it is assumed to be a Service Worker format Worker.
				Did you mean to create a ES Module format Worker?
				If so, try adding \`export default { ... }\` in your entry-point.
				See https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/. [plugin cloudflare-internal-imports]"
			`);
		});

		it("should error if importing a node.js library when in service worker format", async () => {
			writeWranglerToml();
			fs.writeFileSync(
				"index.js",
				dedent`
					import stream from "node:stream";
					let temp = stream;
					addEventListener('fetch', (event) => {
						event.respondWith(new Response(''));
					});
			`
			);

			await expect(
				runWrangler("deploy index.js --dry-run").catch((e) =>
					normalizeString(
						esbuild
							.formatMessagesSync(e?.errors ?? [], { kind: "error" })
							.join()
							.trim()
					)
				)
			).resolves.toMatchInlineSnapshot(`
				"X [ERROR] Unexpected external import of \\"node:stream\\".
				Your worker has no default export, which means it is assumed to be a Service Worker format Worker.
				Did you mean to create a ES Module format Worker?
				If so, try adding \`export default { ... }\` in your entry-point.
				See https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/. [plugin nodejs_compat-imports]"
			`);
		});

		it("should error if nodejs_compat (v2) is turned on when in service worker format", async () => {
			writeWranglerToml({
				compatibility_date: "2024-09-23", // Sept 23 to turn on nodejs compat v2 mode
				compatibility_flags: ["nodejs_compat"],
			});
			fs.writeFileSync(
				"index.js",
				dedent`
					addEventListener('fetch', (event) => {
						event.respondWith(new Response(''));
					});
			`
			);

			await expect(
				runWrangler("deploy index.js --dry-run").catch((e) =>
					normalizeString(
						esbuild
							.formatMessagesSync(e?.errors ?? [], { kind: "error" })
							.join()
							.trim()
					)
				)
			).resolves.toMatchInlineSnapshot(`
				"X [ERROR] Unexpected external import of \\"node:stream\\" and \\"node:timers/promises\\".
				Your worker has no default export, which means it is assumed to be a Service Worker format Worker.
				Did you mean to create a ES Module format Worker?
				If so, try adding \`export default { ... }\` in your entry-point.
				See https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/. [plugin hybrid-nodejs_compat]"
			`);
		});
	});

	describe("legacy module specifiers", () => {
		it("should work with legacy module specifiers, with a deprecation warning (1)", async () => {
			writeWranglerToml({
				rules: [{ type: "Text", globs: ["**/*.file"], fallthrough: false }],
			});
			fs.writeFileSync(
				"./index.js",
				`import TEXT from 'text.file'; export default {};`
			);
			fs.writeFileSync("./text.file", "SOME TEXT CONTENT");
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedModules: {
					"./2d91d1c4dd6e57d4f5432187ab7c25f45a8973f0-text.file":
						"SOME TEXT CONTENT",
				},
			});
			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`
			"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mDeprecation: detected a legacy module import in \\"./index.js\\". This will stop working in the future. Replace references to \\"text.file\\" with \\"./text.file\\";[0m

			"
		`);
		});

		it("should work with legacy module specifiers, with a deprecation warning (2)", async () => {
			writeWranglerToml();
			fs.writeFileSync(
				"./index.js",
				`import WASM from 'index.wasm'; export default {};`
			);
			fs.writeFileSync("./index.wasm", "SOME WASM CONTENT");
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedModules: {
					"./94b240d0d692281e6467aa42043986e5c7eea034-index.wasm":
						"SOME WASM CONTENT",
				},
			});
			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`
			"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mDeprecation: detected a legacy module import in \\"./index.js\\". This will stop working in the future. Replace references to \\"index.wasm\\" with \\"./index.wasm\\";[0m

			"
		`);
		});

		it("should work with legacy module specifiers, with a deprecation warning (3)", async () => {
			writeWranglerToml({
				rules: [{ type: "Text", globs: ["**/*.file"], fallthrough: false }],
			});
			fs.writeFileSync(
				"./index.js",
				`import TEXT from 'text+name.file'; export default {};`
			);
			fs.writeFileSync("./text+name.file", "SOME TEXT CONTENT");
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedModules: {
					"./2d91d1c4dd6e57d4f5432187ab7c25f45a8973f0-text+name.file":
						"SOME TEXT CONTENT",
				},
			});
			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`
			"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mDeprecation: detected a legacy module import in \\"./index.js\\". This will stop working in the future. Replace references to \\"text+name.file\\" with \\"./text+name.file\\";[0m

			"
		`);
		});

		it("should not match regular module specifiers when there aren't any possible legacy module matches", async () => {
			// see https://github.com/cloudflare/workers-sdk/issues/655 for bug details

			fs.writeFileSync(
				"./index.js",
				`import inner from './inner/index.js'; export default {};`
			);
			fs.mkdirSync("./inner", { recursive: true });
			fs.writeFileSync("./inner/index.js", `export default 123`);
			mockSubDomainRequest();
			mockUploadWorkerRequest();

			await runWrangler(
				"deploy index.js --compatibility-date 2022-03-17 --name test-name"
			);
			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});
	});

	describe("tsconfig", () => {
		it("should use compilerOptions.paths to resolve modules", async () => {
			writeWranglerToml({
				main: "index.ts",
			});
			fs.writeFileSync(
				"index.ts",
				`import { foo } from '~lib/foo'; export default { fetch() { return new Response(foo)} }`
			);
			fs.mkdirSync("lib", { recursive: true });
			fs.writeFileSync("lib/foo.ts", `export const foo = 123;`);
			fs.writeFileSync(
				"tsconfig.json",
				JSON.stringify({
					compilerOptions: {
						baseUrl: ".",
						paths: {
							"~lib/*": ["lib/*"],
						},
					},
				})
			);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedEntry: "var foo = 123;", // make sure it imported the module correctly
			});
			await runWrangler("deploy index.ts");
			expect(std).toMatchInlineSnapshot(`
				Object {
				  "debug": "",
				  "err": "",
				  "info": "",
				  "out": "Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class",
				  "warn": "",
				}
			`);
		});

		it("should output to target es2022 even if tsconfig says otherwise", async () => {
			writeWranglerToml();
			writeWorkerSource();
			fs.writeFileSync(
				"./index.js",
				`
			import { foo } from "./another";
			const topLevelAwait = await new Promise((resolve) => setTimeout(resolve, 0));

			export default {
  			async fetch(request) {

    			return new Response("Hello world!");
  			},
			};`
			);
			fs.writeFileSync(
				"tsconfig.json",
				JSON.stringify({
					compilerOptions: {
						target: "es5",
						module: "commonjs",
					},
				})
			);
			mockSubDomainRequest();
			/**
			 * When we compile with es2022, we should preserve the export statement and top level await
			 * If you attempt to target es2020 top level await will cause a build error
			 * @error Build failed with 1 error:
			 * index.js:3:25: ERROR: Top-level await is not available in the configured target environment ("es2020")
			 */
			mockUploadWorkerRequest({
				expectedEntry: "export {", // check that the export is preserved
			});
			await runWrangler("deploy index.js"); // this would throw if we tried to compile with es5
			expect(std).toMatchInlineSnapshot(`
				Object {
				  "debug": "",
				  "err": "",
				  "info": "",
				  "out": "Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class",
				  "warn": "",
				}
			`);
		});
	});

	describe("--outdir", () => {
		it("should generate built assets at --outdir if specified", async () => {
			writeWranglerToml();
			writeWorkerSource();
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			await runWrangler("deploy index.js --outdir some-dir");
			expect(fs.existsSync("some-dir/index.js")).toBe(true);
			expect(fs.existsSync("some-dir/index.js.map")).toBe(true);
			expect(std).toMatchInlineSnapshot(`
				Object {
				  "debug": "",
				  "err": "",
				  "info": "",
				  "out": "Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class",
				  "warn": "",
				}
			`);
		});

		it("should preserve the entry point file name, even when using a facade", async () => {
			writeWranglerToml();
			writeWorkerSource();
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			const assets = [
				{ filePath: "file-1.txt", content: "Content of file-1" },
				{ filePath: "file-2.txt", content: "Content of file-2" },
			];
			const kvNamespace = {
				title: "__test-name-workers_sites_assets",
				id: "__test-name-workers_sites_assets-id",
			};
			writeAssets(assets);
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, []);
			mockUploadAssetsToKVRequest(kvNamespace.id, assets);
			await runWrangler(
				"deploy index.js --outdir some-dir --legacy-assets assets"
			);
			expect(fs.existsSync("some-dir/index.js")).toBe(true);
			expect(fs.existsSync("some-dir/index.js.map")).toBe(true);
			expect(std.info).toMatchInlineSnapshot(`
				"Fetching list of already uploaded assets...
				Building list of assets to upload...
				 + file-1.2ca234f380.txt (uploading new version of file-1.txt)
				 + file-2.5938485188.txt (uploading new version of file-2.txt)
				Uploading 2 new assets...
				Uploaded 100% [2 out of 2]"
			`);
			expect(std.out).toMatchInlineSnapshot(`
				"↗️  Done syncing assets
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
		});

		it("should copy any module imports related assets to --outdir if specified", async () => {
			writeWranglerToml();
			fs.writeFileSync(
				"./index.js",
				`
import txt from './textfile.txt';
import hello from './hello.wasm';
export default{
  async fetch(){
		const module = await WebAssembly.instantiate(hello);
    return new Response(txt + module.exports.hello);
  }
}
`
			);
			fs.writeFileSync("./textfile.txt", "Hello, World!");
			fs.writeFileSync("./hello.wasm", "Hello wasm World!");
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedModules: {
					"./0a0a9f2a6772942557ab5355d76af442f8f65e01-textfile.txt":
						"Hello, World!",
					"./d025a03cd31e98e96fb5bd5bce87f9bca4e8ce2c-hello.wasm":
						"Hello wasm World!",
				},
			});
			await runWrangler("deploy index.js --outdir some-dir");

			expect(fs.existsSync("some-dir/index.js")).toBe(true);
			expect(fs.existsSync("some-dir/index.js.map")).toBe(true);
			expect(fs.existsSync("some-dir/README.md")).toBe(true);
			expect(
				fs.existsSync(
					"some-dir/0a0a9f2a6772942557ab5355d76af442f8f65e01-textfile.txt"
				)
			).toBe(true);
			expect(
				fs.existsSync(
					"some-dir/d025a03cd31e98e96fb5bd5bce87f9bca4e8ce2c-hello.wasm"
				)
			).toBe(true);
			expect(std).toMatchInlineSnapshot(`
				Object {
				  "debug": "",
				  "err": "",
				  "info": "",
				  "out": "Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class",
				  "warn": "",
				}
			`);
		});
	});

	describe("--dry-run", () => {
		it("should not deploy the worker if --dry-run is specified", async () => {
			writeWranglerToml({
				// add a durable object with migrations
				// to make sure we _don't_ fetch migration status
				durable_objects: {
					bindings: [{ name: "NAME", class_name: "SomeClass" }],
				},
				migrations: [{ tag: "v1", new_classes: ["SomeClass"] }],
			});
			fs.writeFileSync(
				"index.js",
				`export default {
        	async fetch(request) {
          	return new Response('Hello' + foo);
        	},
      	};
				export class SomeClass {};`
			);
			vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "");
			await runWrangler("deploy index.js --dry-run");
			expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "Total Upload: xx KiB / gzip: xx KiB
			Your worker has access to the following bindings:
			- Durable Objects:
			  - NAME: SomeClass
			--dry-run: exiting now.",
			  "warn": "",
			}
		`);
		});
	});

	describe("--node-compat", () => {
		it("should warn when using node compatibility mode", async () => {
			writeWranglerToml();
			writeWorkerSource();
			await runWrangler("deploy index.js --node-compat --dry-run");
			expect(std).toMatchInlineSnapshot(`
				Object {
				  "debug": "",
				  "err": "",
				  "info": "",
				  "out": "Total Upload: xx KiB / gzip: xx KiB
				--dry-run: exiting now.",
				  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mYou are using \`node_compat\`, which is a legacy Node.js compatibility option. Instead, use the \`nodejs_compat\` compatibility flag. This includes the functionality from legacy \`node_compat\` polyfills and natively implemented Node.js APIs. See https://developers.cloudflare.com/workers/runtime-apis/nodejs for more information.[0m

				",
				}
			`);
		});

		it("should recommend node compatibility flag when using node builtins and no node compat is enabled", async () => {
			writeWranglerToml();
			fs.writeFileSync("index.js", "import path from 'path';");

			await expect(
				runWrangler("deploy index.js --dry-run").catch((e) =>
					normalizeString(
						esbuild
							.formatMessagesSync(e?.errors ?? [], { kind: "error" })
							.join()
							.trim()
					)
				)
			).resolves.toMatchInlineSnapshot(`
				"X [ERROR] Could not resolve \\"path\\"

				    index.js:1:17:
				      1 │ import path from 'path';
				        ╵                  ~~~~~~

				  The package \\"path\\" wasn't found on the file system but is built into node.
				  - Add the \\"nodejs_compat\\" compatibility flag to your project."
			`);
		});

		it("should recommend node compatibility flag when using node builtins and node compat is set only to nodejs_als", async () => {
			writeWranglerToml({
				compatibility_flags: ["nodejs_als"],
			});
			fs.writeFileSync("index.js", "import path from 'path';");

			await expect(
				runWrangler("deploy index.js --dry-run").catch((e) =>
					normalizeString(
						esbuild
							.formatMessagesSync(e?.errors ?? [], { kind: "error" })
							.join()
							.trim()
					)
				)
			).resolves.toMatchInlineSnapshot(`
				"X [ERROR] Could not resolve \\"path\\"

				    index.js:1:17:
				      1 │ import path from 'path';
				        ╵                  ~~~~~~

				  The package \\"path\\" wasn't found on the file system but is built into node.
				  - Add the \\"nodejs_compat\\" compatibility flag to your project."
			`);
		});

		it("should recommend node compatibility flag when using node builtins and `node_compat` is true", async () => {
			writeWranglerToml({
				node_compat: true,
			});
			fs.writeFileSync("index.js", "import fs from 'diagnostics_channel';");

			await expect(
				runWrangler("deploy index.js --dry-run").catch((e) =>
					normalizeString(
						esbuild
							.formatMessagesSync(e?.errors ?? [], { kind: "error" })
							.join()
							.trim()
					)
				)
			).resolves.toMatchInlineSnapshot(`
				"X [ERROR] Could not resolve \\"diagnostics_channel\\"

				    index.js:1:15:
				      1 │ import fs from 'diagnostics_channel';
				        ╵                ~~~~~~~~~~~~~~~~~~~~~

				  The package \\"diagnostics_channel\\" wasn't found on the file system but is built into node.
				  - Try removing the legacy \\"node_compat\\" setting and add the \\"nodejs_compat\\" compatibility flag in your project"
			`);
		});

		it("should recommend updating the compatibility date when using node builtins and the `nodejs_compat` flag", async () => {
			writeWranglerToml({
				compatibility_date: "2024-09-01", // older than Sept 23rd, 2024
				compatibility_flags: ["nodejs_compat"],
			});
			fs.writeFileSync("index.js", "import fs from 'path';");

			await expect(
				runWrangler("deploy index.js --dry-run").catch((e) =>
					normalizeString(
						esbuild
							.formatMessagesSync(e?.errors ?? [], { kind: "error" })
							.join()
							.trim()
					)
				)
			).resolves.toMatchInlineSnapshot(`
				"X [ERROR] Could not resolve \\"path\\"

				    index.js:1:15:
				      1 │ import fs from 'path';
				        ╵                ~~~~~~

				  The package \\"path\\" wasn't found on the file system but is built into node.
				  - Make sure to prefix the module name with \\"node:\\" or update your compatibility_date to 2024-09-23 or later."
			`);
		});

		it("should recommend updating the compatibility date flag when using no_nodejs_compat and non-prefixed node builtins", async () => {
			writeWranglerToml({
				compatibility_date: "2024-09-23",
				compatibility_flags: ["nodejs_compat", "no_nodejs_compat_v2"],
			});
			fs.writeFileSync("index.js", "import fs from 'path';");

			await expect(
				runWrangler("deploy index.js --dry-run").catch((e) =>
					normalizeString(
						esbuild
							.formatMessagesSync(e?.errors ?? [], { kind: "error" })
							.join()
							.trim()
					)
				)
			).resolves.toMatchInlineSnapshot(`
				"X [ERROR] Could not resolve \\"path\\"

				    index.js:1:15:
				      1 │ import fs from 'path';
				        ╵                ~~~~~~

				  The package \\"path\\" wasn't found on the file system but is built into node.
				  - Make sure to prefix the module name with \\"node:\\" or update your compatibility_date to 2024-09-23 or later."
			`);
		});

		it("should polyfill node builtins when enabled", async () => {
			writeWranglerToml();
			fs.writeFileSync(
				"index.js",
				`
      import path from 'path';
      console.log(path.join("some/path/to", "a/file.txt"));
      export default {}
      `
			);
			await runWrangler("deploy index.js --node-compat --dry-run"); // this would throw if node compatibility didn't exist
			expect(std).toMatchInlineSnapshot(`
				Object {
				  "debug": "",
				  "err": "",
				  "info": "",
				  "out": "Total Upload: xx KiB / gzip: xx KiB
				--dry-run: exiting now.",
				  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mYou are using \`node_compat\`, which is a legacy Node.js compatibility option. Instead, use the \`nodejs_compat\` compatibility flag. This includes the functionality from legacy \`node_compat\` polyfills and natively implemented Node.js APIs. See https://developers.cloudflare.com/workers/runtime-apis/nodejs for more information.[0m

				",
				}
			`);
		});
	});

	describe("`nodejs_compat` compatibility flag", () => {
		it('when absent, should warn on any "external" `node:*` imports', async () => {
			writeWranglerToml();
			fs.writeFileSync(
				"index.js",
				`
      import AsyncHooks from 'node:async_hooks';
      console.log(AsyncHooks);
      export default {}
      `
			);
			await runWrangler("deploy index.js --dry-run");

			expect(std.warn).toMatchInlineSnapshot(`
			"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe package \\"node:async_hooks\\" wasn't found on the file system but is built into node.[0m

			  Your Worker may throw errors at runtime unless you enable the \\"nodejs_compat\\" compatibility flag.
			  Refer to [4mhttps://developers.cloudflare.com/workers/runtime-apis/nodejs/[0m for more details. Imported
			  from:
			   - index.js

			"
		`);
		});

		it('when present, should support "external" `node:*` imports', async () => {
			writeWranglerToml();
			fs.writeFileSync(
				"index.js",
				`
      import path from 'node:path';
      console.log(path);
      export default {}
      `
			);

			await runWrangler(
				"deploy index.js --dry-run --outdir=dist --compatibility-flag=nodejs_compat"
			);

			expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "Total Upload: xx KiB / gzip: xx KiB
			--dry-run: exiting now.",
			  "warn": "",
			}
		`);
			expect(fs.readFileSync("dist/index.js", { encoding: "utf-8" })).toContain(
				`import path from "node:path";`
			);
		});

		it(`when present, and compat date is on or after 2024-09-23, should support "external" non-prefixed node imports`, async () => {
			writeWranglerToml({
				compatibility_date: "2024-09-23",
			});
			fs.writeFileSync(
				"index.js",
				`
      import path from 'path';
      console.log(path);
      export default {}
      `
			);

			await runWrangler(
				"deploy index.js --dry-run --outdir=dist --compatibility-flag=nodejs_compat"
			);

			expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "Total Upload: xx KiB / gzip: xx KiB
			--dry-run: exiting now.",
			  "warn": "",
			}
		`);
			expect(fs.readFileSync("dist/index.js", { encoding: "utf-8" })).toContain(
				`import path from "path";`
			);
		});

		it("should conflict with the --node-compat option", async () => {
			writeWranglerToml();
			fs.writeFileSync(
				"index.js",
				`
      import AsyncHooks from 'node:async_hooks';
      console.log(AsyncHooks);
      export default {}
      `
			);

			await expect(
				runWrangler(
					"deploy index.js --dry-run --outdir=dist --compatibility-flag=nodejs_compat --node-compat"
				)
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: The \`nodejs_compat\` compatibility flag cannot be used in conjunction with the legacy \`--node-compat\` flag. If you want to use the Workers \`nodejs_compat\` compatibility flag, please remove the \`--node-compat\` argument from your CLI command or \`node_compat = true\` from your config file.]`
			);
		});
	});

	describe("bundle reporter", () => {
		it("should print the bundle size", async () => {
			fs.writeFileSync(
				"./text.txt",
				`${new Array(100)
					.fill("Try not. Do or do not. There is no try.")
					.join("")}`
			);

			fs.writeFileSync(
				"./hello.html",
				`<!DOCTYPE html>
      <html>
        <body>
            <h2>Hello World!</h2>
        </body>
      </html>
      `
			);

			fs.writeFileSync(
				"index.js",
				`import hello from "./hello.html";
         import text from "./text.txt";
        export default {
          async fetch(request) {
            return new Response(json.stringify({ hello, text }));
        },
      };`
			);
			writeWranglerToml({
				main: "index.js",
			});
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			await runWrangler("deploy");

			expect(std).toMatchInlineSnapshot(`
				Object {
				  "debug": "",
				  "err": "",
				  "info": "",
				  "out": "Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class",
				  "warn": "",
				}
			`);
		});

		it("should print the bundle size, with API errors", async () => {
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			// Override PUT call to error out from previous helper functions
			msw.use(
				http.post(
					"*/accounts/:accountId/workers/scripts/:scriptName/versions",
					() => {
						return HttpResponse.json(
							createFetchResult(null, false, [
								{
									code: 11337,
									message:
										"Worker Startup Timed out. This could be due to script exceeding size limits or expensive code in the global scope.",
								},
							])
						);
					}
				)
			);

			fs.writeFileSync(
				"./hello.html",
				`<!DOCTYPE html>
      <html>
        <body>
            <h2>Hello World!</h2>
        </body>
      </html>
      `
			);

			fs.writeFileSync(
				"index.js",
				`import hello from "./hello.html";
        export default {
          async fetch(request) {
            return new Response(json.stringify({ hello }));
        },
      };`
			);

			writeWranglerToml({
				main: "index.js",
			});

			await expect(runWrangler("deploy")).rejects.toMatchInlineSnapshot(
				`[APIError: A request to the Cloudflare API (/accounts/some-account-id/workers/scripts/test-name/versions) failed.]`
			);
			expect(std).toMatchInlineSnapshot(`
				Object {
				  "debug": "",
				  "err": "",
				  "info": "",
				  "out": "Total Upload: xx KiB / gzip: xx KiB

				[31mX [41;31m[[41;97mERROR[41;31m][0m [1mA request to the Cloudflare API (/accounts/some-account-id/workers/scripts/test-name/versions) failed.[0m

				  Worker Startup Timed out. This could be due to script exceeding size limits or expensive code in
				  the global scope. [code: 11337]

				  If you think this is a bug, please open an issue at:
				  [4mhttps://github.com/cloudflare/workers-sdk/issues/new/choose[0m

				",
				  "warn": "",
				}
			`);
		});

		test("should check biggest dependencies when upload fails with script size error", async () => {
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			// Override POST call to error out from previous helper functions
			msw.use(
				http.post(
					"*/accounts/:accountId/workers/scripts/:scriptName/versions",
					() => {
						return HttpResponse.json(
							createFetchResult({}, false, [
								{
									code: 10027,
									message: "workers.api.error.script_too_large",
								},
							])
						);
					}
				)
			);

			fs.writeFileSync(
				"add.wasm",
				"AGFzbQEAAAABBwFgAn9/AX8DAgEABwcBA2FkZAAACgkBBwAgACABagsACgRuYW1lAgMBAAA=",
				"base64"
			);
			fs.writeFileSync("message.txt", "👋");
			fs.writeFileSync("dependency.js", `export const thing = "a string dep";`);

			fs.writeFileSync(
				"index.js",
				`
				import addModule from "./add.wasm";
				import message from "./message.txt";
				import { thing } from "./dependency";

        export default {
          async fetch() {
          	const instance = new WebAssembly.Instance(addModule);
          	return Response.json({ add: instance.exports.add(1, 2), message, thing });
          }
        }`
			);

			writeWranglerToml({
				main: "index.js",
			});

			await expect(runWrangler("deploy")).rejects.toMatchInlineSnapshot(
				`[APIError: A request to the Cloudflare API (/accounts/some-account-id/workers/scripts/test-name/versions) failed.]`
			);

			expect(std).toMatchInlineSnapshot(`
				Object {
				  "debug": "",
				  "err": "",
				  "info": "",
				  "out": "Total Upload: xx KiB / gzip: xx KiB

				[31mX [41;31m[[41;97mERROR[41;31m][0m [1mA request to the Cloudflare API (/accounts/some-account-id/workers/scripts/test-name/versions) failed.[0m

				  workers.api.error.script_too_large [code: 10027]

				  If you think this is a bug, please open an issue at:
				  [4mhttps://github.com/cloudflare/workers-sdk/issues/new/choose[0m

				",
				  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mHere are the 4 largest dependencies included in your script:[0m

				  - index.js - xx KiB
				  - add.wasm - xx KiB
				  - dependency.js - xx KiB
				  - message.txt - xx KiB
				  If these are unnecessary, consider removing them

				",
				}
			`);
		});

		test("should offer some helpful advice when upload fails with script startup error", async () => {
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			// Override POST call to error out from previous helper functions
			msw.use(
				http.post(
					"*/accounts/:accountId/workers/scripts/:scriptName/versions",
					() => {
						return HttpResponse.json(
							createFetchResult({}, false, [
								{
									code: 10021,
									message: "Error: Script startup exceeded CPU time limit.",
								},
							])
						);
					}
				)
			);
			fs.writeFileSync("dependency.js", `export const thing = "a string dep";`);

			fs.writeFileSync(
				"index.js",
				`import { thing } from "./dependency";

        export default {
          async fetch() {
            return new Response('response plus ' + thing);
          }
        }`
			);

			writeWranglerToml({
				main: "index.js",
			});

			await expect(runWrangler("deploy")).rejects.toMatchInlineSnapshot(
				`[APIError: A request to the Cloudflare API (/accounts/some-account-id/workers/scripts/test-name/versions) failed.]`
			);
			expect(std).toMatchInlineSnapshot(`
				Object {
				  "debug": "",
				  "err": "",
				  "info": "",
				  "out": "Total Upload: xx KiB / gzip: xx KiB

				[31mX [41;31m[[41;97mERROR[41;31m][0m [1mA request to the Cloudflare API (/accounts/some-account-id/workers/scripts/test-name/versions) failed.[0m

				  Error: Script startup exceeded CPU time limit. [code: 10021]

				  If you think this is a bug, please open an issue at:
				  [4mhttps://github.com/cloudflare/workers-sdk/issues/new/choose[0m

				",
				  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mYour Worker failed validation because it exceeded startup limits.[0m

				  To ensure fast responses, we place constraints on Worker startup -- like how much CPU it can use,
				  or how long it can take.
				  Your Worker failed validation, which means it hit one of these startup limits.
				  Try reducing the amount of work done during startup (outside the event handler), either by
				  removing code or relocating it inside the event handler.

				",
				}
			`);
		});

		describe("unit tests", () => {
			// keeping these as unit tests to try and keep them snappy, as they often deal with
			// big files that would take a while to deal with in a full wrangler test

			test("should print the bundle size", async () => {
				const bigModule = Buffer.alloc(10_000_000);
				randomFillSync(bigModule);
				await printBundleSize({ name: "index.js", content: "" }, [
					{
						name: "index.js",
						filePath: undefined,
						content: bigModule,
						type: "buffer",
					},
				]);

				expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "Total Upload: xx KiB / gzip: xx KiB",
			  "warn": "",
			}
		`);
			});

			test("should print the top biggest dependencies in the bundle when upload fails", () => {
				const deps = {
					"node_modules/a-mod/module.js": { bytesInOutput: 450 },
					"node_modules/b-mod/module.js": { bytesInOutput: 10 },
					"node_modules/c-mod/module.js": { bytesInOutput: 200 },
					"node_modules/d-mod/module.js": { bytesInOutput: 2111200 }, // 1
					"node_modules/e-mod/module.js": { bytesInOutput: 8209 }, // 3
					"node_modules/f-mod/module.js": { bytesInOutput: 770 },
					"node_modules/g-mod/module.js": { bytesInOutput: 78902 }, // 2
					"node_modules/h-mod/module.js": { bytesInOutput: 899 },
					"node_modules/i-mod/module.js": { bytesInOutput: 2001 }, // 4
					"node_modules/j-mod/module.js": { bytesInOutput: 900 }, // 5
					"node_modules/k-mod/module.js": { bytesInOutput: 79 },
				};

				printOffendingDependencies(deps);
				expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mHere are the 5 largest dependencies included in your script:[0m

			  - node_modules/d-mod/module.js - xx KiB
			  - node_modules/g-mod/module.js - xx KiB
			  - node_modules/e-mod/module.js - xx KiB
			  - node_modules/i-mod/module.js - xx KiB
			  - node_modules/j-mod/module.js - xx KiB
			  If these are unnecessary, consider removing them

			",
			}
		`);
			});
		});
	});

	describe("--no-bundle", () => {
		it("(cli) should not transform the source code before publishing it", async () => {
			writeWranglerToml();
			const scriptContent = `
      import X from '@cloudflare/no-such-package'; // let's add an import that doesn't exist
      const xyz = 123; // a statement that would otherwise be compiled out
    `;
			fs.writeFileSync("index.js", scriptContent);
			await runWrangler("deploy index.js --no-bundle --dry-run --outdir dist");
			expect(fs.readFileSync("dist/index.js", "utf-8")).toMatch(scriptContent);
		});

		it("(config) should not transform the source code before publishing it", async () => {
			writeWranglerToml({
				no_bundle: true,
			});
			const scriptContent = `
			import X from '@cloudflare/no-such-package'; // let's add an import that doesn't exist
			const xyz = 123; // a statement that would otherwise be compiled out
		`;
			fs.writeFileSync("index.js", scriptContent);
			await runWrangler("deploy index.js --dry-run --outdir dist");
			expect(fs.readFileSync("dist/index.js", "utf-8")).toMatch(scriptContent);
		});
	});

	describe("--no-bundle --minify", () => {
		it("should warn that no-bundle and minify can't be used together", async () => {
			writeWranglerToml();
			const scriptContent = `
			const xyz = 123; // a statement that would otherwise be compiled out
		`;
			fs.writeFileSync("index.js", scriptContent);
			await runWrangler(
				"deploy index.js --no-bundle --minify --dry-run --outdir dist"
			);
			expect(std.warn).toMatchInlineSnapshot(`
			"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1m\`--minify\` and \`--no-bundle\` can't be used together. If you want to minify your Worker and disable Wrangler's bundling, please minify as part of your own bundling process.[0m

			"
		`);
		});

		it("should warn that no-bundle and minify can't be used together", async () => {
			writeWranglerToml({
				no_bundle: true,
				minify: true,
			});
			const scriptContent = `
			const xyz = 123; // a statement that would otherwise be compiled out
		`;
			fs.writeFileSync("index.js", scriptContent);
			await runWrangler("deploy index.js --dry-run --outdir dist");
			expect(std.warn).toMatchInlineSnapshot(`
			"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1m\`--minify\` and \`--no-bundle\` can't be used together. If you want to minify your Worker and disable Wrangler's bundling, please minify as part of your own bundling process.[0m

			"
		`);
		});
	});

	describe("--no-bundle --node-compat", () => {
		it("should warn that no-bundle and node-compat can't be used together", async () => {
			writeWranglerToml();
			const scriptContent = `
			const xyz = 123; // a statement that would otherwise be compiled out
		`;
			fs.writeFileSync("index.js", scriptContent);
			await runWrangler(
				"deploy index.js --no-bundle --node-compat --dry-run --outdir dist"
			);
			expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1m\`--node-compat\` and \`--no-bundle\` can't be used together. If you want to polyfill Node.js built-ins and disable Wrangler's bundling, please polyfill as part of your own bundling process.[0m


				[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mYou are using \`node_compat\`, which is a legacy Node.js compatibility option. Instead, use the \`nodejs_compat\` compatibility flag. This includes the functionality from legacy \`node_compat\` polyfills and natively implemented Node.js APIs. See https://developers.cloudflare.com/workers/runtime-apis/nodejs for more information.[0m

				"
			`);
		});

		it("should warn that no-bundle and node-compat can't be used together", async () => {
			writeWranglerToml({
				no_bundle: true,
				node_compat: true,
			});
			const scriptContent = `
			const xyz = 123; // a statement that would otherwise be compiled out
		`;
			fs.writeFileSync("index.js", scriptContent);
			await runWrangler("deploy index.js --dry-run --outdir dist");
			expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1m\`--node-compat\` and \`--no-bundle\` can't be used together. If you want to polyfill Node.js built-ins and disable Wrangler's bundling, please polyfill as part of your own bundling process.[0m


				[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mYou are using \`node_compat\`, which is a legacy Node.js compatibility option. Instead, use the \`nodejs_compat\` compatibility flag. This includes the functionality from legacy \`node_compat\` polyfills and natively implemented Node.js APIs. See https://developers.cloudflare.com/workers/runtime-apis/nodejs for more information.[0m

				"
			`);
		});
	});

	describe("queues", () => {
		const queueId = "queue-id";
		const queueName = "queue1";
		it("should upload producer bindings", async () => {
			writeWranglerToml({
				queues: {
					producers: [{ binding: "QUEUE_ONE", queue: "queue1" }],
				},
			});
			await fs.promises.writeFile("index.js", `export default {};`);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedBindings: [
					{
						type: "queue",
						name: "QUEUE_ONE",
						queue_name: queueName,
					},
				],
			});
			const existingQueue = {
				queue_id: queueId,
				queue_name: queueName,
				created_on: "",
				producers: [],
				consumers: [],
				producers_total_count: 1,
				consumers_total_count: 0,
				modified_on: "",
			};
			mockGetQueueByName(queueName, existingQueue);
			mockPutQueueById(queueId, {
				queue_name: queueName,
				settings: {},
			});

			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Your worker has access to the following bindings:
				- Queues:
				  - QUEUE_ONE: queue1
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				  Producer for queue1
				Current Version ID: Galaxy-Class"
			`);
		});

		it("should update queue producers on deploy", async () => {
			writeWranglerToml({
				queues: {
					producers: [
						{
							queue: queueName,
							binding: "MY_QUEUE",
							delivery_delay: 10,
						},
					],
				},
			});
			await fs.promises.writeFile("index.js", `export default {};`);
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			const existingQueue = {
				queue_id: queueId,
				queue_name: queueName,
				created_on: "",
				producers: [],
				consumers: [],
				producers_total_count: 1,
				consumers_total_count: 0,
				modified_on: "",
			};
			mockGetQueueByName(queueName, existingQueue);
			mockPutQueueById(queueId, {
				queue_name: queueName,
				settings: {
					delivery_delay: 10,
				},
			});
			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Your worker has access to the following bindings:
				- Queues:
				  - MY_QUEUE: queue1
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				  Producer for queue1
				Current Version ID: Galaxy-Class"
			`);
		});

		it("should post worker queue consumers on deploy", async () => {
			writeWranglerToml({
				queues: {
					consumers: [
						{
							queue: queueName,
							dead_letter_queue: "myDLQ",
							max_batch_size: 5,
							max_batch_timeout: 3,
							max_retries: 10,
							retry_delay: 5,
						},
					],
				},
			});
			await fs.promises.writeFile("index.js", `export default {};`);
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			const existingQueue: QueueResponse = {
				queue_id: queueId,
				queue_name: queueName,
				created_on: "",
				producers: [],
				consumers: [],
				producers_total_count: 0,
				consumers_total_count: 0,
				modified_on: "",
			};
			mockGetQueueByName(queueName, existingQueue);
			mockPostConsumerById(queueId, {
				dead_letter_queue: "myDLQ",
				type: "worker",
				script_name: "test-name",
				settings: {
					batch_size: 5,
					max_retries: 10,
					max_wait_time_ms: 3000,
					retry_delay: 5,
				},
			});
			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				  Consumer for queue1
				Current Version ID: Galaxy-Class"
			`);
		});

		it("should post worker queue consumers on deploy, using command line script name arg", async () => {
			const expectedScriptName = "command-line-arg-script-name";
			writeWranglerToml({
				queues: {
					consumers: [
						{
							queue: queueName,
							dead_letter_queue: "myDLQ",
							max_batch_size: 5,
							max_batch_timeout: 3,
							max_retries: 10,
							retry_delay: 5,
						},
					],
				},
			});
			await fs.promises.writeFile("index.js", `export default {};`);
			mockSubDomainRequest();
			mockUploadWorkerRequest({ expectedScriptName });
			const existingQueue: QueueResponse = {
				queue_id: queueId,
				queue_name: queueName,
				created_on: "",
				producers: [],
				consumers: [],
				producers_total_count: 0,
				consumers_total_count: 0,
				modified_on: "",
			};
			mockGetQueueByName(queueName, existingQueue);
			mockPostConsumerById(queueId, {
				dead_letter_queue: "myDLQ",
				type: "worker",
				script_name: expectedScriptName,
				settings: {
					batch_size: 5,
					max_retries: 10,
					max_wait_time_ms: 3000,
					retry_delay: 5,
				},
			});
			await runWrangler(`deploy index.js --name ${expectedScriptName}`);
			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded command-line-arg-script-name (TIMINGS)
				Deployed command-line-arg-script-name triggers (TIMINGS)
				  https://command-line-arg-script-name.test-sub-domain.workers.dev
				  Consumer for queue1
				Current Version ID: Galaxy-Class"
			`);
		});

		it("should update worker queue consumers on deploy", async () => {
			writeWranglerToml({
				queues: {
					consumers: [
						{
							queue: queueName,
							dead_letter_queue: "myDLQ",
							max_batch_size: 5,
							max_batch_timeout: 3,
							max_retries: 10,
							retry_delay: 5,
						},
					],
				},
			});
			await fs.promises.writeFile("index.js", `export default {};`);
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			const expectedConsumerId = "consumerId";
			const existingQueue: QueueResponse = {
				queue_id: queueId,
				queue_name: queueName,
				created_on: "",
				producers: [],
				consumers: [
					{
						script: "test-name",
						consumer_id: expectedConsumerId,
						type: "worker",
						settings: {},
					},
				],
				producers_total_count: 1,
				consumers_total_count: 1,
				modified_on: "",
			};
			mockGetQueueByName(queueName, existingQueue);
			mockPutQueueConsumerById(queueId, queueName, expectedConsumerId, {
				dead_letter_queue: "myDLQ",
				type: "worker",
				script_name: "test-name",
				settings: {
					batch_size: 5,
					max_retries: 10,
					max_wait_time_ms: 3000,
					retry_delay: 5,
				},
			});
			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				  Consumer for queue1
				Current Version ID: Galaxy-Class"
			`);
		});

		it("should update worker (service) queue consumers with default environment on deploy", async () => {
			writeWranglerToml({
				queues: {
					consumers: [
						{
							queue: queueName,
							dead_letter_queue: "myDLQ",
							max_batch_size: 5,
							max_batch_timeout: 3,
							max_retries: 10,
							retry_delay: 5,
						},
					],
				},
			});
			await fs.promises.writeFile("index.js", `export default {};`);
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			const expectedConsumerId = "consumerId";
			const expectedConsumerName = "test-name";
			const expectedEnvironment = "production";
			const existingQueue: QueueResponse = {
				queue_id: queueId,
				queue_name: queueName,
				created_on: "",
				producers: [],
				consumers: [
					{
						service: expectedConsumerName,
						environment: "production",
						consumer_id: expectedConsumerId,
						type: "worker",
						settings: {},
					},
				],
				producers_total_count: 1,
				consumers_total_count: 1,
				modified_on: "",
			};
			mockGetQueueByName(queueName, existingQueue);
			mockGetServiceByName(expectedConsumerName, expectedEnvironment);
			mockPutQueueConsumerById(queueId, queueName, expectedConsumerId, {
				dead_letter_queue: "myDLQ",
				type: "worker",
				script_name: "test-name",
				settings: {
					batch_size: 5,
					max_retries: 10,
					max_wait_time_ms: 3000,
					retry_delay: 5,
				},
			});

			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				  Consumer for queue1
				Current Version ID: Galaxy-Class"
			`);
		});

		it("should post queue http consumers on deploy", async () => {
			writeWranglerToml({
				queues: {
					consumers: [
						{
							queue: queueName,
							type: "http_pull",
							dead_letter_queue: "myDLQ",
							max_batch_size: 5,
							visibility_timeout_ms: 4000,
							max_retries: 10,
							retry_delay: 1,
						},
					],
				},
			});
			await fs.promises.writeFile("index.js", `export default {};`);
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			const existingQueue: QueueResponse = {
				queue_id: queueId,
				queue_name: queueName,
				created_on: "",
				producers: [],
				consumers: [],
				producers_total_count: 0,
				consumers_total_count: 0,
				modified_on: "",
			};
			mockGetQueueByName(queueName, existingQueue);
			mockPostQueueHTTPConsumer(queueId, {
				type: "http_pull",
				dead_letter_queue: "myDLQ",
				settings: {
					batch_size: 5,
					max_retries: 10,
					visibility_timeout_ms: 4000,
					retry_delay: 1,
				},
			});
			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				  Consumer for queue1
				Current Version ID: Galaxy-Class"
			`);
		});

		it("should update queue http consumers when one already exists for queue", async () => {
			writeWranglerToml({
				queues: {
					consumers: [
						{
							queue: queueName,
							type: "http_pull",
						},
					],
				},
			});
			await fs.promises.writeFile("index.js", `export default {};`);
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			const existingQueue: QueueResponse = {
				queue_id: queueId,
				queue_name: queueName,
				created_on: "",
				producers: [],
				consumers: [
					{
						type: "http_pull",
						consumer_id: "queue1-consumer-id",
						settings: {},
					},
				],
				producers_total_count: 0,
				consumers_total_count: 0,
				modified_on: "",
			};
			mockGetQueueByName(queueName, existingQueue);

			msw.use(
				http.put(
					`*/accounts/:accountId/queues/:queueId/consumers/:consumerId`,
					async ({ params }) => {
						expect(params.queueId).toEqual(queueId);
						expect(params.consumerId).toEqual("queue1-consumer-id");
						expect(params.accountId).toEqual("some-account-id");
						return HttpResponse.json({
							success: true,
							errors: [],
							messages: [],
							result: null,
						});
					}
				)
			);
			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				  Consumer for queue1
				Current Version ID: Galaxy-Class"
			`);
		});

		it("should support queue consumer concurrency with a max concurrency specified", async () => {
			writeWranglerToml({
				queues: {
					consumers: [
						{
							queue: queueName,
							dead_letter_queue: "myDLQ",
							max_batch_size: 5,
							max_batch_timeout: 3,
							max_retries: 10,
							max_concurrency: 5,
						},
					],
				},
			});
			await fs.promises.writeFile("index.js", `export default {};`);
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			const consumerId = "consumer-id";
			const existingQueue: QueueResponse = {
				queue_id: queueId,
				queue_name: queueName,
				created_on: "",
				producers: [],
				consumers: [
					{
						type: "worker",
						script: "test-name",
						consumer_id: consumerId,
						settings: {},
					},
				],
				producers_total_count: 0,
				consumers_total_count: 0,
				modified_on: "",
			};
			mockGetQueueByName(queueName, existingQueue);
			mockPutQueueConsumerById(queueId, queueName, consumerId, {
				dead_letter_queue: "myDLQ",
				type: "worker",
				script_name: "test-name",
				settings: {
					batch_size: 5,
					max_retries: 10,
					max_wait_time_ms: 3000,
					max_concurrency: 5,
				},
			});
			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				  Consumer for queue1
				Current Version ID: Galaxy-Class"
			`);
		});

		it("should support queue consumer concurrency with a null max concurrency", async () => {
			writeWranglerToml({
				queues: {
					consumers: [
						{
							queue: queueName,
							dead_letter_queue: "myDLQ",
							max_batch_size: 5,
							max_batch_timeout: 3,
							max_retries: 10,
							max_concurrency: null,
						},
					],
				},
			});
			await fs.promises.writeFile("index.js", `export default {};`);
			mockSubDomainRequest();
			mockUploadWorkerRequest();

			const consumerId = "consumer-id";
			const existingQueue: QueueResponse = {
				queue_id: queueId,
				queue_name: queueName,
				created_on: "",
				producers: [],
				consumers: [
					{
						type: "worker",
						script: "test-name",
						consumer_id: consumerId,
						settings: {},
					},
				],
				producers_total_count: 0,
				consumers_total_count: 0,
				modified_on: "",
			};
			mockGetQueueByName(queueName, existingQueue);
			mockPutQueueConsumerById(queueId, queueName, consumerId, {
				dead_letter_queue: "myDLQ",
				type: "worker",
				script_name: "test-name",
				settings: {
					batch_size: 5,
					max_retries: 10,
					max_wait_time_ms: 3000,
				},
			});

			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				  Consumer for queue1
				Current Version ID: Galaxy-Class"
			`);
		});

		it("should support queue consumer with max_batch_timeout of 0", async () => {
			writeWranglerToml({
				queues: {
					consumers: [
						{
							queue: queueName,
							dead_letter_queue: "myDLQ",
							max_batch_size: 5,
							max_batch_timeout: 0,
							max_retries: 10,
							max_concurrency: null,
						},
					],
				},
			});
			await fs.promises.writeFile("index.js", `export default {};`);
			mockSubDomainRequest();
			mockUploadWorkerRequest();

			const consumerId = "consumer-id";
			const existingQueue: QueueResponse = {
				queue_id: queueId,
				queue_name: queueName,
				created_on: "",
				producers: [],
				consumers: [
					{
						type: "worker",
						script: "test-name",
						consumer_id: consumerId,
						settings: {},
					},
				],
				producers_total_count: 0,
				consumers_total_count: 0,
				modified_on: "",
			};
			mockGetQueueByName(queueName, existingQueue);
			mockPutQueueConsumerById(queueId, queueName, consumerId, {
				dead_letter_queue: "myDLQ",
				type: "worker",
				script_name: "test-name",
				settings: {
					batch_size: 5,
					max_retries: 10,
					max_wait_time_ms: 0,
				},
			});

			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				  Consumer for queue1
				Current Version ID: Galaxy-Class"
			`);
		});

		it("consumer should error when a queue doesn't exist", async () => {
			writeWranglerToml({
				queues: {
					producers: [],
					consumers: [
						{
							queue: queueName,
							dead_letter_queue: "myDLQ",
							max_batch_size: 5,
							max_batch_timeout: 3,
							max_retries: 10,
						},
					],
				},
			});
			await fs.promises.writeFile("index.js", `export default {};`);
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			mockGetQueueByName(queueName, null);

			await expect(
				runWrangler("deploy index.js")
			).rejects.toMatchInlineSnapshot(
				`[Error: Queue "queue1" does not exist. To create it, run: wrangler queues create queue1]`
			);
		});

		it("producer should error when a queue doesn't exist", async () => {
			writeWranglerToml({
				queues: {
					producers: [{ queue: queueName, binding: "QUEUE_ONE" }],
					consumers: [],
				},
			});
			await fs.promises.writeFile("index.js", `export default {};`);
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			mockGetQueueByName(queueName, null);

			await expect(
				runWrangler("deploy index.js")
			).rejects.toMatchInlineSnapshot(
				`[Error: Queue "queue1" does not exist. To create it, run: wrangler queues create queue1]`
			);
		});
	});

	describe("source maps", () => {
		it("should include source map with bundle when upload_source_maps = true", async () => {
			writeWranglerToml({
				main: "index.ts",
				upload_source_maps: true,
			});
			writeWorkerSource({ format: "ts" });

			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedMainModule: "index.js",
				expectedModules: {
					"index.js.map": expect.stringMatching(
						/"sources":\["another.ts","index.ts"\],"sourceRoot":"".*"file":"index.js"/
					),
				},
			});

			await runWrangler("deploy");
		});

		it("should not include source map with bundle when upload_source_maps = false", async () => {
			writeWranglerToml({
				main: "index.ts",
				upload_source_maps: false,
			});
			writeWorkerSource({ format: "ts" });

			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedMainModule: "index.js",
				expectedModules: {
					"index.js.map": null,
				},
			});

			await runWrangler("deploy");
		});

		it("should include source maps emitted by custom build when upload_source_maps = true", async () => {
			writeWranglerToml({
				no_bundle: true,
				main: "index.js",
				upload_source_maps: true,
				build: {
					command: `echo "custom build script"`,
				},
			});
			fs.writeFileSync(
				"index.js",
				`export default { fetch() { return new Response("Hello World"); } }\n` +
					"//# sourceMappingURL=index.js.map"
			);
			fs.writeFileSync(
				"index.js.map",
				JSON.stringify({
					version: 3,
					sources: ["index.ts"],
					sourceRoot: "",
					file: "index.js",
				})
			);

			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedMainModule: "index.js",
				expectedModules: {
					"index.js.map": expect.stringMatching(
						/"sources":\["index.ts"\],"sourceRoot":"".*"file":"index.js"/
					),
				},
			});

			await runWrangler("deploy");
		});

		it("should not include source maps emitted by custom build when upload_source_maps = false", async () => {
			writeWranglerToml({
				no_bundle: true,
				main: "index.js",
				upload_source_maps: false,
				build: {
					command: `echo "custom build script"`,
				},
			});
			fs.writeFileSync(
				"index.js",
				`export default { fetch() { return new Response("Hello World"); } }\n` +
					"//# sourceMappingURL=index.js.map"
			);
			fs.writeFileSync(
				"index.js.map",
				JSON.stringify({
					version: 3,
					file: "index.js",
					sources: ["index.ts"],
					sourceRoot: "",
				})
			);

			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedMainModule: "index.js",
				expectedModules: {
					"index.js.map": null,
				},
			});

			await runWrangler("deploy");
		});
		it("should correctly read sourcemaps with custom wrangler.toml location", async () => {
			fs.mkdirSync("some/dir", { recursive: true });
			writeWranglerToml(
				{
					main: "../../index.ts",
					upload_source_maps: true,
				},
				"some/dir/wrangler.toml"
			);
			writeWorkerSource({ format: "ts" });

			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedMainModule: "index.js",
				expectedModules: {
					"index.js.map": expect.stringMatching(
						/"sources":\[".*?another\.ts",".*?index\.ts"\],"sourceRoot":"".*"file":"index.js"/
					),
				},
			});

			await runWrangler("deploy -c some/dir/wrangler.toml");
		});
	});

	describe("ai", () => {
		it("should upload ai bindings", async () => {
			writeWranglerToml({
				ai: { binding: "AI_BIND" },
				browser: { binding: "MYBROWSER" },
			});
			await fs.promises.writeFile("index.js", `export default {};`);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedBindings: [
					{
						type: "browser",
						name: "MYBROWSER",
					},
					{
						type: "ai",
						name: "AI_BIND",
					},
				],
			});

			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Your worker has access to the following bindings:
				- Browser:
				  - Name: MYBROWSER
				- AI:
				  - Name: AI_BIND
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
		});
	});

	describe("python", () => {
		it("should upload python module defined in wrangler.toml", async () => {
			writeWranglerToml({
				main: "index.py",
				compatibility_flags: ["python_workers"],
			});
			await fs.promises.writeFile(
				"index.py",
				"from js import Response;\ndef fetch(request):\n return Response.new('hello')"
			);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedMainModule: "index.py",
			});

			await runWrangler("deploy");
			expect(
				std.out.replace(
					/.wrangler\/tmp\/deploy-(.+)\/index.py/,
					".wrangler/tmp/deploy/index.py"
				)
			).toMatchInlineSnapshot(`
				"┌──────────────────────────────────────┬────────┬──────────┐
				│ Name                                 │ Type   │ Size     │
				├──────────────────────────────────────┼────────┼──────────┤
				│ .wrangler/tmp/deploy/index.py │ python │ xx KiB │
				├──────────────────────────────────────┼────────┼──────────┤
				│ Total (1 module)                     │        │ xx KiB │
				└──────────────────────────────────────┴────────┴──────────┘
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
		});

		it("should upload python module specified in CLI args", async () => {
			writeWranglerToml({
				compatibility_flags: ["python_workers"],
			});
			await fs.promises.writeFile(
				"index.py",
				"from js import Response;\ndef fetch(request):\n return Response.new('hello')"
			);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedMainModule: "index.py",
			});

			await runWrangler("deploy index.py");
			expect(
				std.out.replace(
					/.wrangler\/tmp\/deploy-(.+)\/index.py/,
					".wrangler/tmp/deploy/index.py"
				)
			).toMatchInlineSnapshot(`
				"┌──────────────────────────────────────┬────────┬──────────┐
				│ Name                                 │ Type   │ Size     │
				├──────────────────────────────────────┼────────┼──────────┤
				│ .wrangler/tmp/deploy/index.py │ python │ xx KiB │
				├──────────────────────────────────────┼────────┼──────────┤
				│ Total (1 module)                     │        │ xx KiB │
				└──────────────────────────────────────┴────────┴──────────┘
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
		});
	});

	describe("hyperdrive", () => {
		it("should upload hyperdrive bindings", async () => {
			writeWranglerToml({
				hyperdrive: [
					{
						binding: "HYPERDRIVE",
						id: "343cd4f1d58c42fbb5bd082592fd7143",
					},
				],
			});
			await fs.promises.writeFile("index.js", `export default {};`);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedBindings: [
					{
						type: "hyperdrive",
						name: "HYPERDRIVE",
						id: "343cd4f1d58c42fbb5bd082592fd7143",
					},
				],
			});

			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Your worker has access to the following bindings:
				- Hyperdrive Configs:
				  - HYPERDRIVE: 343cd4f1d58c42fbb5bd082592fd7143
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
		});
	});

	describe("mtls_certificates", () => {
		it("should upload mtls_certificate bindings", async () => {
			writeWranglerToml({
				mtls_certificates: [{ binding: "CERT_ONE", certificate_id: "1234" }],
			});
			await fs.promises.writeFile("index.js", `export default {};`);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedBindings: [
					{
						type: "mtls_certificate",
						name: "CERT_ONE",
						certificate_id: "1234",
					},
				],
			});

			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Your worker has access to the following bindings:
				- mTLS Certificates:
				  - CERT_ONE: 1234
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
		});
	});

	describe("pipelines", () => {
		it("should upload pipelines bindings", async () => {
			writeWranglerToml({
				pipelines: [
					{
						binding: "MY_PIPELINE",
						pipeline: "0123456789ABCDEF0123456789ABCDEF",
					},
				],
			});
			await fs.promises.writeFile("index.js", `export default {};`);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedBindings: [
					{
						type: "pipelines",
						name: "MY_PIPELINE",
						id: "0123456789ABCDEF0123456789ABCDEF",
					},
				],
			});

			await runWrangler("deploy index.js");
			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Worker Startup Time: 100 ms
			Your worker has access to the following bindings:
			- Pipelines:
			  - MY_PIPELINE: 0123456789ABCDEF0123456789ABCDEF
			Uploaded test-name (TIMINGS)
			Deployed test-name triggers (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Version ID: Galaxy-Class"
		`);
		});
	});

	describe("--keep-vars", () => {
		it("should send keepVars when keep-vars is passed in", async () => {
			vi.stubEnv("CLOUDFLARE_API_TOKEN", "hunter2");
			vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "some-account-id");
			setIsTTY(false);
			writeWranglerToml();
			writeWorkerSource();
			mockSubDomainRequest();
			mockUploadWorkerRequest({ keepVars: true, keepSecrets: true });
			mockOAuthServerCallback();
			mockGetMemberships([]);

			await runWrangler("deploy index.js --keep-vars");

			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should not send keepVars by default", async () => {
			vi.stubEnv("CLOUDFLARE_API_TOKEN", "hunter2");
			vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "some-account-id");
			setIsTTY(false);
			writeWranglerToml();
			writeWorkerSource();
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			mockOAuthServerCallback();
			mockGetMemberships([]);

			await runWrangler("deploy index.js");

			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should send keepVars when `keep_vars = true`", async () => {
			vi.stubEnv("CLOUDFLARE_API_TOKEN", "hunter2");
			vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "some-account-id");
			setIsTTY(false);
			writeWranglerToml({
				keep_vars: true,
			});
			writeWorkerSource();
			mockSubDomainRequest();
			mockUploadWorkerRequest({ keepVars: true, keepSecrets: true });
			mockOAuthServerCallback();
			mockGetMemberships([]);

			await runWrangler("deploy index.js");

			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});
	});

	describe("--dispatch-namespace", () => {
		it("should upload to dispatch namespace", async () => {
			writeWranglerToml();
			const scriptContent = `
      export default {
				fetch() {
					return new Response("Hello, World!");
				}
			}
    `;
			fs.writeFileSync("index.js", scriptContent);
			mockUploadWorkerRequest({
				expectedMainModule: "index.js",
				expectedDispatchNamespace: "test-dispatch-namespace",
			});

			await runWrangler(
				"deploy --dispatch-namespace test-dispatch-namespace index.js"
			);
			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				  Dispatch Namespace: test-dispatch-namespace
				Current Version ID: undefined"
			`);
		});
	});

	describe("[observability]", () => {
		it("should allow uploading workers with observability", async () => {
			writeWranglerToml({
				observability: {
					enabled: true,
					head_sampling_rate: 0.5,
				},
			});
			await fs.promises.writeFile("index.js", `export default {};`);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedObservability: {
					enabled: true,
					head_sampling_rate: 0.5,
				},
			});

			await runWrangler("publish index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
		});

		it("should disable observability if not explicitly defined", async () => {
			writeWranglerToml({});
			await fs.promises.writeFile("index.js", `export default {};`);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedSettingsPatch: {
					observability: {
						enabled: false,
					},
				},
			});

			await runWrangler("publish index.js");
			expect(std.out).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
		});
	});
});

/** Write mock assets to the file system so they can be uploaded. */
function writeAssets(
	assets: { filePath: string; content: string }[],
	destination = "assets"
) {
	for (const asset of assets) {
		const filePathDestination = path.join(destination, asset.filePath);
		fs.mkdirSync(path.dirname(filePathDestination), {
			recursive: true,
		});
		fs.writeFileSync(filePathDestination, asset.content);
	}
}
function mockDeploymentsListRequest() {
	msw.use(...mswSuccessDeployments);
}

function mockLastDeploymentRequest() {
	msw.use(...mswSuccessDeploymentScriptMetadata);
}

/** Create a mock handler to toggle a <script>.<user>.workers.dev subdomain */
function mockUpdateWorkerRequest({
	env,
	enabled,
	legacyEnv = false,
}: {
	enabled: boolean;
	env?: string | undefined;
	legacyEnv?: boolean | undefined;
}) {
	const requests = { count: 0 };
	const servicesOrScripts = env && !legacyEnv ? "services" : "scripts";
	const environment = env && !legacyEnv ? "/environments/:envName" : "";
	msw.use(
		http.post(
			`*/accounts/:accountId/workers/${servicesOrScripts}/:scriptName${environment}/subdomain`,
			async ({ request, params }) => {
				expect(params.accountId).toEqual("some-account-id");
				expect(params.scriptName).toEqual(
					legacyEnv && env ? `test-name-${env}` : "test-name"
				);
				if (!legacyEnv) {
					expect(params.envName).toEqual(env);
				}
				const body = await request.json();
				expect(body).toEqual({ enabled });
				return HttpResponse.json(createFetchResult(null));
			},
			{ once: true }
		)
	);
	return requests;
}

function mockPublishRoutesRequest({
	routes = [],
	env = undefined,
	legacyEnv = false,
}: {
	routes: Config["routes"];
	env?: string | undefined;
	legacyEnv?: boolean | undefined;
}) {
	const servicesOrScripts = env && !legacyEnv ? "services" : "scripts";
	const environment = env && !legacyEnv ? "/environments/:envName" : "";

	msw.use(
		http.put(
			`*/accounts/:accountId/workers/${servicesOrScripts}/:scriptName${environment}/routes`,
			async ({ request, params }) => {
				expect(params.accountId).toEqual("some-account-id");
				expect(params.scriptName).toEqual(
					legacyEnv && env ? `test-name-${env}` : "test-name"
				);
				if (!legacyEnv) {
					expect(params.envName).toEqual(env);
				}
				const body = await request.json();
				expect(body).toEqual(
					routes.map((route) =>
						typeof route !== "object" ? { pattern: route } : route
					)
				);
				return HttpResponse.json(createFetchResult(null));
			},
			{ once: true }
		)
	);
}

function mockUnauthorizedPublishRoutesRequest({
	env = undefined,
	legacyEnv = false,
}: {
	env?: string | undefined;
	legacyEnv?: boolean | undefined;
} = {}) {
	const servicesOrScripts = env && !legacyEnv ? "services" : "scripts";
	const environment = env && !legacyEnv ? "/environments/:envName" : "";

	msw.use(
		http.put(
			`*/accounts/:accountId/workers/${servicesOrScripts}/:scriptName${environment}/routes`,
			() => {
				return HttpResponse.json(
					createFetchResult(null, false, [
						{ message: "Authentication error", code: 10000 },
					])
				);
			},
			{ once: true }
		)
	);
}

function mockGetZones(
	domain: string,
	zones: { id: string }[] = [],
	accountId = "some-account-id"
) {
	msw.use(
		http.get("*/zones", ({ request }) => {
			const url = new URL(request.url);

			expect([...url.searchParams.entries()]).toEqual([
				["name", domain],
				["account.id", accountId],
			]);

			return HttpResponse.json(
				{
					success: true,
					errors: [],
					messages: [],
					result: zones,
				},
				{ status: 200 }
			);
		})
	);
}

function mockGetWorkerRoutes(zoneId: string) {
	msw.use(
		http.get("*/zones/:zoneId/workers/routes", ({ params }) => {
			expect(params.zoneId).toEqual(zoneId);

			return HttpResponse.json(
				{
					success: true,
					errors: [],
					messages: [],
					result: [],
				},
				{ status: 200 }
			);
		})
	);
}

function mockPublishRoutesFallbackRequest(route: {
	pattern: string;
	script: string;
}) {
	msw.use(
		http.post(
			`*/zones/:zoneId/workers/routes`,
			async ({ request }) => {
				const body = await request.json();
				expect(body).toEqual(route);
				return HttpResponse.json(createFetchResult(route.pattern));
			},
			{ once: true }
		)
	);
}

function mockCustomDomainLookup(origin: CustomDomain) {
	msw.use(
		http.get(
			`*/accounts/:accountId/workers/domains/records/:domainTag`,

			({ params }) => {
				expect(params.accountId).toEqual("some-account-id");
				expect(params.domainTag).toEqual(origin.id);

				return HttpResponse.json(createFetchResult(origin));
			},
			{ once: true }
		)
	);
}

function mockCustomDomainsChangesetRequest({
	originConflicts = [],
	dnsRecordConflicts = [],
	env = undefined,
	legacyEnv = false,
}: {
	originConflicts?: Array<CustomDomain>;
	dnsRecordConflicts?: Array<CustomDomain>;
	env?: string | undefined;
	legacyEnv?: boolean | undefined;
}) {
	const servicesOrScripts = env && !legacyEnv ? "services" : "scripts";
	const environment = env && !legacyEnv ? "/environments/:envName" : "";
	msw.use(
		http.post<{ accountId: string; scriptName: string; envName: string }>(
			`*/accounts/:accountId/workers/${servicesOrScripts}/:scriptName${environment}/domains/changeset`,
			async ({ request, params }) => {
				expect(params.accountId).toEqual("some-account-id");
				expect(params.scriptName).toEqual(
					legacyEnv && env ? `test-name-${env}` : "test-name"
				);
				if (!legacyEnv) {
					expect(params.envName).toEqual(env);
				}

				const domains = (await request.json()) as Array<
					{ hostname: string } & ({ zone_id?: string } | { zone_name?: string })
				>;

				const changeset: CustomDomainChangeset = {
					added: domains.map((domain) => {
						return {
							...domain,
							id: "",
							service: params.scriptName,
							environment: params.envName,
							zone_name: "",
							zone_id: "",
						};
					}),
					removed: [],
					updated:
						originConflicts?.map((domain) => {
							return {
								...domain,
								modified: true,
							};
						}) ?? [],
					conflicting: dnsRecordConflicts,
				};

				return HttpResponse.json(createFetchResult(changeset));
			},
			{ once: true }
		)
	);
}

function mockPublishCustomDomainsRequest({
	publishFlags,
	domains = [],
	env = undefined,
	legacyEnv = false,
}: {
	publishFlags: {
		override_scope: boolean;
		override_existing_origin: boolean;
		override_existing_dns_record: boolean;
	};
	domains: Array<
		{ hostname: string } & ({ zone_id?: string } | { zone_name?: string })
	>;
	env?: string | undefined;
	legacyEnv?: boolean | undefined;
}) {
	const servicesOrScripts = env && !legacyEnv ? "services" : "scripts";
	const environment = env && !legacyEnv ? "/environments/:envName" : "";

	msw.use(
		http.put(
			`*/accounts/:accountId/workers/${servicesOrScripts}/:scriptName${environment}/domains/records`,
			async ({ request, params }) => {
				expect(params.accountId).toEqual("some-account-id");
				expect(params.scriptName).toEqual(
					legacyEnv && env ? `test-name-${env}` : "test-name"
				);
				if (!legacyEnv) {
					expect(params.envName).toEqual(env);
				}
				const body = await request.json();
				expect(body).toEqual({
					...publishFlags,
					origins: domains,
				});

				return HttpResponse.json(createFetchResult(null));
			},
			{ once: true }
		)
	);
}

/** Create a mock handler for the request to get a list of all KV namespaces. */
function mockListKVNamespacesRequest(...namespaces: KVNamespaceInfo[]) {
	msw.use(
		http.get(
			"*/accounts/:accountId/storage/kv/namespaces",
			({ params }) => {
				expect(params.accountId).toEqual("some-account-id");
				return HttpResponse.json(createFetchResult(namespaces));
			},
			{ once: true }
		)
	);
}

interface ExpectedAsset {
	filePath: string;
	content: string;
	expiration?: number;
	expiration_ttl?: number;
}
interface StaticAssetUpload {
	key: string;
	base64: boolean;
	value: string;
	expiration: number | undefined;
	expiration_ttl: number | undefined;
}

/** Create a mock handler for the request that tries to do a bulk upload of assets to a KV namespace. */
//TODO: This is getting called multiple times in the test, we need to check if that is happening in Production --Jacob 2021-03-02
function mockUploadAssetsToKVRequest(
	expectedNamespaceId: string,
	assets?: ExpectedAsset[]
) {
	const requests: {
		uploads: StaticAssetUpload[];
	}[] = [];
	msw.use(
		http.put(
			"*/accounts/:accountId/storage/kv/namespaces/:namespaceId/bulk",
			async ({ request, params }) => {
				expect(params.accountId).toEqual("some-account-id");
				expect(params.namespaceId).toEqual(expectedNamespaceId);
				const uploads = (await request.json()) as StaticAssetUpload[];
				if (assets) {
					expect(assets.length).toEqual(uploads.length);
					for (let i = 0; i < uploads.length; i++) {
						checkAssetUpload(assets[i], uploads[i]);
					}
				}

				requests.push({ uploads });
				return HttpResponse.json(createFetchResult([]));
			}
		)
	);
	return requests;
}

function checkAssetUpload(asset: ExpectedAsset, upload: StaticAssetUpload) {
	// The asset key consists of: `<basename>.<hash>.<extension>`
	const keyMatcher = new RegExp(
		"^" +
			asset.filePath.replace(/(\.[^.]+)$/, ".[a-z0-9]+$1").replace(/\./g, "\\.")
	);
	expect(upload.key).toMatch(keyMatcher);
	// The asset value is base64 encoded.
	expect(upload.base64).toBe(true);
	expect(Buffer.from(upload.value, "base64").toString()).toEqual(asset.content);
	expect(upload.expiration).toEqual(asset.expiration);
	expect(upload.expiration_ttl).toEqual(asset.expiration_ttl);
}

/** Create a mock handler for thr request that does a bulk delete of unused assets */
function mockDeleteUnusedAssetsRequest(
	expectedNamespaceId: string,
	assets: string[]
) {
	msw.use(
		http.delete(
			"*/accounts/:accountId/storage/kv/namespaces/:namespaceId/bulk",
			async ({ request, params }) => {
				expect(params.accountId).toEqual("some-account-id");
				expect(params.namespaceId).toEqual(expectedNamespaceId);
				const deletes = await request.json();
				expect(assets).toEqual(deletes);
				return HttpResponse.json({
					success: true,
					errors: [],
					messages: [],
					result: null,
				});
			},
			{ once: true }
		)
	);
}

type LegacyScriptInfo = { id: string; migration_tag?: string };

function mockLegacyScriptData(options: { scripts: LegacyScriptInfo[] }) {
	const { scripts } = options;
	msw.use(
		http.get(
			"*/accounts/:accountId/workers/scripts",
			({ params }) => {
				expect(params.accountId).toEqual("some-account-id");
				return HttpResponse.json({
					success: true,
					errors: [],
					messages: [],
					result: scripts,
				});
			},
			{ once: true }
		)
	);
}

type DurableScriptInfo = { id: string; migration_tag?: string; tag?: string };

function mockServiceScriptData(options: {
	script?: DurableScriptInfo;
	scriptName?: string;
	env?: string;
}) {
	const { script } = options;
	if (options.env) {
		if (!script) {
			msw.use(
				http.get(
					"*/accounts/:accountId/workers/services/:scriptName/environments/:envName",
					() => {
						return HttpResponse.json({
							success: false,
							errors: [
								{
									code: 10092,
									message: "workers.api.error.environment_not_found",
								},
							],
							messages: [],
							result: null,
						});
					},
					{ once: true }
				)
			);
			return;
		}
		msw.use(
			http.get(
				"*/accounts/:accountId/workers/services/:scriptName/environments/:envName",
				({ params }) => {
					expect(params.accountId).toEqual("some-account-id");
					expect(params.scriptName).toEqual(options.scriptName || "test-name");
					expect(params.envName).toEqual(options.env);
					return HttpResponse.json({
						success: true,
						errors: [],
						messages: [],
						result: { script },
					});
				},
				{ once: true }
			)
		);
	} else {
		if (!script) {
			msw.use(
				http.get(
					"*/accounts/:accountId/workers/services/:scriptName",
					() => {
						return HttpResponse.json({
							success: false,
							errors: [
								{
									code: 10090,
									message: "workers.api.error.service_not_found",
								},
							],
							messages: [],
							result: null,
						});
					},
					{ once: true }
				)
			);
			return;
		}
		msw.use(
			http.get(
				"*/accounts/:accountId/workers/services/:scriptName",
				({ params }) => {
					expect(params.accountId).toEqual("some-account-id");
					expect(params.scriptName).toEqual(options.scriptName || "test-name");
					return HttpResponse.json({
						success: true,
						errors: [],
						messages: [],
						result: { default_environment: { script } },
					});
				},
				{ once: true }
			)
		);
	}
}

function mockGetQueueByName(queueName: string, queue: QueueResponse | null) {
	const requests = { count: 0 };
	msw.use(
		http.get("*/accounts/:accountId/queues?*", async ({ request }) => {
			const url = new URL(request.url);

			requests.count += 1;
			expect(await request.text()).toEqual("");
			if (queue) {
				const nameParam = url.searchParams.getAll("name");
				expect(nameParam.length).toBeGreaterThan(0);
				expect(nameParam[0]).toEqual(queueName);
			}
			return HttpResponse.json({
				success: true,
				errors: [],
				messages: [],
				result: queue ? [queue] : [],
			});
		})
	);
	return requests;
}

function mockGetServiceByName(serviceName: string, defaultEnvironment: string) {
	const requests = { count: 0 };
	const resource = `*/accounts/:accountId/workers/services/:serviceName`;
	msw.use(
		http.get(resource, async ({ params }) => {
			requests.count += 1;
			expect(params.accountId).toEqual("some-account-id");
			expect(params.serviceName).toEqual(serviceName);

			return HttpResponse.json({
				success: true,
				errors: [],
				messages: [],
				result: {
					id: serviceName,
					default_environment: {
						environment: defaultEnvironment,
						script: {
							last_deployed_from: "wrangler",
						},
					},
				},
			});
		})
	);
	return requests;
}

function mockPutQueueConsumerById(
	expectedQueueId: string,
	expectedQueueName: string,
	expectedConsumerId: string,
	expectedBody: PostTypedConsumerBody
) {
	const requests = { count: 0 };
	msw.use(
		http.put(
			`*/accounts/:accountId/queues/${expectedQueueId}/consumers/${expectedConsumerId}`,
			async ({ request, params }) => {
				const body = await request.json();
				expect(params.accountId).toEqual("some-account-id");
				expect(body).toEqual(expectedBody);
				requests.count += 1;
				return HttpResponse.json({
					success: true,
					errors: [],
					messages: [],
					result: { queue_name: expectedQueueName },
				});
			}
		)
	);
	return requests;
}

function mockPostConsumerById(
	expectedQueueId: string,
	expectedBody: PostTypedConsumerBody
) {
	const requests = { count: 0 };
	msw.use(
		http.post(
			"*/accounts/:accountId/queues/:queueId/consumers",
			async ({ request, params }) => {
				requests.count += 1;
				expect(params.queueId).toEqual(expectedQueueId);
				expect(params.accountId).toEqual("some-account-id");
				expect(await request.json()).toEqual(expectedBody);
				return HttpResponse.json({
					success: true,
					errors: [],
					messages: [],
					result: {},
				});
			},
			{ once: true }
		)
	);
	return requests;
}

function mockPutQueueById(
	expectedQueueId: string,
	expectedBody: PostQueueBody
) {
	const requests = { count: 0 };
	msw.use(
		http.put(
			`*/accounts/:accountId/queues/:queueId`,
			async ({ request, params }) => {
				const body = await request.json();
				expect(params.queueId).toEqual(expectedQueueId);
				expect(params.accountId).toEqual("some-account-id");
				expect(body).toEqual(expectedBody);
				requests.count += 1;
				return HttpResponse.json({
					success: true,
					errors: [],
					messages: [],
					result: {
						queue: expectedBody.queue_name,
						settings: {
							delivery_delay: expectedBody.settings?.delivery_delay,
						},
					},
				});
			}
		)
	);
	return requests;
}

function mockPostQueueHTTPConsumer(
	expectedQueueId: string,
	expectedBody: PostTypedConsumerBody
) {
	const requests = { count: 0 };
	msw.use(
		http.post(
			`*/accounts/:accountId/queues/:queueId/consumers`,
			async ({ request, params }) => {
				const body = await request.json();
				expect(params.queueId).toEqual(expectedQueueId);
				expect(params.accountId).toEqual("some-account-id");
				expect(body).toEqual(expectedBody);
				requests.count += 1;
				return HttpResponse.json({
					success: true,
					errors: [],
					messages: [],
					result: {},
				});
			}
		)
	);
	return requests;
}

const mockAUSRequest = async (
	bodies?: AssetManifest[],
	buckets: string[][] = [[]],
	jwt: string = "<<aus-completion-token>>"
) => {
	msw.use(
		http.post<never, AssetManifest>(
			`*/accounts/some-account-id/workers/scripts/test-name/assets-upload-session`,
			async ({ request }) => {
				bodies?.push(await request.json());
				return HttpResponse.json(
					{
						success: true,
						errors: [],
						messages: [],
						result: { jwt, buckets },
					},
					{ status: 201 }
				);
			}
		)
	);
};

const mockAssetUploadRequest = async (
	numberOfBuckets: number,
	bodies: FormData[],
	uploadContentTypeHeaders: (string | null)[],
	uploadAuthHeaders: (string | null)[]
) => {
	msw.use(
		http.post(
			"*/accounts/some-account-id/workers/assets/upload",
			async ({ request }) => {
				uploadContentTypeHeaders.push(request.headers.get("Content-Type"));
				uploadAuthHeaders.push(request.headers.get("Authorization"));
				const formData = await request.formData();
				bodies.push(formData);
				if (bodies.length === numberOfBuckets) {
					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: { jwt: "<<aus-completion-token>>" },
						},
						{ status: 201 }
					);
				}

				return HttpResponse.json(
					{
						success: true,
						errors: [],
						messages: [],
						result: {},
					},
					{ status: 202 }
				);
			}
		)
	);
};
expect.extend({
	async toBeAFileWhichMatches(received: File, expected: File) {
		const { equals } = this;

		if (!equals(received.name, expected.name)) {
			return {
				pass: false,
				message: () =>
					`${received.name} name does not match ${expected.name} name`,
			};
		}

		if (!equals(received.type, expected.type)) {
			return {
				pass: false,
				message: () =>
					`${received.type} type does not match ${expected.type} type`,
			};
		}

		const receviedText = await received.text();
		const expectedText = await expected.text();
		if (!equals(receviedText, expectedText)) {
			return {
				pass: false,
				message: () =>
					`${receviedText} value does not match ${expectedText} value`,
			};
		}

		return {
			pass: true,
			message: () => "Files are equal",
		};
	},
});

interface CustomMatchers {
	toBeAFileWhichMatches: (expected: File) => unknown;
}

declare module "vitest" {
	interface Assertion extends CustomMatchers {}
	interface AsymmetricMatchersContaining extends CustomMatchers {}
}
