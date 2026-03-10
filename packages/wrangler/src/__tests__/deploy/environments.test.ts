/* eslint-disable workers-sdk/no-vitest-import-expect */

import * as fs from "node:fs";
import {
	writeRedirectedWranglerConfig,
	writeWranglerConfig,
} from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, test, vi } from "vitest";
import { getInstalledPackageVersion } from "../../autoconfig/frameworks/utils/packages";
import { clearOutputFilePath } from "../../output";
import { fetchSecrets } from "../../utils/fetch-secrets";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { clearDialogs } from "../helpers/mock-dialogs";
import { useMockIsTTY } from "../helpers/mock-istty";
import { mockGetMemberships, mockOAuthFlow } from "../helpers/mock-oauth-flow";
import { mockUploadWorkerRequest } from "../helpers/mock-upload-worker";
import { mockGetSettings } from "../helpers/mock-worker-settings";
import {
	mockGetWorkerSubdomain,
	mockSubDomainRequest,
} from "../helpers/mock-workers-subdomain";
import { createFetchResult, msw } from "../helpers/msw";
import { mswListNewDeploymentsLatestFull } from "../helpers/msw/handlers/versions";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import { writeWorkerSource } from "../helpers/write-worker-source";
import {
	mockDeploymentsListRequest,
	mockGetScriptWithTags,
	mockLastDeploymentRequest,
	mockPatchScriptSettings,
} from "./helpers";

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
	const { mockOAuthServerCallback } = mockOAuthFlow();

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

	describe("--dry-run", () => {
		it("should not deploy the worker if --dry-run is specified", async () => {
			writeWranglerConfig({
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
				{
				  "debug": "",
				  "err": "",
				  "info": "",
				  "out": "
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Your Worker has access to the following bindings:
				Binding                   Resource
				env.NAME (SomeClass)      Durable Object

				--dry-run: exiting now.",
				  "warn": "",
				}
			`);
		});
	});
	describe("--keep-vars", () => {
		it("should send keepVars when keep-vars is passed in", async () => {
			vi.stubEnv("CLOUDFLARE_API_TOKEN", "hunter2");
			vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "some-account-id");
			setIsTTY(false);
			writeWranglerConfig();
			writeWorkerSource();
			mockSubDomainRequest();
			mockUploadWorkerRequest({ keepVars: true, keepSecrets: true });
			mockOAuthServerCallback();
			mockGetMemberships([]);

			await runWrangler("deploy index.js --keep-vars");

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

		it("should not send keepVars by default", async () => {
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

		it("should send keepVars when `keep_vars = true`", async () => {
			vi.stubEnv("CLOUDFLARE_API_TOKEN", "hunter2");
			vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "some-account-id");
			setIsTTY(false);
			writeWranglerConfig({
				keep_vars: true,
			});
			writeWorkerSource();
			mockSubDomainRequest();
			mockUploadWorkerRequest({ keepVars: true, keepSecrets: true });
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
	});
	describe("--dispatch-namespace", () => {
		it("should upload to dispatch namespace", async () => {
			writeWranglerConfig();
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
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				  Dispatch Namespace: test-dispatch-namespace
				Current Version ID: undefined"
			`);
		});
	});
	describe("[observability]", () => {
		it("should allow uploading workers with observability", async () => {
			writeWranglerConfig({
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
		});

		it("should allow uploading workers with nested observability logs setting", async () => {
			writeWranglerConfig({
				observability: {
					enabled: true,
					head_sampling_rate: 0.5,
					logs: {
						enabled: true,
						head_sampling_rate: 0.3,
						destinations: ["cloudflare", "foo"],
						persist: false,
						invocation_logs: false,
					},
				},
			});
			await fs.promises.writeFile("index.js", `export default {};`);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedObservability: {
					enabled: true,
					head_sampling_rate: 0.5,
					logs: {
						enabled: true,
						head_sampling_rate: 0.3,
						destinations: ["cloudflare", "foo"],
						persist: false,
						invocation_logs: false,
					},
				},
			});

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
		});

		it("should allow uploading workers with nested observability traces setting", async () => {
			writeWranglerConfig({
				observability: {
					enabled: true,
					head_sampling_rate: 0.5,
					traces: {
						enabled: true,
						head_sampling_rate: 0.3,
						destinations: ["cloudflare", "foo"],
						persist: false,
					},
				},
			});
			await fs.promises.writeFile("index.js", `export default {};`);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedObservability: {
					enabled: true,
					head_sampling_rate: 0.5,
					traces: {
						enabled: true,
						head_sampling_rate: 0.3,
						destinations: ["cloudflare", "foo"],
						persist: false,
					},
				},
			});

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
		});

		it("should disable observability if not explicitly defined", async () => {
			writeWranglerConfig({});
			await fs.promises.writeFile("index.js", `export default {};`);
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedSettingsPatch: {
					observability: {
						enabled: false,
					},
				},
			});

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
		});
	});
	describe("compliance region support", () => {
		it("should upload to the public region by default", async () => {
			writeWranglerConfig({});
			writeWorkerSource();
			mockUploadWorkerRequest({
				expectedBaseUrl: "api.cloudflare.com",
			});
			mockSubDomainRequest();
			mockGetWorkerSubdomain({ enabled: true });

			await runWrangler("deploy ./index.js");
		});

		it("should upload to the FedRAMP High region if set in config", async () => {
			writeWranglerConfig({
				compliance_region: "fedramp_high",
			});
			writeWorkerSource();
			mockUploadWorkerRequest({
				expectedBaseUrl: "api.fed.cloudflare.com",
			});
			mockSubDomainRequest();
			mockGetWorkerSubdomain({ enabled: true });

			await runWrangler("deploy ./index.js");
		});

		it("should upload to the FedRAMP High region if set in an env var", async () => {
			vi.stubEnv("CLOUDFLARE_COMPLIANCE_REGION", "fedramp_high");
			writeWranglerConfig({});
			writeWorkerSource();
			mockUploadWorkerRequest({
				expectedBaseUrl: "api.fed.cloudflare.com",
			});
			mockSubDomainRequest();
			mockGetWorkerSubdomain({ enabled: true });

			await runWrangler("deploy ./index.js");
		});

		it("should error if the region is set in both env var and configured, and they conflict", async () => {
			vi.stubEnv("CLOUDFLARE_COMPLIANCE_REGION", "public");
			writeWranglerConfig({ compliance_region: "fedramp_high" });
			writeWorkerSource();

			await expect(runWrangler("deploy ./index.js")).rejects
				.toThrowErrorMatchingInlineSnapshot(`
				[Error: The compliance region has been set to different values in two places:
				 - \`CLOUDFLARE_COMPLIANCE_REGION\` environment variable: \`public\`
				 - \`compliance_region\` configuration property: \`fedramp_high\`]
			`);
		});

		it("should not error if the region is set in both env var and configured, and they are the same", async () => {
			vi.stubEnv("CLOUDFLARE_COMPLIANCE_REGION", "fedramp_high");
			writeWranglerConfig({ compliance_region: "fedramp_high" });
			writeWorkerSource();
			mockUploadWorkerRequest({
				expectedBaseUrl: "api.fed.cloudflare.com",
			});
			mockSubDomainRequest();
			mockGetWorkerSubdomain({ enabled: true });

			await runWrangler("deploy ./index.js");
		});
	});
	describe("Service and environment tagging", () => {
		beforeEach(() => {
			msw.resetHandlers();

			mockLastDeploymentRequest();
			mockDeploymentsListRequest();
			msw.use(...mswListNewDeploymentsLatestFull);

			mockSubDomainRequest();
			mockGetSettings();
			writeWorkerSource();
			setIsTTY(false);
		});

		test("has environments, no existing tags, top-level env", async () => {
			mockGetScriptWithTags(null);
			mockUploadWorkerRequest();

			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
				env: {
					production: {},
				},
			});

			const patchScriptSettings = mockPatchScriptSettings();

			await runWrangler("deploy");

			await expect(
				patchScriptSettings.requests[0].json()
			).resolves.toHaveProperty("tags", ["cf:service=test-name"]);
		});

		test("has environments, no existing tags, named env", async () => {
			mockGetScriptWithTags(null);
			mockUploadWorkerRequest({
				env: "production",
				useServiceEnvironments: false,
			});

			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
				env: {
					production: {},
				},
			});

			const patchScriptSettings = mockPatchScriptSettings();

			await runWrangler("deploy --env production");

			await expect(
				patchScriptSettings.requests[0].json()
			).resolves.toHaveProperty("tags", [
				"cf:service=test-name",
				"cf:environment=production",
			]);
		});

		test("has environments, missing tags, top-level env", async () => {
			mockGetScriptWithTags(["some-tag"]);
			mockUploadWorkerRequest();

			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
				env: {
					production: {},
				},
			});

			const patchScriptSettings = mockPatchScriptSettings();

			await runWrangler("deploy");

			await expect(
				patchScriptSettings.requests[0].json()
			).resolves.toHaveProperty("tags", ["some-tag", "cf:service=test-name"]);
		});

		test("has environments, missing tags, named env", async () => {
			mockGetScriptWithTags(["some-tag"]);
			mockUploadWorkerRequest({
				env: "production",
				useServiceEnvironments: false,
			});

			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
				env: {
					production: {},
				},
			});

			const patchScriptSettings = mockPatchScriptSettings();

			await runWrangler("deploy --env production");

			await expect(
				patchScriptSettings.requests[0].json()
			).resolves.toHaveProperty("tags", [
				"some-tag",
				"cf:service=test-name",
				"cf:environment=production",
			]);
		});

		test("has environments, missing environment tag, named env", async () => {
			mockGetScriptWithTags(["some-tag", "cf:service=test-name"]);
			mockUploadWorkerRequest({
				env: "production",
				useServiceEnvironments: false,
			});

			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
				env: {
					production: {},
				},
			});

			const patchScriptSettings = mockPatchScriptSettings();

			await runWrangler("deploy --env production");

			await expect(
				patchScriptSettings.requests[0].json()
			).resolves.toHaveProperty("tags", [
				"some-tag",
				"cf:service=test-name",
				"cf:environment=production",
			]);
		});

		test("has environments, stale service tag, top-level env", async () => {
			mockGetScriptWithTags(["some-tag", "cf:service=some-other-service"]);
			mockUploadWorkerRequest();

			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
				env: {
					production: {},
				},
			});

			const patchScriptSettings = mockPatchScriptSettings();

			await runWrangler("deploy");

			await expect(
				patchScriptSettings.requests[0].json()
			).resolves.toHaveProperty("tags", ["some-tag", "cf:service=test-name"]);
		});

		test("has environments, stale service tag, named env", async () => {
			mockGetScriptWithTags([
				"some-tag",
				"cf:service=some-other-service",
				"cf:environment=production",
			]);
			mockUploadWorkerRequest({
				env: "production",
				useServiceEnvironments: false,
			});

			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
				env: {
					production: {},
				},
			});

			const patchScriptSettings = mockPatchScriptSettings();

			await runWrangler("deploy --env production");

			await expect(
				patchScriptSettings.requests[0].json()
			).resolves.toHaveProperty("tags", [
				"some-tag",
				"cf:service=test-name",
				"cf:environment=production",
			]);
		});

		test("has environments, stale environment tag, top-level env", async () => {
			mockGetScriptWithTags([
				"some-tag",
				"cf:service=test-name",
				"cf:environment=some-other-env",
			]);
			mockUploadWorkerRequest();

			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
				env: {
					production: {},
				},
			});

			const patchScriptSettings = mockPatchScriptSettings();

			await runWrangler("deploy");

			await expect(
				patchScriptSettings.requests[0].json()
			).resolves.toHaveProperty("tags", ["some-tag", "cf:service=test-name"]);
		});

		test("has environments, stale environment tag, named env", async () => {
			mockGetScriptWithTags([
				"some-tag",
				"cf:service=test-name",
				"cf:environment=some-other-env",
			]);
			mockUploadWorkerRequest({
				env: "production",
				useServiceEnvironments: false,
			});

			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
				env: {
					production: {},
				},
			});

			const patchScriptSettings = mockPatchScriptSettings();

			await runWrangler("deploy --env production");

			await expect(
				patchScriptSettings.requests[0].json()
			).resolves.toHaveProperty("tags", [
				"some-tag",
				"cf:service=test-name",
				"cf:environment=production",
			]);
		});

		test("has environments, has expected tags, top-level env", async () => {
			mockGetScriptWithTags(["some-tag", "cf:service=test-name"]);
			mockUploadWorkerRequest();

			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
				env: {
					production: {},
				},
			});

			const patchScriptSettings = mockPatchScriptSettings();

			await runWrangler("deploy");

			await expect(
				patchScriptSettings.requests[0].json()
			).resolves.toHaveProperty("tags", ["some-tag", "cf:service=test-name"]);
		});

		test("has environments, has expected tags, named env", async () => {
			mockGetScriptWithTags([
				"some-tag",
				"cf:service=test-name",
				"cf:environment=production",
			]);
			mockUploadWorkerRequest({
				env: "production",
				useServiceEnvironments: false,
			});

			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
				env: {
					production: {},
				},
			});

			const patchScriptSettings = mockPatchScriptSettings();

			await runWrangler("deploy --env production");

			await expect(
				patchScriptSettings.requests[0].json()
			).resolves.toHaveProperty("tags", [
				"some-tag",
				"cf:service=test-name",
				"cf:environment=production",
			]);
		});

		test("no environments", async () => {
			mockGetScriptWithTags([
				"some-tag",
				"cf:service=some-other-service",
				"cf:environment=some-other-env",
			]);
			mockUploadWorkerRequest();

			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
			});

			const patchScriptSettings = mockPatchScriptSettings();

			await runWrangler("deploy");

			await expect(
				patchScriptSettings.requests[0].json()
			).resolves.toHaveProperty("tags", ["some-tag"]);
		});

		test("no top-level name", async () => {
			mockGetScriptWithTags(["some-tag", "cf:service=undefined"]);
			mockUploadWorkerRequest({
				env: "production",
				useServiceEnvironments: false,
			});

			writeWranglerConfig({
				name: undefined,
				main: "./index.js",
				env: {
					production: {
						name: "test-name-production",
					},
				},
			});

			const patchScriptSettings = mockPatchScriptSettings();

			await runWrangler("deploy --env production");

			await expect(
				patchScriptSettings.requests[0].json()
			).resolves.toHaveProperty("tags", ["some-tag"]);

			expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mNo top-level \`name\` has been defined in Wrangler configuration. Add a top-level \`name\` to group this Worker together with its sibling environments in the Cloudflare dashboard.[0m

				"
			`);
		});

		test("displays warning when error updating tags", async () => {
			mockGetScriptWithTags([
				"some-tag",
				"cf:service=some-other-service",
				"cf:environment=some-other-env",
			]);
			mockUploadWorkerRequest({
				env: "production",
				useServiceEnvironments: false,
			});

			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
				env: {
					production: {},
				},
			});

			msw.use(
				http.patch(
					`*/accounts/:accountId/workers/scripts/:scriptName/script-settings`,
					() => HttpResponse.error()
				)
			);

			await runWrangler("deploy --env production");

			expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mCould not apply service and environment tags. This Worker will not appear grouped together with its sibling environments in the Cloudflare dashboard.[0m

				"
			`);
		});

		test("environments with redirected config", async () => {
			mockGetScriptWithTags(["some-tag"]);
			mockUploadWorkerRequest({
				expectedScriptName: "test-name-production",
			});

			writeWranglerConfig(
				{
					name: "test-name",
					main: "./index.js",
					env: {
						production: {
							name: "test-name-production",
						},
					},
				},
				"./wrangler.toml"
			);

			writeRedirectedWranglerConfig(
				{
					name: "test-name-production",
					main: "../index.js",
					userConfigPath: "./wrangler.toml",
					topLevelName: "test-name",
					targetEnvironment: "production",
					definedEnvironments: ["production"],
				},
				"./dist/wrangler.json"
			);

			const patchScriptSettings = mockPatchScriptSettings();

			await runWrangler("deploy");

			await expect(
				patchScriptSettings.requests[0].json()
			).resolves.toHaveProperty("tags", [
				"some-tag",
				"cf:service=test-name",
				"cf:environment=production",
			]);

			expect(std.info).toMatchInlineSnapshot(`
				"Using redirected Wrangler configuration.
				 - Configuration being used: "dist/wrangler.json"
				 - Original user's configuration: "wrangler.toml"
				 - Deploy configuration file: ".wrangler/deploy/config.json""
			`);
		});
	});
	describe("multi-env warning", () => {
		it("should warn if the wrangler config contains environments but none was specified in the command", async () => {
			writeWorkerSource();
			writeWranglerConfig({
				main: "./index.js",
				env: {
					test: {},
				},
			});
			mockSubDomainRequest();
			mockUploadWorkerRequest();

			await runWrangler("deploy");

			expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mMultiple environments are defined in the Wrangler configuration file, but no target environment was specified for the deploy command.[0m

				  To avoid unintentional changes to the wrong environment, it is recommended to explicitly specify
				  the target environment using the \`-e|--env\` flag.
				  If your intention is to use the top-level environment of your configuration simply pass an empty
				  string to the flag to target such environment. For example \`--env=""\`.

				"
			`);
		});

		it("should not warn if the wrangler config contains environments and one was specified in the command", async () => {
			writeWorkerSource();
			writeWranglerConfig({
				main: "./index.js",
				env: {
					test: {},
				},
			});
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				env: "test",
				useServiceEnvironments: false,
			});

			await runWrangler("deploy -e test");

			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("should not warn if the wrangler config doesn't contain environments and none was specified in the command", async () => {
			writeWorkerSource();
			writeWranglerConfig({
				main: "./index.js",
			});
			mockSubDomainRequest();
			mockUploadWorkerRequest();

			await runWrangler("deploy");

			expect(std.warn).toMatchInlineSnapshot(`""`);
		});
	});
	describe("--tag and --message", () => {
		it("should send tag and message annotations via the new versions API", async () => {
			writeWranglerConfig();
			writeWorkerSource();
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedAnnotations: {
					"workers/message": "my deploy message",
					"workers/tag": "v1.0.0",
				},
				expectedDeploymentMessage: "my deploy message",
			});

			await runWrangler(
				'deploy ./index --tag v1.0.0 --message "my deploy message"'
			);
			expect(std.out).toContain("Uploaded test-name");
			expect(std.out).toContain("Current Version ID: Galaxy-Class");
		});

		it("should send tag and message annotations via the legacy PUT API", async () => {
			writeWranglerConfig();
			writeWorkerSource();
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedAnnotations: {
					"workers/message": "legacy deploy msg",
					"workers/tag": "v2.0.0",
				},
				expectedDispatchNamespace: "test-dispatch-namespace",
			});

			await runWrangler(
				'deploy ./index --dispatch-namespace test-dispatch-namespace --tag v2.0.0 --message "legacy deploy msg"'
			);
			expect(std.out).toContain("Uploaded test-name");
		});

		it("should send only --tag without --message", async () => {
			writeWranglerConfig();
			writeWorkerSource();
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedAnnotations: {
					"workers/message": undefined,
					"workers/tag": "v1.0.0",
				},
				expectedDeploymentMessage: undefined,
			});

			await runWrangler("deploy ./index --tag v1.0.0");
			expect(std.out).toContain("Uploaded test-name");
		});

		it("should send only --message without --tag", async () => {
			writeWranglerConfig();
			writeWorkerSource();
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedAnnotations: {
					"workers/message": "just a message",
					"workers/tag": undefined,
				},
				expectedDeploymentMessage: "just a message",
			});

			await runWrangler('deploy ./index --message "just a message"');
			expect(std.out).toContain("Uploaded test-name");
		});

		it("should not set annotations when neither --tag nor --message is provided", async () => {
			writeWranglerConfig();
			writeWorkerSource();
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedAnnotations: undefined,
			});

			await runWrangler("deploy ./index");
			expect(std.out).toContain("Uploaded test-name");
		});
	});
});
