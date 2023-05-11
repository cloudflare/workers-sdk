import { Blob, Buffer } from "node:buffer";
import { randomFillSync } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as TOML from "@iarna/toml";
import * as esbuild from "esbuild";
import { MockedRequest, rest } from "msw";
import { FormData } from "undici";
import {
	printBundleSize,
	printOffendingDependencies,
} from "../bundle-reporter";
import { logger } from "../logger";
import { writeAuthConfigFile } from "../user";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockAuthDomain } from "./helpers/mock-auth-domain";
import {
	mockConsoleMethods,
	normalizeSlashes,
	normalizeTempDirs,
} from "./helpers/mock-console";
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
import {
	createFetchResult,
	msw,
	mswSuccessDeployments,
	mswSuccessDeploymentScriptMetadata,
} from "./helpers/msw";
import { FileReaderSync } from "./helpers/msw/read-file-sync";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import { writeWorkerSource } from "./helpers/write-worker-source";
import writeWranglerToml from "./helpers/write-wrangler-toml";

import type { Config } from "../config";
import type { WorkerMetadata } from "../create-worker-upload-form";
import type { KVNamespaceInfo } from "../kv/helpers";
import type { CustomDomain, CustomDomainChangeset } from "../publish/publish";
import type { PutConsumerBody } from "../queues/client";
import type { CfWorkerInit } from "../worker";
import type { ResponseComposition, RestContext, RestRequest } from "msw";

describe("publish", () => {
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
		// @ts-expect-error we're using a very simple setTimeout mock here
		jest.spyOn(global, "setTimeout").mockImplementation((fn, _period) => {
			setImmediate(fn);
		});
		setIsTTY(true);
		mockLastDeploymentRequest();
		mockDeploymentsListRequest();
		logger.loggerLevel = "log";
	});

	afterEach(() => {
		clearDialogs();
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
			mockUploadWorkerRequest({ expectedType: "esm" });
			mockOAuthServerCallback();

			await runWrangler("publish ./index");

			expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "Total Upload: xx KiB / gzip: xx KiB
			Worker ID:  abc12345
			Worker ETag:  etag98765
			Worker PipelineHash:  hash9999
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class",
			  "warn": "",
			}
		`);
		});
	});

	describe("authentication", () => {
		mockApiToken({ apiToken: null });

		beforeEach(() => {
			// @ts-expect-error disable the mock we'd setup earlier
			// or else our server won't bother listening for oauth requests
			// and will timeout and fail
			global.setTimeout.mockRestore();
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

			await expect(runWrangler("publish index.js")).resolves.toBeUndefined();

			expect(std.out).toMatchInlineSnapshot(`
			"Attempting to login via OAuth...
			Opening a link in your default browser: https://dash.cloudflare.com/oauth2/auth?response_type=code&client_id=54d11594-84e4-41aa-b438-e81b8fa78ee7&redirect_uri=http%3A%2F%2Flocalhost%3A8976%2Foauth%2Fcallback&scope=account%3Aread%20user%3Aread%20workers%3Awrite%20workers_kv%3Awrite%20workers_routes%3Awrite%20workers_scripts%3Awrite%20workers_tail%3Aread%20d1%3Awrite%20pages%3Awrite%20zone%3Aread%20ssl_certs%3Awrite%20constellation%3Awrite%20offline_access&state=MOCK_STATE_PARAM&code_challenge=MOCK_CODE_CHALLENGE&code_challenge_method=S256
			Successfully logged in.
			Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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

				await expect(runWrangler("publish index.js")).resolves.toBeUndefined();

				expect(accessTokenRequest.actual).toEqual(accessTokenRequest.expected);

				expect(std.out).toMatchInlineSnapshot(`
			"Attempting to login via OAuth...
			Opening a link in your default browser: https://dash.staging.cloudflare.com/oauth2/auth?response_type=code&client_id=54d11594-84e4-41aa-b438-e81b8fa78ee7&redirect_uri=http%3A%2F%2Flocalhost%3A8976%2Foauth%2Fcallback&scope=account%3Aread%20user%3Aread%20workers%3Awrite%20workers_kv%3Awrite%20workers_routes%3Awrite%20workers_scripts%3Awrite%20workers_tail%3Aread%20d1%3Awrite%20pages%3Awrite%20zone%3Aread%20ssl_certs%3Awrite%20constellation%3Awrite%20offline_access&state=MOCK_STATE_PARAM&code_challenge=MOCK_CODE_CHALLENGE&code_challenge_method=S256
			Successfully logged in.
			Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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

			await expect(runWrangler("publish index.js")).resolves.toBeUndefined();

			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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
			const ENV_COPY = process.env;

			afterEach(() => {
				process.env = ENV_COPY;
			});

			it("should not throw an error in non-TTY if 'CLOUDFLARE_API_TOKEN' & 'account_id' are in scope", async () => {
				process.env = {
					CLOUDFLARE_API_TOKEN: "123456789",
				};
				setIsTTY(false);
				writeWranglerToml({
					account_id: "some-account-id",
				});
				writeWorkerSource();
				mockSubDomainRequest();
				mockUploadWorkerRequest();
				mockOAuthServerCallback();

				await runWrangler("publish index.js");

				expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
		`);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should not throw an error if 'CLOUDFLARE_ACCOUNT_ID' & 'CLOUDFLARE_API_TOKEN' are in scope", async () => {
				process.env = {
					CLOUDFLARE_API_TOKEN: "hunter2",
					CLOUDFLARE_ACCOUNT_ID: "some-account-id",
				};
				setIsTTY(false);
				writeWranglerToml();
				writeWorkerSource();
				mockSubDomainRequest();
				mockUploadWorkerRequest();
				mockOAuthServerCallback();
				mockGetMemberships([]);

				await runWrangler("publish index.js");

				expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
		`);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should throw an error in non-TTY & there is more than one account associated with API token", async () => {
				setIsTTY(false);
				process.env = {
					CLOUDFLARE_API_TOKEN: "hunter2",
					CLOUDFLARE_ACCOUNT_ID: undefined,
				};
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

				await expect(runWrangler("publish index.js")).rejects
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
				process.env = {
					CLOUDFLARE_API_TOKEN: undefined,
					CLOUDFLARE_ACCOUNT_ID: "badwolf",
				};
				writeWorkerSource();
				mockSubDomainRequest();
				mockUploadWorkerRequest();
				mockOAuthServerCallback();
				mockGetMemberships([
					{ id: "IG-88", account: { id: "1701", name: "enterprise" } },
					{ id: "R2-D2", account: { id: "nx01", name: "enterprise-nx" } },
				]);

				await expect(runWrangler("publish index.js")).rejects.toThrowError();

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
				process.env = {
					CLOUDFLARE_API_TOKEN: "picard",
					CLOUDFLARE_ACCOUNT_ID: undefined,
				};
				writeWorkerSource();
				mockSubDomainRequest();
				mockUploadWorkerRequest();
				mockOAuthServerCallback();
				mockGetMemberships([]);

				await expect(runWrangler("publish index.js")).rejects.toThrowError();

				expect(std.err).toMatchInlineSnapshot(`
			          "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mFailed to automatically retrieve account IDs for the logged in user.[0m

			            In a non-interactive environment, it is mandatory to specify an account ID, either by assigning
			            its value to CLOUDFLARE_ACCOUNT_ID, or as \`account_id\` in your \`wrangler.toml\` file.

			          "
		        `);
			});
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

			await runWrangler("publish index.js --env some-env");
			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name-some-env (TIMINGS)
			Published test-name-some-env (TIMINGS)
			  https://test-name-some-env.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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

				await runWrangler("publish index.js --legacy-env true");
				expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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

				await runWrangler("publish index.js --env some-env --legacy-env true");
				expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name-some-env (TIMINGS)
			Published test-name-some-env (TIMINGS)
			  https://test-name-some-env.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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

				await runWrangler("publish index.js --env some-env --legacy-env true");
				expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name-some-env (TIMINGS)
			Published test-name-some-env (TIMINGS)
			  https://test-name-some-env.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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
					runWrangler("publish index.js --env some-env --legacy-env true")
				).rejects.toThrowErrorMatchingInlineSnapshot(`
			                "Processing wrangler.toml configuration:
			                  - No environment found in configuration with name \\"some-env\\".
			                    Before using \`--env=some-env\` there should be an equivalent environment section in the configuration.
			                    The available configured environment names are: [\\"other-env\\"]

			                    Consider adding an environment configuration section to the wrangler.toml file:
			                    \`\`\`
			                    [env.some-env]
			                    \`\`\`
			                "
		              `);
			});

			it("should throw an error w/ helpful message when using --env --name", async () => {
				writeWranglerToml({ env: { "some-env": {} } });
				writeWorkerSource();
				mockSubDomainRequest();
				await runWrangler(
					"publish index.js --name voyager --env some-env --legacy-env true"
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

				await runWrangler("publish index.js --legacy-env false");
				expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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
				});

				await runWrangler("publish index.js --env some-env --legacy-env false");
				expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (some-env) (TIMINGS)
			Published test-name (some-env) (TIMINGS)
			  https://some-env.test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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
		await runWrangler("publish ./some-path/worker/index.js");
		expect(std.out).toMatchInlineSnapshot(`
		"Total Upload: xx KiB / gzip: xx KiB
		Your worker has access to the following bindings:
		- Vars:
		  - xyz: 123
		Uploaded test-name (TIMINGS)
		Published test-name (TIMINGS)
		  https://test-name.test-sub-domain.workers.dev
		Current Deployment ID: Galaxy-Class"
	`);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	describe("routes", () => {
		it("should publish the worker to a route", async () => {
			writeWranglerToml({
				routes: ["example.com/some-route/*"],
			});
			writeWorkerSource();
			mockUpdateWorkerRequest({ enabled: false });
			mockUploadWorkerRequest({ expectedType: "esm" });
			mockPublishRoutesRequest({ routes: ["example.com/some-route/*"] });
			await runWrangler("publish ./index");
		});

		it("should publish with an empty string route", async () => {
			writeWranglerToml({
				route: "",
			});
			writeWorkerSource();
			mockUpdateWorkerRequest({ enabled: false });
			mockUploadWorkerRequest({ expectedType: "esm" });
			mockSubDomainRequest();
			mockPublishRoutesRequest({ routes: [] });
			await runWrangler("publish ./index");
			expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

			    - The \\"route\\" field in your configuration is an empty string and will be ignored.
			      Please remove the \\"route\\" field from your configuration.

			",
			}
		`);
		});
		it("should publish to a route with a pattern/{zone_id|zone_name} combo", async () => {
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
			await runWrangler("publish ./index");
			expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  some-example.com/some-route/*
			  *a-boring-website.com (zone id: 54sdf7fsda)
			  *another-boring-website.com (zone name: some-zone.com)
			  example.com/some-route/* (zone id: JGHFHG654gjcj)
			  more-examples.com/*
			Current Deployment ID: Galaxy-Class",
			  "warn": "",
			}
		`);
		});

		it("should publish to a route with a pattern/{zone_id|zone_name} combo (service environments)", async () => {
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
			await runWrangler("publish ./index --legacy-env false --env staging");
			expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (staging) (TIMINGS)
			Published test-name (staging) (TIMINGS)
			  some-example.com/some-route/*
			  *a-boring-website.com (zone id: 54sdf7fsda)
			  *another-boring-website.com (zone name: some-zone.com)
			  example.com/some-route/* (zone id: JGHFHG654gjcj)
			  more-examples.com/*
			Current Deployment ID: Galaxy-Class",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

			    - Experimental: Service environments are in beta, and their behaviour is guaranteed to change in
			  the future. DO NOT USE IN PRODUCTION.

			",
			}
		`);
		});

		it("should publish to legacy environment specific routes", async () => {
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
			await runWrangler("publish ./index --env dev --legacy-env true");
		});

		it("services: should publish to service environment specific routes", async () => {
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
			await runWrangler("publish ./index --env dev --legacy-env false");
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
			await runWrangler("publish ./index");

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
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  example.com/some-route/*
			Current Deployment ID: Galaxy-Class"
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
			await expect(runWrangler("publish ./index --env=staging")).rejects
				.toThrowErrorMatchingInlineSnapshot(`
			              "Service environments combined with an API token that doesn't have 'All Zones' permissions is not supported.
			              Either turn off service environments by setting \`legacy_env = true\`, creating an API token with 'All Zones' permissions, or logging in via OAuth"
		            `);
		});

		describe("custom domains", () => {
			it("should publish routes marked with 'custom_domain' as separate custom domains", async () => {
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
				await runWrangler("publish ./index");
				expect(std.out).toContain("api.example.com (custom domain)");
			});

			it("should confirm override if custom domain publish would override an existing domain", async () => {
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
				await runWrangler("publish ./index");
				expect(std.out).toContain("api.example.com (custom domain)");
			});

			it("should confirm override if custom domain publish contains a conflicting DNS record", async () => {
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
				await runWrangler("publish ./index");
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
				await runWrangler("publish ./index");
				expect(std.out).toContain("api.example.com (custom domain)");
			});

			it("should throw if an invalid custom domain is requested", async () => {
				writeWranglerToml({
					routes: [{ pattern: "*.example.com", custom_domain: true }],
				});
				writeWorkerSource();
				await expect(
					runWrangler("publish ./index")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`"Cannot use \\"*.example.com\\" as a Custom Domain; wildcard operators (*) are not allowed"`
				);

				writeWranglerToml({
					routes: [
						{ pattern: "api.example.com/at/a/path", custom_domain: true },
					],
				});
				writeWorkerSource();
				await expect(
					runWrangler("publish ./index")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`"Cannot use \\"api.example.com/at/a/path\\" as a Custom Domain; paths are not allowed"`
				);
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
				await runWrangler("publish ./index");
				expect(std.out).toContain(
					'Publishing to Custom Domain "api.example.com" was skipped, fix conflict and try again'
				);
			});
		});

		it.todo("should error if it's a workers.dev route");
	});

	describe("entry-points", () => {
		it("should be able to use `index` with no extension as the entry-point (esm)", async () => {
			writeWranglerToml();
			writeWorkerSource();
			mockUploadWorkerRequest({ expectedType: "esm" });
			mockSubDomainRequest();

			await runWrangler("publish ./index");

			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
		`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should be able to use `index` with no extension as the entry-point (sw)", async () => {
			writeWranglerToml();
			writeWorkerSource({ type: "sw" });
			mockUploadWorkerRequest({ expectedType: "sw" });
			mockSubDomainRequest();

			await runWrangler("publish ./index");

			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
		`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should be able to use the `main` config as the entry-point for ESM sources", async () => {
			writeWranglerToml({ main: "./index.js" });
			writeWorkerSource();
			mockUploadWorkerRequest();
			mockSubDomainRequest();

			await runWrangler("publish");

			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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
			await runWrangler("publish");

			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
		`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it('should use `build.upload.main` as an entry point, where `build.upload.dir` defaults to "./dist", and log a deprecation warning', async () => {
			writeWranglerToml({ build: { upload: { main: "./index.js" } } });
			writeWorkerSource({ basePath: "./dist" });
			mockUploadWorkerRequest();
			mockSubDomainRequest();

			await runWrangler("publish");

			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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
			await runWrangler("publish");

			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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
			await expect(runWrangler("publish")).rejects
				.toThrowErrorMatchingInlineSnapshot(`
			              "Processing wrangler.toml configuration:
			                - Don't define both the \`main\` and \`build.upload.main\` fields in your configuration.
			                  They serve the same purpose: to point to the entry-point of your worker.
			                  Delete the \`build.upload.main\` and \`build.upload.dir\` field from your config."
		            `);
		});

		it("should be able to transpile TypeScript (esm)", async () => {
			writeWranglerToml();
			writeWorkerSource({ format: "ts" });
			mockUploadWorkerRequest({ expectedEntry: "var foo = 100;" });
			mockSubDomainRequest();
			await runWrangler("publish index.ts");

			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
		`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should be able to transpile TypeScript (sw)", async () => {
			writeWranglerToml();
			writeWorkerSource({ format: "ts", type: "sw" });
			mockUploadWorkerRequest({
				expectedEntry: "var foo = 100;",
				expectedType: "sw",
			});
			mockSubDomainRequest();
			await runWrangler("publish index.ts");

			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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
			await runWrangler("publish index.js");
			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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
			await runWrangler("publish index.js");
			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
		`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should be able to transpile entry-points in sub-directories (esm)", async () => {
			writeWranglerToml();
			writeWorkerSource({ basePath: "./src" });
			mockUploadWorkerRequest({ expectedEntry: "var foo = 100;" });
			mockSubDomainRequest();

			await runWrangler("publish ./src/index.js");

			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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

			await runWrangler("publish index.js --dry-run --outdir out");

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

			await runWrangler("publish index.js --dry-run --outdir out");

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
			});
			mockSubDomainRequest();

			await runWrangler("publish ./src/index.js");

			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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

			await expect(runWrangler("publish ./index.js")).rejects
				.toThrowErrorMatchingInlineSnapshot(`
			              "Processing wrangler.toml configuration:
			                - \\"site.bucket\\" is a required field."
		            `);

			expect(std.out).toMatchInlineSnapshot(`
			        "
			        [32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/workers-sdk/issues/new/choose[0m"
		      `);
			expect(std.err).toMatchInlineSnapshot(`
			        "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mProcessing wrangler.toml configuration:[0m

			            - \\"site.bucket\\" is a required field.

			        "
		      `);
			expect(normalizeSlashes(std.warn)).toMatchInlineSnapshot(`
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
			await runWrangler("publish ./index.js");

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
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class",
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
			await runWrangler("publish --config ./my-site/wrangler.toml");

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
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
		`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(normalizeSlashes(std.warn)).toMatchInlineSnapshot(`
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

			await expect(runWrangler("publish")).rejects
				.toThrowErrorMatchingInlineSnapshot(`
			              "Processing wrangler.toml configuration:
			                - Don't define both the \`main\` and \`site.entry-point\` fields in your configuration.
			                  They serve the same purpose: to point to the entry-point of your worker.
			                  Delete the deprecated \`site.entry-point\` field from your config."
		            `);
		});

		it("should error if there is no entry-point specified", async () => {
			writeWranglerToml();
			writeWorkerSource();
			mockUploadWorkerRequest();
			mockSubDomainRequest();
			await expect(
				runWrangler("publish")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`"Missing entry-point: The entry-point should be specified via the command line (e.g. \`wrangler publish path/to/script\`) or the \`main\` config field."`
			);

			expect(std.out).toMatchInlineSnapshot(`
			        "
			        [32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/workers-sdk/issues/new/choose[0m"
		      `);
			expect(std.err).toMatchInlineSnapshot(`
			        "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mMissing entry-point: The entry-point should be specified via the command line (e.g. \`wrangler publish path/to/script\`) or the \`main\` config field.[0m

			        "
		      `);
		});

		it("should not require an explicit entry point when using --assets", async () => {
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

			await runWrangler("publish --assets assets --latest --name test-name");

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
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe --assets argument is experimental and may change or break at any time[0m


			[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mUsing the latest version of the Workers runtime. To silence this warning, please choose a specific version of the runtime with --compatibility-date, or add a compatibility_date to your wrangler.toml.[0m



			",
			}
		`);
		});
	});

	describe("asset upload", () => {
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
			await runWrangler("publish");

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
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
		`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should upload all the files in the directory specified by `--assets`", async () => {
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
			await runWrangler("publish --assets assets");

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
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe --assets argument is experimental and may change or break at any time[0m

			",
			}
		`);
		});

		it("should error when trying to use --assets with a service-worker Worker", async () => {
			writeWranglerToml({
				main: "./index.js",
			});
			writeWorkerSource({ type: "sw" });
			await expect(
				runWrangler("publish --assets abc")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`"You cannot use the service-worker format with an \`assets\` directory yet. For information on how to migrate to the module-worker format, see: https://developers.cloudflare.com/workers/learning/migrating-to-module-workers/"`
			);

			expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mYou cannot use the service-worker format with an \`assets\` directory yet. For information on how to migrate to the module-worker format, see: https://developers.cloudflare.com/workers/learning/migrating-to-module-workers/[0m

			",
			  "info": "",
			  "out": "
			[32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/workers-sdk/issues/new/choose[0m",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe --assets argument is experimental and may change or break at any time[0m

			",
			}
		`);
		});

		it("should error if --assets and --site are used together", async () => {
			writeWranglerToml({
				main: "./index.js",
			});
			writeWorkerSource();
			await expect(
				runWrangler("publish --assets abc --site xyz")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`"Cannot use Assets and Workers Sites in the same Worker."`
			);

			expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mCannot use Assets and Workers Sites in the same Worker.[0m

			",
			  "info": "",
			  "out": "
			[32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/workers-sdk/issues/new/choose[0m",
			  "warn": "",
			}
		`);
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
				runWrangler("publish --assets abc")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`"Cannot use Assets and Workers Sites in the same Worker."`
			);

			expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mCannot use Assets and Workers Sites in the same Worker.[0m

			",
			  "info": "",
			  "out": "
			[32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/workers-sdk/issues/new/choose[0m",
			  "warn": "",
			}
		`);
		});

		it("should error if config.assets and --site are used together", async () => {
			writeWranglerToml({
				main: "./index.js",
				// @ts-expect-error we allow string inputs here
				assets: "abc",
			});
			writeWorkerSource();
			await expect(
				runWrangler("publish --site xyz")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`"Cannot use Assets and Workers Sites in the same Worker."`
			);

			expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mCannot use Assets and Workers Sites in the same Worker.[0m

			",
			  "info": "",
			  "out": "
			[32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/workers-sdk/issues/new/choose[0m",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

			    - \\"assets\\" fields are experimental and may change or break at any time.

			",
			}
		`);
		});

		it("should error if config.assets and config.site are used together", async () => {
			writeWranglerToml({
				main: "./index.js",
				// @ts-expect-error we allow string inputs here
				assets: "abc",
				site: {
					bucket: "xyz",
				},
			});
			writeWorkerSource();
			await expect(
				runWrangler("publish")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`"Cannot use Assets and Workers Sites in the same Worker."`
			);

			expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mCannot use Assets and Workers Sites in the same Worker.[0m

			",
			  "info": "",
			  "out": "
			[32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/workers-sdk/issues/new/choose[0m",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

			    - \\"assets\\" fields are experimental and may change or break at any time.

			",
			}
		`);
		});

		it("should warn if --assets is used", async () => {
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

			await runWrangler("publish --assets ./assets");
			expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "Fetching list of already uploaded assets...
			Building list of assets to upload...
			 + subdir/file-1.2ca234f380.txt (uploading new version of subdir/file-1.txt)
			 + subdir/file-2.5938485188.txt (uploading new version of subdir/file-2.txt)
			Uploading 2 new assets...
			Uploaded 100% [2 out of 2]",
			  "out": "↗️  Done syncing assets
			Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe --assets argument is experimental and may change or break at any time[0m

			",
			}
		`);
		});

		it("should warn if config.assets is used", async () => {
			writeWranglerToml({
				main: "./index.js",
				// @ts-expect-error we allow string inputs here
				assets: "./assets",
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

			await runWrangler("publish");
			expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "Fetching list of already uploaded assets...
			Building list of assets to upload...
			 + subdir/file-1.2ca234f380.txt (uploading new version of subdir/file-1.txt)
			 + subdir/file-2.5938485188.txt (uploading new version of subdir/file-2.txt)
			Uploading 2 new assets...
			Uploaded 100% [2 out of 2]",
			  "out": "↗️  Done syncing assets
			Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

			    - \\"assets\\" fields are experimental and may change or break at any time.

			",
			}
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

			await runWrangler("publish");

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
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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
			});
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, []);
			mockUploadAssetsToKVRequest(kvNamespace.id, assets);

			await runWrangler("publish");

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
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
		`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("when using a module worker type, it should add an asset manifest module, and bind to a namespace", async () => {
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
			writeWorkerSource({ type: "esm" });
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

			await runWrangler("publish");

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
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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
			});
			mockSubDomainRequest();
			mockListKVNamespacesRequest(kvNamespace);
			mockKeyListRequest(kvNamespace.id, []);
			mockUploadAssetsToKVRequest(kvNamespace.id, assets);
			await runWrangler("publish --env some-env --legacy-env false");

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
			Uploaded test-name (some-env) (TIMINGS)
			Published test-name (some-env) (TIMINGS)
			  https://some-env.test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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
			await runWrangler("publish --env some-env --legacy-env true");

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
			Uploaded test-name-some-env (TIMINGS)
			Published test-name-some-env (TIMINGS)
			  https://test-name-some-env.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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
			await runWrangler("publish");

			expect(std.out).toMatchInlineSnapshot(`
			"↗️  Done syncing assets
			Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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
			await runWrangler("publish --site-include file-1.txt");

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
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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
			await runWrangler("publish --site-exclude file-2.txt");

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
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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
			await runWrangler("publish");

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
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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
			await runWrangler("publish");

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
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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
			await runWrangler("publish --site-include file-1.txt");

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
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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
			await runWrangler("publish --site-exclude file-2.txt");

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
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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
			await runWrangler("publish");

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
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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
			await runWrangler("publish");

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
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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
				runWrangler("publish")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`"File too-large-file.txt is too big, it should be under 25 MiB. See https://developers.cloudflare.com/workers/platform/limits#kv-limits"`
			);

			expect(std.info).toMatchInlineSnapshot(`
			"Fetching list of already uploaded assets...
			Building list of assets to upload...
			 + large-file.0ea0637a45.txt (uploading new version of large-file.txt)"
		`);
			expect(std.out).toMatchInlineSnapshot(`
			"
			[32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/workers-sdk/issues/new/choose[0m"
		`);
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

			await runWrangler("publish");

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
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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
				runWrangler("publish")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`"The asset path key \\"folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/folder/file.3da0d0cd12.txt\\" exceeds the maximum key size limit of 512. See https://developers.cloudflare.com/workers/platform/limits#kv-limits\\","`
			);

			expect(std.info).toMatchInlineSnapshot(`
			"Fetching list of already uploaded assets...
			Building list of assets to upload..."
		`);
			expect(std.out).toMatchInlineSnapshot(`
			"
			[32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/workers-sdk/issues/new/choose[0m"
		`);
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

			await runWrangler("publish");

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
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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
			await runWrangler("publish");
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
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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
			await runWrangler("publish --site .");

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
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class",
			  "warn": "",
			}
		`);
		});

		it("should use the relative path from current working directory to Worker directory when using `--assets`", async () => {
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
			await runWrangler("publish --assets .");

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
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe --assets argument is experimental and may change or break at any time[0m

			",
			}
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
				rest.put(bulkUrl, async (req, res, ctx) => {
					expect(req.params.accountId).toEqual("some-account-id");
					expect(req.params.namespaceId).toEqual(kvNamespace.id);
					requestCount++;
					return res(
						ctx.status(500),
						ctx.json(
							createFetchResult([], false, [
								{ code: 1000, message: "Whoops! Something went wrong!" },
							])
						)
					);
				})
			);

			await expect(
				runWrangler("publish")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`"A request to the Cloudflare API (/accounts/some-account-id/storage/kv/namespaces/__test-name-workers_sites_assets-id/bulk) failed."`
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
				await runWrangler("publish");
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
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class",
			  "warn": "",
			}
		`);
			});

			it("debug log level", async () => {
				logger.loggerLevel = "debug";
				await runWrangler("publish");

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

	describe("workers_dev setting", () => {
		it("should publish to a workers.dev domain if workers_dev is undefined", async () => {
			writeWranglerToml();
			writeWorkerSource();
			mockUploadWorkerRequest();
			mockSubDomainRequest();

			await runWrangler("publish ./index");

			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
		`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should publish to the workers.dev domain if workers_dev is `true`", async () => {
			writeWranglerToml({
				workers_dev: true,
			});
			writeWorkerSource();
			mockUploadWorkerRequest({ available_on_subdomain: false });
			mockSubDomainRequest();
			mockUpdateWorkerRequest({ enabled: true });

			await runWrangler("publish ./index");

			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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

			await runWrangler("publish ./index");

			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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

			await runWrangler("publish ./index");

			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			No publish targets for test-name (TIMINGS)
			Current Deployment ID: Galaxy-Class"
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

			await runWrangler("publish ./index");

			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			No publish targets for test-name (TIMINGS)
			Current Deployment ID: Galaxy-Class"
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
			});
			mockUpdateWorkerRequest({ enabled: false, env: "dev" });

			await runWrangler("publish ./index --env dev --legacy-env false");

			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (dev) (TIMINGS)
			No publish targets for test-name (dev) (TIMINGS)
			Current Deployment ID: Galaxy-Class"
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

			await runWrangler("publish ./index --env dev --legacy-env false");

			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (dev) (TIMINGS)
			No publish targets for test-name (dev) (TIMINGS)
			Current Deployment ID: Galaxy-Class"
		`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should publish to a workers.dev domain if workers_dev is undefined but overwritten to `true` in environment", async () => {
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
			});
			mockSubDomainRequest();
			mockUpdateWorkerRequest({ enabled: true, env: "dev" });

			await runWrangler("publish ./index --env dev --legacy-env false");

			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (dev) (TIMINGS)
			Published test-name (dev) (TIMINGS)
			  https://dev.test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
		`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should publish to a workers.dev domain if workers_dev is `false` but overwritten to `true` in environment", async () => {
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
			});
			mockSubDomainRequest();
			mockUpdateWorkerRequest({ enabled: true, env: "dev" });

			await runWrangler("publish ./index --env dev --legacy-env false");

			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (dev) (TIMINGS)
			Published test-name (dev) (TIMINGS)
			  https://dev.test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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
			});
			mockSubDomainRequest();
			mockUpdateWorkerRequest({ enabled: true, env: "dev" });

			await runWrangler("publish ./index --env dev --legacy-env false");

			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (dev) (TIMINGS)
			Published test-name (dev) (TIMINGS)
			  https://dev.test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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
			});
			mockSubDomainRequest();
			mockUpdateWorkerRequest({ enabled: true, env: "dev" });

			await runWrangler("publish ./index --env dev --legacy-env false");

			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (dev) (TIMINGS)
			Published test-name (dev) (TIMINGS)
			  https://dev.test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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
				"publish ./index --env dev --legacy-env false --compatibility-date 2022-01-14 --compatibility-flags url_standard"
			);

			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (dev) (TIMINGS)
			Published test-name (dev) (TIMINGS)
			  https://dev.test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
		`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should error if a compatibility_date is not available in wrangler.toml or cli args", async () => {
			writeWorkerSource();
			let err: undefined | Error;
			try {
				await runWrangler("publish ./index.js");
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
			jest.spyOn(Date.prototype, "getMonth").mockImplementation(() => 11);
			jest.spyOn(Date.prototype, "getFullYear").mockImplementation(() => 2020);
			jest.spyOn(Date.prototype, "getDate").mockImplementation(() => 1);

			writeWorkerSource();
			let err: undefined | Error;
			try {
				await runWrangler("publish ./index.js");
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

			await runWrangler("publish ./index");

			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
		`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should enable the workers.dev domain if workers_dev is true and subdomain is not already available", async () => {
			writeWranglerToml({ workers_dev: true });
			writeWorkerSource();
			mockUploadWorkerRequest({ available_on_subdomain: false });
			mockSubDomainRequest();
			mockUpdateWorkerRequest({ enabled: true });

			await runWrangler("publish ./index");

			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
		`);
			expect(std.err).toMatchInlineSnapshot(`""`);
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

			await expect(runWrangler("publish ./index")).rejects
				.toThrowErrorMatchingInlineSnapshot(`
			"You can either publish your worker to one or more routes by specifying them in wrangler.toml, or register a workers.dev subdomain here:
			https://dash.cloudflare.com/some-account-id/workers/onboarding"
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
			await runWrangler("publish index.js");

			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  http://example.com/*
			Current Deployment ID: Galaxy-Class"
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
			await runWrangler("publish index.js --env production");

			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name-production (TIMINGS)
			Published test-name-production (TIMINGS)
			  http://production.example.com/*
			Current Deployment ID: Galaxy-Class"
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
			await runWrangler("publish index.js --env production");

			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name-production (TIMINGS)
			Published test-name-production (TIMINGS)
			  http://production.example.com/*
			Current Deployment ID: Galaxy-Class"
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
			await runWrangler("publish index.js");

			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			  http://example.com/*
			Current Deployment ID: Galaxy-Class"
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
			await runWrangler("publish index.js --env production");

			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name-production (TIMINGS)
			Published test-name-production (TIMINGS)
			  https://test-name-production.test-sub-domain.workers.dev
			  http://production.example.com/*
			Current Deployment ID: Galaxy-Class"
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
			await runWrangler("publish index.js --env production");

			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name-production (TIMINGS)
			Published test-name-production (TIMINGS)
			  https://test-name-production.test-sub-domain.workers.dev
			  http://production.example.com/*
			Current Deployment ID: Galaxy-Class"
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
			await runWrangler("publish index.js --env production");

			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name-production (TIMINGS)
			Published test-name-production (TIMINGS)
			  http://production.example.com/*
			Current Deployment ID: Galaxy-Class"
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
			await runWrangler("publish index.js --env production");

			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name-production (TIMINGS)
			Published test-name-production (TIMINGS)
			  http://production.example.com/*
			Current Deployment ID: Galaxy-Class"
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

			const outFile = normalizeSlashes(
				normalizeTempDirs(fs.readFileSync("dist/index.js", "utf-8"))
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

			const outFile = normalizeSlashes(
				normalizeTempDirs(fs.readFileSync("dist/index.js", "utf-8"))
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
			await runWrangler("publish --dry-run --outdir dist --define abc:789");

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
				"publish --dry-run --outdir dist --define abc:'https://www.abc.net.au/news/'"
			);

			expect(fs.readFileSync("dist/index.js", "utf-8")).toContain(
				// eslint-disable-next-line no-useless-escape
				`console.log(\"https://www.abc.net.au/news/\");`
			);
		});
	});
	describe("custom builds", () => {
		beforeEach(() => {
			// @ts-expect-error disable the mock we'd setup earlier
			// or else custom builds will timeout immediately
			global.setTimeout.mockRestore();
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

			await runWrangler("publish index.js");
			expect(std.out).toMatchInlineSnapshot(`
			"Running custom build: node -e \\"4+4; require('fs').writeFileSync('index.js', 'export default { fetch(){ return new Response(123) } }')\\"
			Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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

				await runWrangler("publish index.js");
				expect(std.out).toMatchInlineSnapshot(`
			"Running custom build: echo \\"export default { fetch(){ return new Response(123) } }\\" > index.js
			Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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

			await expect(runWrangler("publish index.js")).rejects
				.toThrowErrorMatchingInlineSnapshot(`
			              "The expected output file at \\"index.js\\" was not found after running custom build: node -e \\"4+4;\\".
			              The \`main\` property in wrangler.toml should point to the file generated by the custom build."
		            `);
			expect(std.out).toMatchInlineSnapshot(`
			        "Running custom build: node -e \\"4+4;\\"

			        [32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/workers-sdk/issues/new/choose[0m"
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

			await expect(runWrangler("publish")).rejects
				.toThrowErrorMatchingInlineSnapshot(`
			              "The expected output file at \\".\\" was not found after running custom build: node -e \\"4+4;\\".
			              The \`main\` property in wrangler.toml should point to the file generated by the custom build.
			              The provided entry-point path, \\".\\", points to a directory, rather than a file.

			              Did you mean to set the main field to one of:
			              \`\`\`
			              main = \\"./worker.js\\"
			              main = \\"./dist/index.ts\\"
			              \`\`\`"
		            `);
			expect(std.out).toMatchInlineSnapshot(`
			        "Running custom build: node -e \\"4+4;\\"

			        [32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/workers-sdk/issues/new/choose[0m"
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
			await runWrangler("publish index.js --minify");
			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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
			await runWrangler("publish -e testEnv index.js");
			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (testEnv) (TIMINGS)
			Published test-name (testEnv) (TIMINGS)
			  https://testEnv.test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
		`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});
	});

	describe("durable object migrations", () => {
		it("should warn when you try to publish durable objects without migrations", async () => {
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
			await runWrangler("publish index.js");
			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Your worker has access to the following bindings:
			- Durable Objects:
			  - SOMENAME: SomeClass
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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
			  [4mhttps://developers.cloudflare.com/workers/learning/using-durable-objects/#durable-object-migrations-in-wranglertoml[0m
			  for more details.

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
			await runWrangler("publish index.js");
			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Your worker has access to the following bindings:
			- Durable Objects:
			  - SOMENAME: SomeClass (defined in some-script)
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
		`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("should publish all migrations on first publish", async () => {
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
			});

			await runWrangler("publish index.js");
			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Your worker has access to the following bindings:
			- Durable Objects:
			  - SOMENAME: SomeClass
			  - SOMEOTHERNAME: SomeOtherClass
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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
			});

			await runWrangler("publish index.js");
			expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "Total Upload: xx KiB / gzip: xx KiB
			Your worker has access to the following bindings:
			- Durable Objects:
			  - SOMENAME: SomeClass
			  - SOMEOTHERNAME: SomeOtherClass
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class",
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

			await runWrangler("publish index.js");
			expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "Total Upload: xx KiB / gzip: xx KiB
			Your worker has access to the following bindings:
			- Durable Objects:
			  - SOMENAME: SomeClass
			  - SOMEOTHERNAME: SomeOtherClass
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class",
			  "warn": "",
			}
		`);
		});

		describe("service environments", () => {
			it("should publish all migrations on first publish", async () => {
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
				});

				await runWrangler("publish index.js --legacy-env false");
				expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Your worker has access to the following bindings:
			- Durable Objects:
			  - SOMENAME: SomeClass
			  - SOMEOTHERNAME: SomeOtherClass
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
		`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`
			"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

			    - Experimental: Service environments are in beta, and their behaviour is guaranteed to change in
			  the future. DO NOT USE IN PRODUCTION.

			"
		`);
			});

			it("should publish all migrations on first publish (--env)", async () => {
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
				});

				await runWrangler("publish index.js --legacy-env false --env xyz");
				expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Your worker has access to the following bindings:
			- Durable Objects:
			  - SOMENAME: SomeClass
			  - SOMEOTHERNAME: SomeOtherClass
			Uploaded test-name (xyz) (TIMINGS)
			Published test-name (xyz) (TIMINGS)
			  https://xyz.test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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
				});

				await runWrangler("publish index.js --legacy-env false");
				expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "Total Upload: xx KiB / gzip: xx KiB
			Your worker has access to the following bindings:
			- Durable Objects:
			  - SOMENAME: SomeClass
			  - SOMEOTHERNAME: SomeOtherClass
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class",
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
				});

				await runWrangler("publish index.js --legacy-env false --env xyz");
				expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "Total Upload: xx KiB / gzip: xx KiB
			Your worker has access to the following bindings:
			- Durable Objects:
			  - SOMENAME: SomeClass
			  - SOMEOTHERNAME: SomeOtherClass
			Uploaded test-name (xyz) (TIMINGS)
			Published test-name (xyz) (TIMINGS)
			  https://xyz.test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

			    - Experimental: Service environments are in beta, and their behaviour is guaranteed to change in
			  the future. DO NOT USE IN PRODUCTION.

			",
			}
		`);
			});
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

			fs.writeFileSync("./message.capnp.compiled", "compiled capnp messages");

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
			});
			mockSubDomainRequest();
			mockLegacyScriptData({ scripts: [] });

			await expect(runWrangler("publish index.js")).resolves.toBeUndefined();
			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
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
			  - extra_data: interesting value
			  - more_data: dubious value
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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

			await expect(runWrangler("publish index.js")).rejects
				.toMatchInlineSnapshot(`
						              [Error: Processing wrangler.toml configuration:
						                - CONFLICTING_NAME_ONE assigned to Durable Object, KV Namespace, and R2 Bucket bindings.
						                - CONFLICTING_NAME_TWO assigned to Durable Object and KV Namespace bindings.
						                - CONFLICTING_NAME_THREE assigned to R2 Bucket, Text Blob, Unsafe, Environment Variable, WASM Module, and Data Blob bindings.
						                - CONFLICTING_NAME_FOUR assigned to Analytics Engine Dataset, Text Blob, and Unsafe bindings.
						                - Bindings must have unique names, so that they can all be referenced in the worker.
						                  Please change your bindings to have unique names.]
					            `);
			expect(std.out).toMatchInlineSnapshot(`
			        "
			        [32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/workers-sdk/issues/new/choose[0m"
		      `);
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

			await expect(runWrangler("publish index.js")).rejects
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
			expect(std.out).toMatchInlineSnapshot(`
			        "
			        [32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/workers-sdk/issues/new/choose[0m"
		      `);
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

			await expect(runWrangler("publish index.js")).rejects
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
			expect(std.out).toMatchInlineSnapshot(`
			        "
			        [32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/workers-sdk/issues/new/choose[0m"
		      `);
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
				});
				mockSubDomainRequest();

				await runWrangler("publish index.js");
				expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Your worker has access to the following bindings:
			- Wasm Modules:
			  - TESTWASMNAME: path/to/test.wasm
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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
					runWrangler("publish index.js")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`"You cannot configure [wasm_modules] with an ES module worker. Instead, import the .wasm module directly in your code"`
				);
				expect(std.out).toMatchInlineSnapshot(`
			          "
			          [32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/workers-sdk/issues/new/choose[0m"
		        `);
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
				});
				mockSubDomainRequest();
				await runWrangler("publish index.js --config ./path/to/wrangler.toml");
				expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Your worker has access to the following bindings:
			- Wasm Modules:
			  - TESTWASMNAME: path/to/and/the/path/to/test.wasm
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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
				});
				mockSubDomainRequest();
				await runWrangler("publish index.js");
				expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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
				});
				mockSubDomainRequest();
				await runWrangler("publish index.js");
				expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Your worker has access to the following bindings:
			- Text Blobs:
			  - TESTTEXTBLOBNAME: path/to/text.file
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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
					runWrangler("publish index.js")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`"You cannot configure [text_blobs] with an ES module worker. Instead, import the file directly in your code, and optionally configure \`[rules]\` in your wrangler.toml"`
				);
				expect(std.out).toMatchInlineSnapshot(`
			          "
			          [32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/workers-sdk/issues/new/choose[0m"
		        `);
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
				});
				mockSubDomainRequest();
				await runWrangler("publish index.js --config ./path/to/wrangler.toml");
				expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Your worker has access to the following bindings:
			- Text Blobs:
			  - TESTTEXTBLOBNAME: path/to/and/the/path/to/text.file
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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
				});
				mockSubDomainRequest();
				await runWrangler("publish index.js");
				expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Your worker has access to the following bindings:
			- Data Blobs:
			  - TESTDATABLOBNAME: path/to/data.bin
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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
					runWrangler("publish index.js")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`"You cannot configure [data_blobs] with an ES module worker. Instead, import the file directly in your code, and optionally configure \`[rules]\` in your wrangler.toml"`
				);
				expect(std.out).toMatchInlineSnapshot(`
			          "
			          [32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/workers-sdk/issues/new/choose[0m"
		        `);
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
				});
				mockSubDomainRequest();
				await runWrangler("publish index.js --config ./path/to/wrangler.toml");
				expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Your worker has access to the following bindings:
			- Data Blobs:
			  - TESTDATABLOBNAME: path/to/and/the/path/to/data.bin
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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

				await runWrangler("publish index.js");
				expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Your worker has access to the following bindings:
			- Vars:
			  - text: \\"plain ol' string\\"
			  - count: 1
			  - complex: {
			 \\"enabled\\": true,
			 \\"id\\": 123
			}
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
		`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});

			it("should read vars passed as cli arguments", async () => {
				writeWranglerToml();
				writeWorkerSource();
				mockSubDomainRequest();
				mockUploadWorkerRequest();
				await runWrangler("publish index.js --var TEXT:sometext --var COUNT:1");
				expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "Total Upload: xx KiB / gzip: xx KiB
			Your worker has access to the following bindings:
			- Vars:
			  - TEXT: \\"(hidden)\\"
			  - COUNT: \\"(hidden)\\"
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class",
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

				await runWrangler("publish index.js");
				expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Your worker has access to the following bindings:
			- R2 Buckets:
			  - FOO: foo-bucket
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
		`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});
		});

		describe("[logfwdr]", () => {
			it("should support logfwdr bindings", async () => {
				fs.writeFileSync("./message.capnp.compiled", "compiled capnp messages");

				writeWranglerToml({
					logfwdr: {
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

				await runWrangler("publish index.js");
				expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Your worker has access to the following bindings:
			- logfwdr:
			  - httplogs: httplogs
			  - trace: trace
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
		`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
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

				await runWrangler("publish index.js");
				expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Your worker has access to the following bindings:
			- Durable Objects:
			  - EXAMPLE_DO_BINDING: ExampleDurableObject
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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
				});

				await runWrangler("publish index.js");
				expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Your worker has access to the following bindings:
			- Durable Objects:
			  - EXAMPLE_DO_BINDING: ExampleDurableObject (defined in example-do-binding-worker)
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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

				await runWrangler("publish index.js");
				expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Your worker has access to the following bindings:
			- Durable Objects:
			  - EXAMPLE_DO_BINDING: ExampleDurableObject
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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

				await runWrangler("publish index.js --outdir tmp --dry-run");
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
				expect(std.warn).toMatchInlineSnapshot(`
			"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

			    - D1 Bindings are currently in alpha to allow the API to evolve before general availability.
			      Please report any issues to [4mhttps://github.com/cloudflare/workers-sdk/issues/new/choose[0m
			      Note: Run this command with the environment variable NO_D1_WARNING=true to hide this message

			      For example: \`export NO_D1_WARNING=true && wrangler <YOUR COMMAND HERE>\`

			"
		`);
				const output = fs.readFileSync("tmp/index.js", "utf-8");
				expect(output).toContain(
					`var ExampleDurableObject2 = maskDurableObjectDefinition(ExampleDurableObject);`
				);
				expect(output).toContain(
					`ExampleDurableObject2 as ExampleDurableObject,`
				);
				expect(output).toContain(`shim_default as default`);
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

				await expect(runWrangler("publish index.js")).rejects
					.toThrowErrorMatchingInlineSnapshot(`
			                              "You seem to be trying to use Durable Objects in a Worker written as a service-worker.
			                              You can use Durable Objects defined in other Workers by specifying a \`script_name\` in your wrangler.toml, where \`script_name\` is the name of the Worker that implements that Durable Object. For example:
			                              { name = EXAMPLE_DO_BINDING, class_name = ExampleDurableObject } ==> { name = EXAMPLE_DO_BINDING, class_name = ExampleDurableObject, script_name = example-do-binding-worker }
			                              Alternatively, migrate your worker to ES Module syntax to implement a Durable Object in this Worker:
			                              https://developers.cloudflare.com/workers/learning/migrating-to-module-workers/"
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

				await runWrangler("publish index.js");
				expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Your worker has access to the following bindings:
			- Services:
			  - FOO: foo-service - production
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
		`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`
			"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

			    - \\"services\\" fields are experimental and may change or break at any time.

			"
		`);
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

				await runWrangler("publish index.js");
				expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Your worker has access to the following bindings:
			- Analytics Engine Datasets:
			  - FOO: foo-dataset
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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
				await runWrangler("publish index.js");
				expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Your worker has access to the following bindings:
			- dispatch namespaces:
			  - foo: Foo
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
		`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});
		});

		describe("[unsafe]", () => {
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

				await runWrangler("publish index.js");
				expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Your worker has access to the following bindings:
			- Unsafe:
			  - binding-type: my-binding
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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

				await runWrangler("publish index.js");
				expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Your worker has access to the following bindings:
			- Unsafe:
			  - plain_text: my-binding
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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
			});
			await runWrangler("publish index.js");
			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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
			await runWrangler("publish index.js");
			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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
			await runWrangler("publish index.js");
			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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
			await runWrangler("publish index.js");
			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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
				await runWrangler("publish index.js");
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
				await runWrangler("publish index.js");
			} catch (e) {
				err = e as Error;
			}
			expect(err?.message).toMatch(
				`The file ./other.other matched a module rule in your configuration ({"type":"Text","globs":["**/*.other"]}), but was ignored because a previous rule with the same type was not marked as \`fallthrough = true\`.`
			);
			// and the warnings because fallthrough was not explicitly set
			expect(std.warn).toMatchInlineSnapshot(`
			        "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe module rule at position 1 ({\\"type\\":\\"Text\\",\\"globs\\":[\\"**/*.other\\"]}) has the same type as a previous rule (at position 0, {\\"type\\":\\"Text\\",\\"globs\\":[\\"**/*.file\\"]}). This rule will be ignored. To the previous rule, add \`fallthrough = true\` to allow this one to also be used, or \`fallthrough = false\` to silence this warning.[0m


			        [33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe default module rule {\\"type\\":\\"Text\\",\\"globs\\":[\\"**/*.txt\\",\\"**/*.html\\"]} has the same type as a previous rule (at position 0, {\\"type\\":\\"Text\\",\\"globs\\":[\\"**/*.file\\"]}). This rule will be ignored. To the previous rule, add \`fallthrough = true\` to allow the default one to also be used, or \`fallthrough = false\` to silence this warning.[0m

			        "
		      `);
		});

		describe("inject process.env.NODE_ENV", () => {
			let actualProcessEnvNodeEnv: string | undefined;
			beforeEach(() => {
				actualProcessEnvNodeEnv = process.env.NODE_ENV;
				process.env.NODE_ENV = "some-node-env";
			});
			afterEach(() => {
				process.env.NODE_ENV = actualProcessEnvNodeEnv;
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
				await runWrangler("publish index.js");
				expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
		`);
				expect(std.err).toMatchInlineSnapshot(`""`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});
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
			await runWrangler("publish index.js");
			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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
			await runWrangler("publish index.js");
			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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
			await runWrangler("publish index.js");
			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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
				"publish index.js --compatibility-date 2022-03-17 --name test-name"
			);
			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
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
			await runWrangler("publish index.ts");
			expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class",
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
			await runWrangler("publish index.js"); // this would throw if we tried to compile with es5
			expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class",
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
			await runWrangler("publish index.js --outdir some-dir");
			expect(fs.existsSync("some-dir/index.js")).toBe(true);
			expect(fs.existsSync("some-dir/index.js.map")).toBe(true);
			expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class",
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
			await runWrangler("publish index.js --outdir some-dir --assets assets");
			expect(fs.existsSync("some-dir/index.js")).toBe(true);
			expect(fs.existsSync("some-dir/index.js.map")).toBe(true);
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
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe --assets argument is experimental and may change or break at any time[0m

			",
			}
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
			await runWrangler("publish index.js --outdir some-dir");

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
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class",
			  "warn": "",
			}
		`);
		});
	});

	describe("--dry-run", () => {
		it("should not publish the worker if --dry-run is specified", async () => {
			writeWranglerToml({
				// add a durable object with migrations
				// to make sure we _don't_ fetch migration status
				durable_objects: {
					bindings: [{ name: "NAME", class_name: "SomeClass" }],
				},
				migrations: [{ tag: "v1", new_classes: ["SomeClass"] }],
			});
			writeWorkerSource();
			process.env.CLOUDFLARE_ACCOUNT_ID = "";
			await runWrangler("publish index.js --dry-run");
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
			await runWrangler("publish index.js --node-compat --dry-run");
			expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "Total Upload: xx KiB / gzip: xx KiB
			--dry-run: exiting now.",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mEnabling Node.js compatibility mode for built-ins and globals. This is experimental and has serious tradeoffs. Please see https://github.com/ionic-team/rollup-plugin-node-polyfills/ for more details.[0m

			",
			}
		`);
		});

		it("should recommend node compatibility mode when using node builtins and node-compat isn't enabled", async () => {
			writeWranglerToml();
			fs.writeFileSync(
				"index.js",
				`
      import path from 'path';
      console.log(path.join("some/path/to", "a/file.txt"));
      export default {}
      `
			);
			let err: esbuild.BuildFailure | undefined;
			try {
				await runWrangler("publish index.js --dry-run"); // expecting this to throw, as node compatibility isn't enabled
			} catch (e) {
				err = e as esbuild.BuildFailure;
			}
			expect(
				esbuild.formatMessagesSync(err?.errors ?? [], { kind: "error" }).join()
			).toMatch(
				/The package "path" wasn't found on the file system but is built into node\.\s+Add "node_compat = true" to your wrangler\.toml file to enable Node.js compatibility\./
			);
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
			await runWrangler("publish index.js --node-compat --dry-run"); // this would throw if node compatibility didn't exist
			expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "Total Upload: xx KiB / gzip: xx KiB
			--dry-run: exiting now.",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mEnabling Node.js compatibility mode for built-ins and globals. This is experimental and has serious tradeoffs. Please see https://github.com/ionic-team/rollup-plugin-node-polyfills/ for more details.[0m

			",
			}
		`);
		});
	});

	describe("`nodejs_compat` compatibility flag", () => {
		it('when absent, should error on any "external" `node:*` imports', async () => {
			writeWranglerToml();
			fs.writeFileSync(
				"index.js",
				`
      import AsyncHooks from 'node:async_hooks';
      console.log(AsyncHooks);
      export default {}
      `
			);
			let err: esbuild.BuildFailure | undefined;
			try {
				await runWrangler("publish index.js --dry-run"); // expecting this to throw, as node compatibility isn't enabled
			} catch (e) {
				err = e as esbuild.BuildFailure;
			}
			expect(
				esbuild.formatMessagesSync(err?.errors ?? [], { kind: "error" }).join()
			).toMatch(/Could not resolve "node:async_hooks"/);
		});

		it('when present, should support any "external" `node:*` imports', async () => {
			writeWranglerToml();
			fs.writeFileSync(
				"index.js",
				`
      import AsyncHooks from 'node:async_hooks';
      console.log(AsyncHooks);
      export default {}
      `
			);

			await runWrangler(
				"publish index.js --dry-run --outdir=dist --compatibility-flag=nodejs_compat"
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
				`import AsyncHooks from "node:async_hooks";`
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
					"publish index.js --dry-run --outdir=dist --compatibility-flag=nodejs_compat --node-compat"
				)
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`"The \`nodejs_compat\` compatibility flag cannot be used in conjunction with the legacy \`--node-compat\` flag. If you want to use the Workers runtime Node.js compatibility features, please remove the \`--node-compat\` argument from your CLI command or \`node_compat = true\` from your config file."`
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
			await runWrangler("publish");

			expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class",
			  "warn": "",
			}
		`);
		});

		it("should print the bundle size, with API errors", async () => {
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			// Override PUT call to error out from previous helper functions
			msw.use(
				rest.put(
					"*/accounts/:accountId/workers/scripts/:scriptName",
					(_, res, ctx) => {
						return res(
							ctx.json(
								createFetchResult(null, false, [
									{
										code: 11337,
										message:
											"Script startup timed out. This could be due to script exceeding size limits or expensive code in the global scope.",
									},
								])
							)
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

			await expect(runWrangler("publish")).rejects.toMatchInlineSnapshot(
				`[ParseError: A request to the Cloudflare API (/accounts/some-account-id/workers/scripts/test-name) failed.]`
			);
			expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "Total Upload: xx KiB / gzip: xx KiB

			[31mX [41;31m[[41;97mERROR[41;31m][0m [1mA request to the Cloudflare API (/accounts/some-account-id/workers/scripts/test-name) failed.[0m

			  Script startup timed out. This could be due to script exceeding size limits or expensive code in
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
			// Override PUT call to error out from previous helper functions
			msw.use(
				rest.put(
					"*/accounts/:accountId/workers/scripts/:scriptName",
					(req, res, ctx) => {
						return res(
							ctx.json(
								createFetchResult({}, false, [
									{
										code: 10027,
										message: "workers.api.error.script_too_large",
									},
								])
							)
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

			await expect(runWrangler("publish")).rejects.toMatchInlineSnapshot(
				`[ParseError: A request to the Cloudflare API (/accounts/some-account-id/workers/scripts/test-name) failed.]`
			);

			expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "Total Upload: xx KiB / gzip: xx KiB

			[31mX [41;31m[[41;97mERROR[41;31m][0m [1mA request to the Cloudflare API (/accounts/some-account-id/workers/scripts/test-name) failed.[0m

			  workers.api.error.script_too_large [code: 10027]

			  If you think this is a bug, please open an issue at:
			  [4mhttps://github.com/cloudflare/workers-sdk/issues/new/choose[0m

			",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mHere are the 2 largest dependencies included in your script:[0m

			  - index.js - xx KiB
			  - dependency.js - xx KiB
			  If these are unnecessary, consider removing them

			",
			}
		`);
		});

		test("should offer some helpful advice when upload fails with script startup error", async () => {
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			// Override PUT call to error out from previous helper functions
			msw.use(
				rest.put(
					"*/accounts/:accountId/workers/scripts/:scriptName",
					(req, res, ctx) => {
						return res(
							ctx.json(
								createFetchResult({}, false, [
									{
										code: 10021,
										message: "Error: Script startup exceeded CPU time limit.",
									},
								])
							)
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

			await expect(runWrangler("publish")).rejects.toMatchInlineSnapshot(
				`[ParseError: A request to the Cloudflare API (/accounts/some-account-id/workers/scripts/test-name) failed.]`
			);
			expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "Total Upload: xx KiB / gzip: xx KiB

			[31mX [41;31m[[41;97mERROR[41;31m][0m [1mA request to the Cloudflare API (/accounts/some-account-id/workers/scripts/test-name) failed.[0m

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

			test("should print the bundle size and warn about large scripts when > 1MiB", async () => {
				const bigModule = Buffer.alloc(10_000_000);
				randomFillSync(bigModule);
				await printBundleSize({ name: "index.js", content: "" }, [
					{ name: "index.js", content: bigModule, type: "buffer" },
				]);

				expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "Total Upload: xx KiB / gzip: xx KiB",
			  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mWe recommend keeping your script less than 1MiB (1024 KiB) after gzip. Exceeding past this can affect cold start time[0m

			",
			}
		`);
			});

			test("should not warn about bundle sizes when NO_SCRIPT_SIZE_WARNING is set", async () => {
				const previousValue = process.env.NO_SCRIPT_SIZE_WARNING;
				process.env.NO_SCRIPT_SIZE_WARNING = "true";

				const bigModule = Buffer.alloc(10_000_000);
				randomFillSync(bigModule);
				await printBundleSize({ name: "index.js", content: "" }, [
					{ name: "index.js", content: bigModule, type: "buffer" },
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

				process.env.NO_SCRIPT_SIZE_WARNING = previousValue;
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
			await runWrangler("publish index.js --no-bundle --dry-run --outdir dist");
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
			await runWrangler("publish index.js --dry-run --outdir dist");
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
				"publish index.js --no-bundle --minify --dry-run --outdir dist"
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
			await runWrangler("publish index.js --dry-run --outdir dist");
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
				"publish index.js --no-bundle --node-compat --dry-run --outdir dist"
			);
			expect(std.warn).toMatchInlineSnapshot(`
			"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mEnabling Node.js compatibility mode for built-ins and globals. This is experimental and has serious tradeoffs. Please see https://github.com/ionic-team/rollup-plugin-node-polyfills/ for more details.[0m


			[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1m\`--node-compat\` and \`--no-bundle\` can't be used together. If you want to polyfill Node.js built-ins and disable Wrangler's bundling, please polyfill as part of your own bundling process.[0m

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
			await runWrangler("publish index.js --dry-run --outdir dist");
			expect(std.warn).toMatchInlineSnapshot(`
			"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mEnabling Node.js compatibility mode for built-ins and globals. This is experimental and has serious tradeoffs. Please see https://github.com/ionic-team/rollup-plugin-node-polyfills/ for more details.[0m


			[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1m\`--node-compat\` and \`--no-bundle\` can't be used together. If you want to polyfill Node.js built-ins and disable Wrangler's bundling, please polyfill as part of your own bundling process.[0m

			"
		`);
		});
	});

	it("should not publish if there's any other kind of error when checking deployment source", async () => {
		writeWorkerSource();
		writeWranglerToml();
		mockSubDomainRequest();
		mockUploadWorkerRequest();

		msw.use(
			rest.get(
				"*/accounts/:accountId/workers/services/:scriptName",
				(_, res, ctx) => {
					return res(
						ctx.json(
							createFetchResult(null, false, [
								{ code: 10000, message: "Authentication error" },
							])
						)
					);
				}
			),
			rest.get(
				"*/accounts/:accountId/workers/deployments/by-script/:scriptTag",
				(_, res, ctx) => {
					return res(
						ctx.json(
							createFetchResult({
								latest: { number: "2" },
							})
						)
					);
				}
			)
		);

		await runWrangler("publish index.js");
		expect(std.err).toContain(
			`A request to the Cloudflare API (/accounts/some-account-id/workers/services/test-name) failed`
		);
	});

	describe("queues", () => {
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
						queue_name: "queue1",
					},
				],
			});
			mockGetQueue("queue1");

			await runWrangler("publish index.js");
			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Your worker has access to the following bindings:
			- Queues:
			  - QUEUE_ONE: queue1
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
		`);
		});

		it("should update queue consumers on publish", async () => {
			writeWranglerToml({
				queues: {
					consumers: [
						{
							queue: "queue1",
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
			mockGetQueue("queue1");
			mockPutQueueConsumer("queue1", "test-name", {
				dead_letter_queue: "myDLQ",
				settings: {
					batch_size: 5,
					max_retries: 10,
					max_wait_time_ms: 3000,
				},
			});
			await runWrangler("publish index.js");
			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			  Consumer for queue1
			Current Deployment ID: Galaxy-Class"
		`);
		});

		it("should support queue consumer concurrency with a max concurrency specified", async () => {
			writeWranglerToml({
				queues: {
					consumers: [
						{
							queue: "queue1",
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
			mockGetQueue("queue1");
			mockPutQueueConsumer("queue1", "test-name", {
				dead_letter_queue: "myDLQ",
				settings: {
					batch_size: 5,
					max_retries: 10,
					max_wait_time_ms: 3000,
					max_concurrency: 5,
				},
			});
			await runWrangler("publish index.js");
			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			  Consumer for queue1
			Current Deployment ID: Galaxy-Class"
		`);
		});

		it("should support queue consumer concurrency with a null max concurrency", async () => {
			writeWranglerToml({
				queues: {
					consumers: [
						{
							queue: "queue1",
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
			mockGetQueue("queue1");
			mockPutQueueConsumer("queue1", "test-name", {
				dead_letter_queue: "myDLQ",
				settings: {
					batch_size: 5,
					max_retries: 10,
					max_wait_time_ms: 3000,
				},
			});
			await runWrangler("publish index.js");
			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			  Consumer for queue1
			Current Deployment ID: Galaxy-Class"
		`);
		});

		it("consumer should error when a queue doesn't exist", async () => {
			writeWranglerToml({
				queues: {
					producers: [],
					consumers: [
						{
							queue: "queue1",
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
			mockGetQueueMissing("queue1");

			await expect(
				runWrangler("publish index.js")
			).rejects.toMatchInlineSnapshot(
				`[Error: Queue "queue1" does not exist. To create it, run: wrangler queues create queue1]`
			);
		});

		it("producer should error when a queue doesn't exist", async () => {
			writeWranglerToml({
				queues: {
					producers: [{ queue: "queue1", binding: "QUEUE_ONE" }],
					consumers: [],
				},
			});
			await fs.promises.writeFile("index.js", `export default {};`);
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			mockGetQueueMissing("queue1");

			await expect(
				runWrangler("publish index.js")
			).rejects.toMatchInlineSnapshot(
				`[Error: Queue "queue1" does not exist. To create it, run: wrangler queues create queue1]`
			);
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

			await runWrangler("publish index.js");
			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Your worker has access to the following bindings:
			- mTLS Certificates:
			  - CERT_ONE: 1234
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
		`);
		});
	});

	describe("--keep-vars", () => {
		it("should send keepVars when keep-vars is passed in", async () => {
			process.env = {
				CLOUDFLARE_API_TOKEN: "hunter2",
				CLOUDFLARE_ACCOUNT_ID: "some-account-id",
			};
			setIsTTY(false);
			writeWranglerToml();
			writeWorkerSource();
			mockSubDomainRequest();
			mockUploadWorkerRequest({ keepVars: true });
			mockOAuthServerCallback();
			mockGetMemberships([]);

			await runWrangler("publish index.js --keep-vars");

			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
		`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should not send keepVars by default", async () => {
			process.env = {
				CLOUDFLARE_API_TOKEN: "hunter2",
				CLOUDFLARE_ACCOUNT_ID: "some-account-id",
			};
			setIsTTY(false);
			writeWranglerToml();
			writeWorkerSource();
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			mockOAuthServerCallback();
			mockGetMemberships([]);

			await runWrangler("publish index.js");

			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
		`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should send keepVars when `keep_vars = true`", async () => {
			process.env = {
				CLOUDFLARE_API_TOKEN: "hunter2",
				CLOUDFLARE_ACCOUNT_ID: "some-account-id",
			};
			setIsTTY(false);
			writeWranglerToml({
				keep_vars: true,
			});
			writeWorkerSource();
			mockSubDomainRequest();
			mockUploadWorkerRequest({ keepVars: true });
			mockOAuthServerCallback();
			mockGetMemberships([]);

			await runWrangler("publish index.js");

			expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded test-name (TIMINGS)
			Published test-name (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Deployment ID: Galaxy-Class"
		`);
			expect(std.err).toMatchInlineSnapshot(`""`);
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

/** Create a mock handler for the request to upload a worker script. */
function mockUploadWorkerRequest(
	options: {
		available_on_subdomain?: boolean;
		expectedEntry?: string | RegExp;
		expectedMainModule?: string;
		expectedType?: "esm" | "sw";
		expectedBindings?: unknown;
		expectedModules?: Record<string, string>;
		expectedCompatibilityDate?: string;
		expectedCompatibilityFlags?: string[];
		expectedMigrations?: CfWorkerInit["migrations"];
		expectedUnsafeMetaData?: Record<string, string>;
		env?: string;
		legacyEnv?: boolean;
		keepVars?: boolean;
		tag?: string;
	} = {}
) {
	const {
		available_on_subdomain = true,
		expectedEntry,
		expectedMainModule = "index.js",
		expectedType = "esm",
		expectedBindings,
		expectedModules = {},
		expectedCompatibilityDate,
		expectedCompatibilityFlags,
		env = undefined,
		legacyEnv = false,
		expectedMigrations,
		expectedUnsafeMetaData,
		keepVars,
	} = options;
	if (env && !legacyEnv) {
		msw.use(
			rest.put(
				"*/accounts/:accountId/workers/services/:scriptName/environments/:envName",
				handleUpload
			)
		);
	} else {
		msw.use(
			rest.put(
				"*/accounts/:accountId/workers/scripts/:scriptName",
				handleUpload
			)
		);
	}

	async function handleUpload(
		req: RestRequest,
		res: ResponseComposition,
		ctx: RestContext
	) {
		expect(req.params.accountId).toEqual("some-account-id");
		expect(req.params.scriptName).toEqual(
			legacyEnv && env ? `test-name-${env}` : "test-name"
		);
		if (!legacyEnv) {
			expect(req.params.envName).toEqual(env);
		}
		expect(req.url.searchParams.get("include_subdomain_availability")).toEqual(
			"true"
		);
		expect(req.url.searchParams.get("excludeScript")).toEqual("true");

		const formBody = await (
			req as MockedRequest as RestRequestWithFormData
		).formData();
		if (expectedEntry !== undefined) {
			expect(formBody.get("index.js")).toMatch(expectedEntry);
		}
		const metadata = JSON.parse(
			formBody.get("metadata") as string
		) as WorkerMetadata;
		if (expectedType === "esm") {
			expect(metadata.main_module).toEqual(expectedMainModule);
		} else {
			expect(metadata.body_part).toEqual("index.js");
		}

		if (keepVars) {
			expect(metadata.keep_bindings).toEqual(["plain_text", "json"]);
		} else {
			expect(metadata.keep_bindings).toBeFalsy();
		}

		if ("expectedBindings" in options) {
			expect(metadata.bindings).toEqual(expectedBindings);
		}
		if ("expectedCompatibilityDate" in options) {
			expect(metadata.compatibility_date).toEqual(expectedCompatibilityDate);
		}
		if ("expectedCompatibilityFlags" in options) {
			expect(metadata.compatibility_flags).toEqual(expectedCompatibilityFlags);
		}
		if ("expectedMigrations" in options) {
			expect(metadata.migrations).toEqual(expectedMigrations);
		}
		if (expectedUnsafeMetaData !== undefined) {
			Object.keys(expectedUnsafeMetaData).forEach((key) => {
				expect(metadata[key]).toEqual(expectedUnsafeMetaData[key]);
			});
		}
		for (const [name, content] of Object.entries(expectedModules)) {
			expect(formBody.get(name)).toEqual(content);
		}

		return res(
			ctx.json(
				createFetchResult({
					available_on_subdomain,
					id: "abc12345",
					etag: "etag98765",
					pipeline_hash: "hash9999",
					tag: "sample-tag",
					deployment_id: "Galaxy-Class",
				})
			)
		);
	}
}

/** Create a mock handler for the request to get the account's subdomain. */
function mockSubDomainRequest(
	subdomain = "test-sub-domain",
	registeredWorkersDev = true
) {
	if (registeredWorkersDev) {
		msw.use(
			rest.get("*/accounts/:accountId/workers/subdomain", (req, res, ctx) => {
				return res.once(ctx.json(createFetchResult({ subdomain })));
			})
		);
	} else {
		msw.use(
			rest.get("*/accounts/:accountId/workers/subdomain", (req, res, ctx) => {
				return res.once(
					ctx.json(
						createFetchResult(null, false, [
							{ code: 10007, message: "haven't registered workers.dev" },
						])
					)
				);
			})
		);
	}
}
//
//
//
//
//
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
		rest.post(
			`*/accounts/:accountId/workers/${servicesOrScripts}/:scriptName${environment}/subdomain`,
			async (req, res, ctx) => {
				expect(req.params.accountId).toEqual("some-account-id");
				expect(req.params.scriptName).toEqual(
					legacyEnv && env ? `test-name-${env}` : "test-name"
				);
				if (!legacyEnv) {
					expect(req.params.envName).toEqual(env);
				}
				const body = await req.json();
				expect(body).toEqual({ enabled });
				return res.once(ctx.json(createFetchResult(null)));
			}
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
		rest.put(
			`*/accounts/:accountId/workers/${servicesOrScripts}/:scriptName${environment}/routes`,
			async (req, res, ctx) => {
				expect(req.params.accountId).toEqual("some-account-id");
				expect(req.params.scriptName).toEqual(
					legacyEnv && env ? `test-name-${env}` : "test-name"
				);
				if (!legacyEnv) {
					expect(req.params.envName).toEqual(env);
				}
				const body = await req.json();
				expect(body).toEqual(
					routes.map((route) =>
						typeof route !== "object" ? { pattern: route } : route
					)
				);
				return res.once(ctx.json(createFetchResult(null)));
			}
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
		rest.put(
			`*/accounts/:accountId/workers/${servicesOrScripts}/:scriptName${environment}/routes`,
			(req, res, ctx) => {
				return res.once(
					ctx.json(
						createFetchResult(null, false, [
							{ message: "Authentication error", code: 10000 },
						])
					)
				);
			}
		)
	);
}

function mockPublishRoutesFallbackRequest(route: {
	pattern: string;
	script: string;
}) {
	msw.use(
		rest.post(`*/zones/:zoneId/workers/routes`, async (req, res, ctx) => {
			const body = await req.json();
			expect(body).toEqual(route);
			return res.once(ctx.json(createFetchResult(route.pattern)));
		})
	);
}

function mockCustomDomainLookup(origin: CustomDomain) {
	msw.use(
		rest.get(
			`*/accounts/:accountId/workers/domains/records/:domainTag`,

			(req, res, ctx) => {
				expect(req.params.accountId).toEqual("some-account-id");
				expect(req.params.domainTag).toEqual(origin.id);

				return res.once(ctx.json(createFetchResult(origin)));
			}
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
		rest.post(
			`*/accounts/:accountId/workers/${servicesOrScripts}/:scriptName${environment}/domains/changeset`,
			async (req, res, ctx) => {
				expect(req.params.accountId).toEqual("some-account-id");
				expect(req.params.scriptName).toEqual(
					legacyEnv && env ? `test-name-${env}` : "test-name"
				);
				if (!legacyEnv) {
					expect(req.params.envName).toEqual(env);
				}

				const domains: Array<
					{ hostname: string } & ({ zone_id?: string } | { zone_name?: string })
				> = await req.json();

				const changeset: CustomDomainChangeset = {
					added: domains.map((domain) => {
						return {
							...domain,
							id: "",
							service: req.params.scriptName as string,
							environment: req.params.envName as string,
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

				return res.once(ctx.json(createFetchResult(changeset)));
			}
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
		rest.put(
			`*/accounts/:accountId/workers/${servicesOrScripts}/:scriptName${environment}/domains/records`,
			async (req, res, ctx) => {
				expect(req.params.accountId).toEqual("some-account-id");
				expect(req.params.scriptName).toEqual(
					legacyEnv && env ? `test-name-${env}` : "test-name"
				);
				if (!legacyEnv) {
					expect(req.params.envName).toEqual(env);
				}
				const body = await req.json();
				expect(body).toEqual({
					...publishFlags,
					origins: domains,
				});

				return res.once(ctx.json(createFetchResult(null)));
			}
		)
	);
}

/** Create a mock handler for the request to get a list of all KV namespaces. */
function mockListKVNamespacesRequest(...namespaces: KVNamespaceInfo[]) {
	msw.use(
		rest.get("*/accounts/:accountId/storage/kv/namespaces", (req, res, ctx) => {
			expect(req.params.accountId).toEqual("some-account-id");
			return res.once(ctx.json(createFetchResult(namespaces)));
		})
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
		rest.put(
			"*/accounts/:accountId/storage/kv/namespaces/:namespaceId/bulk",
			async (req, res, ctx) => {
				expect(req.params.accountId).toEqual("some-account-id");
				expect(req.params.namespaceId).toEqual(expectedNamespaceId);
				const uploads = await req.json();
				if (assets) {
					expect(assets.length).toEqual(uploads.length);
					for (let i = 0; i < uploads.length; i++) {
						checkAssetUpload(assets[i], uploads[i]);
					}
				}

				requests.push({ uploads });
				return res(ctx.json(createFetchResult([])));
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
		rest.delete(
			"*/accounts/:accountId/storage/kv/namespaces/:namespaceId/bulk",
			async (req, res, ctx) => {
				expect(req.params.accountId).toEqual("some-account-id");
				expect(req.params.namespaceId).toEqual(expectedNamespaceId);
				const deletes = await req.json();
				expect(assets).toEqual(deletes);
				return res.once(
					ctx.json({
						success: true,
						errors: [],
						messages: [],
						result: null,
					})
				);
			}
		)
	);
}

type LegacyScriptInfo = { id: string; migration_tag?: string };

function mockLegacyScriptData(options: { scripts: LegacyScriptInfo[] }) {
	const { scripts } = options;
	msw.use(
		rest.get("*/accounts/:accountId/workers/scripts", (req, res, ctx) => {
			expect(req.params.accountId).toEqual("some-account-id");
			return res.once(
				ctx.json({
					success: true,
					errors: [],
					messages: [],
					result: scripts,
				})
			);
		})
	);
}

type DurableScriptInfo = { id: string; migration_tag?: string };

function mockServiceScriptData(options: {
	script?: DurableScriptInfo;
	scriptName?: string;
	env?: string;
}) {
	const { script } = options;
	if (options.env) {
		if (!script) {
			msw.use(
				rest.get(
					"*/accounts/:accountId/workers/services/:scriptName/environments/:envName",
					(_, res, ctx) => {
						return res.once(
							ctx.json({
								success: false,
								errors: [
									{
										code: 10092,
										message: "workers.api.error.environment_not_found",
									},
								],
								messages: [],
								result: null,
							})
						);
					}
				)
			);
			return;
		}
		msw.use(
			rest.get(
				"*/accounts/:accountId/workers/services/:scriptName/environments/:envName",
				(req, res, ctx) => {
					expect(req.params.accountId).toEqual("some-account-id");
					expect(req.params.scriptName).toEqual(
						options.scriptName || "test-name"
					);
					expect(req.params.envName).toEqual(options.env);
					return res.once(
						ctx.json({
							success: true,
							errors: [],
							messages: [],
							result: { script },
						})
					);
				}
			)
		);
	} else {
		if (!script) {
			msw.use(
				rest.get(
					"*/accounts/:accountId/workers/services/:scriptName",
					(req, res, ctx) => {
						return res.once(
							ctx.json({
								success: false,
								errors: [
									{
										code: 10090,
										message: "workers.api.error.service_not_found",
									},
								],
								messages: [],
								result: null,
							})
						);
					}
				)
			);
			return;
		}
		msw.use(
			rest.get(
				"*/accounts/:accountId/workers/services/:scriptName",
				(req, res, ctx) => {
					expect(req.params.accountId).toEqual("some-account-id");
					expect(req.params.scriptName).toEqual(
						options.scriptName || "test-name"
					);
					return res.once(
						ctx.json({
							success: true,
							errors: [],
							messages: [],
							result: { default_environment: { script } },
						})
					);
				}
			)
		);
	}
}

function mockGetQueue(expectedQueueName: string) {
	const requests = { count: 0 };
	msw.use(
		rest.get(
			`*/accounts/:accountId/workers/queues/${expectedQueueName}`,
			(req, res, ctx) => {
				expect(req.params.accountId).toEqual("some-account-id");
				requests.count += 1;
				return res(
					ctx.json({
						success: true,
						errors: [],
						messages: [],
						result: { queue: expectedQueueName },
					})
				);
			}
		)
	);
	return requests;
}

function mockGetQueueMissing(expectedQueueName: string) {
	const requests = { count: 0 };
	msw.use(
		rest.get(
			`*/accounts/:accountId/workers/queues/${expectedQueueName}`,
			(req, res, ctx) => {
				requests.count += 1;
				expect(req.params.accountId).toEqual("some-account-id");

				return res(
					ctx.json({
						success: false,
						errors: [
							{
								code: 11000,
								message: "workers.api.error.queue_not_found",
							},
						],
						messages: [],
						result: null,
					})
				);
			}
		)
	);
	return requests;
}

function mockPutQueueConsumer(
	expectedQueueName: string,
	expectedConsumerName: string,
	expectedBody: PutConsumerBody
) {
	const requests = { count: 0 };
	msw.use(
		rest.put(
			`*/accounts/:accountId/workers/queues/${expectedQueueName}/consumers/${expectedConsumerName}`,
			async (req, res, ctx) => {
				const body = await req.json();
				expect(req.params.accountId).toEqual("some-account-id");
				expect(body).toEqual(expectedBody);
				requests.count += 1;
				return res(
					ctx.json({
						success: true,
						errors: [],
						messages: [],
						result: { queue: expectedQueueName },
					})
				);
			}
		)
	);
	return requests;
}

// MSW FormData & Blob polyfills to test FormData requests
function mockFormDataToString(this: FormData) {
	const entries = [];
	for (const [key, value] of this.entries()) {
		if (value instanceof Blob) {
			const reader = new FileReaderSync();
			reader.readAsText(value);
			const result = reader.result;
			entries.push([key, result]);
		} else {
			entries.push([key, value]);
		}
	}
	return JSON.stringify({
		__formdata: entries,
	});
}

async function mockFormDataFromString(this: MockedRequest): Promise<FormData> {
	const { __formdata } = await this.json();
	expect(__formdata).toBeInstanceOf(Array);

	const form = new FormData();
	for (const [key, value] of __formdata) {
		form.set(key, value);
	}
	return form;
}

// The following two functions workaround the fact that MSW does not yet support FormData in requests.
// We use the fact that MSW relies upon `node-fetch` internally, which will call `toString()` on the FormData object,
// rather than passing it through or serializing it as a proper FormData object.
// The hack is to serialize FormData to a JSON string by overriding `FormData.toString()`.
// And then to deserialize back to a FormData object by monkey-patching a `formData()` helper onto `MockedRequest`.
FormData.prototype.toString = mockFormDataToString;
export interface RestRequestWithFormData extends MockedRequest, RestRequest {
	formData(): Promise<FormData>;
}
(MockedRequest.prototype as RestRequestWithFormData).formData =
	mockFormDataFromString;
