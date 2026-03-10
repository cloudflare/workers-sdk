/* eslint-disable workers-sdk/no-vitest-import-expect */

import { writeWranglerConfig } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getInstalledPackageVersion } from "../../autoconfig/frameworks/utils/packages";
import { clearOutputFilePath } from "../../output";
import { getSubdomainValues } from "../../triggers/deploy";
import { fetchSecrets } from "../../utils/fetch-secrets";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { clearDialogs, mockConfirm } from "../helpers/mock-dialogs";
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
import { writeWorkerSource } from "../helpers/write-worker-source";
import {
	mockDeploymentsListRequest,
	mockLastDeploymentRequest,
	mockPatchScriptSettings,
	mockPublishRoutesRequest,
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

	describe("workers_dev defaults", () => {
		const tests = [
			// workers_dev
			{
				name: "workers_dev=undefined, routes empty",
				config_workers_dev: undefined,
				config_preview_urls: false,
				config_routes: [],
				expected: {
					workers_dev: true,
					preview_urls: false,
				},
			},
			{
				name: "workers_dev=undefined, routes populated",
				config_workers_dev: undefined,
				config_preview_urls: false,
				config_routes: ["https://example.com/*"],
				expected: {
					workers_dev: false,
					preview_urls: false,
				},
			},
			{
				name: "workers_dev override, routes empty",
				config_workers_dev: false,
				config_preview_urls: false,
				config_routes: [],
				expected: {
					workers_dev: false,
					preview_urls: false,
				},
			},
			{
				name: "workers_dev override, routes populated",
				config_workers_dev: true,
				config_preview_urls: false,
				config_routes: ["https://example.com/*"],
				expected: {
					workers_dev: true,
					preview_urls: false,
				},
			},
			// preview_urls
			{
				name: "preview_urls=undefined, workers_dev=default=true",
				config_workers_dev: undefined,
				config_preview_urls: undefined,
				config_routes: [],
				expected: {
					workers_dev: true,
					preview_urls: undefined,
				},
			},
			{
				name: "preview_urls=undefined, workers_dev=default=false",
				config_workers_dev: undefined,
				config_preview_urls: undefined,
				config_routes: ["https://example.com/*"],
				expected: {
					workers_dev: false,
					preview_urls: undefined,
				},
			},
			{
				name: "preview_urls=undefined, workers_dev=explicit=true",
				config_workers_dev: true,
				config_preview_urls: undefined,
				config_routes: ["https://example.com/*"],
				expected: {
					workers_dev: true,
					preview_urls: undefined,
				},
			},
			{
				name: "preview_urls override",
				config_workers_dev: true,
				config_preview_urls: false,
				config_routes: ["https://example.com/*"],
				expected: {
					workers_dev: true,
					preview_urls: false,
				},
			},
		];
		it.each(tests)(
			"$name",
			async ({
				config_workers_dev,
				config_preview_urls,
				config_routes,
				expected,
			}) => {
				const result = getSubdomainValues(
					config_workers_dev,
					config_preview_urls,
					config_routes
				);
				expect(result).toEqual(expected);
			}
		);
	});
	describe("workers_dev setting", () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it("should include Cloudflare-Workers-Script-Api-Date header", async () => {
			writeWranglerConfig();
			writeWorkerSource();
			mockUploadWorkerRequest();
			mockGetWorkerSubdomain({ enabled: false });
			mockSubDomainRequest();
			msw.use(
				http.post(
					`*/accounts/:accountId/workers/scripts/:scriptName/subdomain`,
					async ({ request, params }) => {
						expect(params.accountId).toEqual("some-account-id");
						expect(params.scriptName).toEqual("test-name");
						expect(
							request.headers.get("Cloudflare-Workers-Script-Api-Date")
						).toEqual("2025-08-01");
						return HttpResponse.json(
							createFetchResult({ enabled: true, previews_enabled: false })
						);
					},
					{ once: true }
				)
			);

			await runWrangler("deploy ./index");

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

		it("should deploy to a workers.dev domain if workers_dev is undefined", async () => {
			writeWranglerConfig();
			writeWorkerSource();
			mockUploadWorkerRequest();
			mockGetWorkerSubdomain({ enabled: false });
			mockSubDomainRequest();
			mockUpdateWorkerSubdomain({ enabled: true });

			await runWrangler("deploy ./index");

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

		it("should deploy successfully if the /subdomain POST request is flaky", async () => {
			writeWranglerConfig();
			writeWorkerSource();
			mockUploadWorkerRequest();
			mockGetWorkerSubdomain({ enabled: false });
			mockSubDomainRequest();
			mockUpdateWorkerSubdomain({ enabled: true, flakeCount: 1 });

			await runWrangler("deploy ./index");

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

		it("should deploy to the workers.dev domain if workers_dev is `true`", async () => {
			writeWranglerConfig({
				workers_dev: true,
			});
			writeWorkerSource();
			mockUploadWorkerRequest();
			mockSubDomainRequest();
			mockGetWorkerSubdomain({ enabled: false });
			mockUpdateWorkerSubdomain({ enabled: true });

			await runWrangler("deploy ./index");

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

		it("should not try to enable the workers.dev domain if it has been enabled before and previews are in sync", async () => {
			writeWranglerConfig({
				workers_dev: true,
			});
			writeWorkerSource();
			mockUploadWorkerRequest();
			mockGetWorkerSubdomain({ enabled: true });
			mockSubDomainRequest();

			await runWrangler("deploy ./index");

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

		it("should sync the workers.dev domain if it has been enabled before but previews should be enabled", async () => {
			writeWranglerConfig({
				workers_dev: true,
			});
			writeWorkerSource();
			mockUploadWorkerRequest();
			mockGetWorkerSubdomain({ enabled: true, previews_enabled: false });
			mockSubDomainRequest();
			mockUpdateWorkerSubdomain({ enabled: true });

			await runWrangler("deploy ./index");

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

		it("should sync the workers.dev domain if it has been enabled before but previews should be enabled", async () => {
			writeWranglerConfig({
				workers_dev: true,
				preview_urls: false,
			});
			writeWorkerSource();
			mockUploadWorkerRequest();
			mockGetWorkerSubdomain({ enabled: true, previews_enabled: true });
			mockSubDomainRequest();
			mockUpdateWorkerSubdomain({ enabled: true, previews_enabled: false });

			await runWrangler("deploy ./index");

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

		it("should disable the workers.dev domain if workers_dev is `false`", async () => {
			writeWranglerConfig({
				workers_dev: false,
			});
			writeWorkerSource();
			mockUploadWorkerRequest();
			mockGetWorkerSubdomain({ enabled: true });
			mockUpdateWorkerSubdomain({ enabled: false });

			await runWrangler("deploy ./index");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				No deploy targets for test-name (TIMINGS)
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should not try to disable the workers.dev domain if it is not already available and previews are in sync", async () => {
			writeWranglerConfig({
				workers_dev: false,
			});
			writeWorkerSource();
			mockUploadWorkerRequest();
			mockGetWorkerSubdomain({ enabled: false });

			// note the lack of a mock for the subdomain disable request

			await runWrangler("deploy ./index");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				No deploy targets for test-name (TIMINGS)
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should sync the workers.dev domain if it is not available but previews should be enabled", async () => {
			writeWranglerConfig({
				workers_dev: false,
			});
			writeWorkerSource();
			mockUploadWorkerRequest();
			mockGetWorkerSubdomain({ enabled: false, previews_enabled: false });
			mockUpdateWorkerSubdomain({ enabled: false });

			await runWrangler("deploy ./index");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				No deploy targets for test-name (TIMINGS)
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should sync the workers.dev domain if it is not available but previews should be disabled", async () => {
			writeWranglerConfig({
				workers_dev: false,
				preview_urls: false,
			});
			writeWorkerSource();
			mockUploadWorkerRequest();
			mockGetWorkerSubdomain({ enabled: false, previews_enabled: true });
			mockUpdateWorkerSubdomain({ enabled: false, previews_enabled: false });

			await runWrangler("deploy ./index");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				No deploy targets for test-name (TIMINGS)
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should disable the workers.dev domain if workers_dev is undefined but overwritten to `false` in environment", async () => {
			writeWranglerConfig({
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
			mockGetWorkerSubdomain({ enabled: true, env: "dev" });
			mockUpdateWorkerSubdomain({ enabled: false, env: "dev" });

			await runWrangler("deploy ./index --env dev --legacy-env false");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (dev) (TIMINGS)
				No deploy targets for test-name (dev) (TIMINGS)
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should disable the workers.dev domain if workers_dev is `true` but overwritten to `false` in environment", async () => {
			writeWranglerConfig({
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
			mockGetWorkerSubdomain({ enabled: true, env: "dev" });
			mockUpdateWorkerSubdomain({ enabled: false, env: "dev" });

			await runWrangler("deploy ./index --env dev --legacy-env false");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (dev) (TIMINGS)
				No deploy targets for test-name (dev) (TIMINGS)
				Current Version ID: undefined"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should deploy to a workers.dev domain if workers_dev is undefined but overwritten to `true` in environment", async () => {
			writeWranglerConfig({
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
			mockGetWorkerSubdomain({ enabled: false, env: "dev" });
			mockSubDomainRequest();
			mockUpdateWorkerSubdomain({ enabled: true, env: "dev" });

			await runWrangler("deploy ./index --env dev --legacy-env false");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (dev) (TIMINGS)
				Deployed test-name (dev) triggers (TIMINGS)
				  https://dev.test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should deploy to a workers.dev domain if workers_dev is `false` but overwritten to `true` in environment", async () => {
			writeWranglerConfig({
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
			mockGetWorkerSubdomain({ enabled: false, env: "dev" });
			mockSubDomainRequest();
			mockUpdateWorkerSubdomain({ enabled: true, env: "dev" });

			await runWrangler("deploy ./index --env dev --legacy-env false");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (dev) (TIMINGS)
				Deployed test-name (dev) triggers (TIMINGS)
				  https://dev.test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should use the global compatibility_date and compatibility_flags if they are not overwritten by the environment", async () => {
			writeWranglerConfig({
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
			mockGetWorkerSubdomain({ enabled: true, env: "dev" });

			await runWrangler("deploy ./index --env dev --legacy-env false");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (dev) (TIMINGS)
				Deployed test-name (dev) triggers (TIMINGS)
				  https://dev.test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should use the environment specific compatibility_date and compatibility_flags", async () => {
			writeWranglerConfig({
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
			mockGetWorkerSubdomain({ enabled: true, env: "dev" });
			mockSubDomainRequest();

			await runWrangler("deploy ./index --env dev --legacy-env false");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (dev) (TIMINGS)
				Deployed test-name (dev) triggers (TIMINGS)
				  https://dev.test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should use the command line --compatibility-date and --compatibility-flags if they are specified", async () => {
			writeWranglerConfig({
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
			mockGetWorkerSubdomain({ enabled: true, env: "dev" });
			mockSubDomainRequest();

			await runWrangler(
				"deploy ./index --env dev --legacy-env false --compatibility-date 2022-01-14 --compatibility-flags url_standard"
			);

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
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
				"A compatibility_date is required when publishing. Add the following to your Wrangler configuration file:
				    \`\`\`
				    {"compatibility_date":"XXXX-XX-XX"}
				    \`\`\`
				    Or you could pass it in your terminal as \`--compatibility-date XXXX-XX-XX\`
				See https://developers.cloudflare.com/workers/platform/compatibility-dates for more information."
			`);
		});

		it("should error if a compatibility_date is missing and suggest the correct date", async () => {
			vi.setSystemTime(new Date(2020, 11, 1));

			writeWorkerSource();

			await expect(
				async () => await runWrangler("deploy ./index.js --name my-worker")
			).rejects.toThrowErrorMatchingInlineSnapshot(`
				[Error: A compatibility_date is required when publishing. Add the following to your Wrangler configuration file:
				    \`\`\`
				    {"compatibility_date":"2020-12-01"}
				    \`\`\`
				    Or you could pass it in your terminal as \`--compatibility-date 2020-12-01\`
				See https://developers.cloudflare.com/workers/platform/compatibility-dates for more information.]
			`);
		});

		it("should enable the workers.dev domain if workers_dev is undefined and subdomain is not already available", async () => {
			writeWranglerConfig();
			writeWorkerSource();
			mockUploadWorkerRequest();
			mockGetWorkerSubdomain({ enabled: false });
			mockSubDomainRequest();
			mockUpdateWorkerSubdomain({ enabled: true });

			await runWrangler("deploy ./index");

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

		it("should enable the workers.dev domain if workers_dev is true and subdomain is not already available", async () => {
			writeWranglerConfig({ workers_dev: true });
			writeWorkerSource();
			mockUploadWorkerRequest();
			mockGetWorkerSubdomain({ enabled: false });
			mockSubDomainRequest();
			mockUpdateWorkerSubdomain({ enabled: true });

			await runWrangler("deploy ./index");

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

		it("should fail to deploy to the workers.dev domain if email is unverified", async () => {
			writeWranglerConfig({ workers_dev: true });
			writeWorkerSource();
			mockUploadWorkerRequest();
			mockGetWorkerSubdomain({ enabled: false });
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
			writeWranglerConfig({
				workers_dev: true,
			});
			writeWorkerSource();
			mockUploadWorkerRequest();
			mockGetWorkerSubdomain({ enabled: false });
			mockSubDomainRequest("does-not-exist", false);

			mockConfirm({
				text: "Would you like to register a workers.dev subdomain now?",
				result: false,
			});

			await expect(runWrangler("deploy ./index")).rejects
				.toThrowErrorMatchingInlineSnapshot(`
				[Error: You can either deploy your worker to one or more routes by specifying them in your wrangler.toml file, or register a workers.dev subdomain here:
				https://dash.cloudflare.com/some-account-id/workers/onboarding]
			`);
		});

		it("should not deploy to workers.dev if there are any routes defined", async () => {
			writeWranglerConfig({
				routes: ["http://example.com/*"],
			});
			writeWorkerSource();
			mockUploadWorkerRequest();
			mockGetWorkerSubdomain({ enabled: false });
			// no set-subdomain call
			mockGetZones("example.com", [{ id: "example-id" }]);
			mockGetZoneWorkerRoutes("example-id");
			mockPublishRoutesRequest({ routes: ["http://example.com/*"] });
			await runWrangler("deploy index.js");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
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
			writeWranglerConfig({
				routes: ["http://example.com/*"],
				env: {
					production: {
						routes: ["http://production.example.com/*"],
					},
				},
			});
			writeWorkerSource();
			mockUploadWorkerRequest({
				env: "production",
				useServiceEnvironments: false,
			});
			mockGetWorkerSubdomain({
				enabled: false,
				env: "production",
				useServiceEnvironments: false,
			});
			mockGetZones("production.example.com", [{ id: "example-id" }]);
			mockGetZoneWorkerRoutes("example-id");
			mockPublishRoutesRequest({
				routes: ["http://production.example.com/*"],
				env: "production",
				useServiceEnvironments: false,
			});
			await runWrangler("deploy index.js --env production");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
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
			writeWranglerConfig({
				env: {
					production: {
						routes: ["http://production.example.com/*"],
					},
				},
			});
			writeWorkerSource();
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				env: "production",
				useServiceEnvironments: false,
			});
			mockGetWorkerSubdomain({
				enabled: false,
				env: "production",
				useServiceEnvironments: false,
			});
			mockGetZones("production.example.com", [{ id: "example-id" }]);
			mockGetZoneWorkerRoutes("example-id");
			mockPublishRoutesRequest({
				routes: ["http://production.example.com/*"],
				env: "production",
				useServiceEnvironments: false,
			});
			await runWrangler("deploy index.js --env production");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name-production (TIMINGS)
				Deployed test-name-production triggers (TIMINGS)
				  http://production.example.com/*
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("can deploy to both workers.dev and routes if both defined", async () => {
			writeWranglerConfig({
				workers_dev: true,
				routes: ["http://example.com/*"],
			});
			writeWorkerSource();
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			mockGetWorkerSubdomain({
				enabled: false,
				previews_enabled: true,
			});
			mockUpdateWorkerSubdomain({
				enabled: true,
			});
			mockPublishRoutesRequest({
				routes: ["http://example.com/*"],
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
				  http://example.com/*
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("can deploy to both workers.dev and routes if both defined (environments: 1)", async () => {
			writeWranglerConfig({
				workers_dev: true,
				env: {
					production: {
						routes: ["http://production.example.com/*"],
					},
				},
			});
			writeWorkerSource();
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				env: "production",
				useServiceEnvironments: false,
			});
			mockGetWorkerSubdomain({
				enabled: false,
				previews_enabled: true,
				env: "production",
				useServiceEnvironments: false,
			});
			mockUpdateWorkerSubdomain({
				enabled: true,
				env: "production",
				useServiceEnvironments: false,
			});
			mockPublishRoutesRequest({
				routes: ["http://production.example.com/*"],
				env: "production",
				useServiceEnvironments: false,
			});
			await runWrangler("deploy index.js --env production");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
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
			writeWranglerConfig({
				env: {
					production: {
						workers_dev: true,
						routes: ["http://production.example.com/*"],
					},
				},
			});
			writeWorkerSource();
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				env: "production",
				useServiceEnvironments: false,
			});
			mockGetWorkerSubdomain({
				enabled: false,
				previews_enabled: true,
				env: "production",
				useServiceEnvironments: false,
			});
			mockUpdateWorkerSubdomain({
				enabled: true,
				env: "production",
				useServiceEnvironments: false,
			});
			mockPublishRoutesRequest({
				routes: ["http://production.example.com/*"],
				env: "production",
				useServiceEnvironments: false,
			});
			await runWrangler("deploy index.js --env production");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
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
			writeWranglerConfig({
				workers_dev: false,
				env: {
					production: {
						routes: ["http://production.example.com/*"],
					},
				},
			});
			writeWorkerSource();
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				env: "production",
				useServiceEnvironments: false,
			});
			mockGetWorkerSubdomain({
				enabled: false,
				env: "production",
				useServiceEnvironments: false,
			});
			mockGetZones("production.example.com", [{ id: "example-id" }]);
			mockGetZoneWorkerRoutes("example-id");
			mockPublishRoutesRequest({
				routes: ["http://production.example.com/*"],
				env: "production",
				useServiceEnvironments: false,
			});
			await runWrangler("deploy index.js --env production");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
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
			writeWranglerConfig({
				env: {
					production: {
						workers_dev: false,
						routes: ["http://production.example.com/*"],
					},
				},
			});
			writeWorkerSource();
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				env: "production",
				useServiceEnvironments: false,
			});
			mockGetWorkerSubdomain({
				enabled: false,
				env: "production",
				useServiceEnvironments: false,
			});
			mockGetZones("production.example.com", [{ id: "example-id" }]);
			mockGetZoneWorkerRoutes("example-id");
			mockPublishRoutesRequest({
				routes: ["http://production.example.com/*"],
				env: "production",
				useServiceEnvironments: false,
			});
			await runWrangler("deploy index.js --env production");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name-production (TIMINGS)
				Deployed test-name-production triggers (TIMINGS)
				  http://production.example.com/*
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("should warn the user if workers_dev default is different from remote", async () => {
			writeWranglerConfig({}); // Default workers_dev should be true, since there's no routes.
			writeWorkerSource();
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			mockGetWorkerSubdomain({ enabled: false, previews_enabled: true });
			mockUpdateWorkerSubdomain({ enabled: true });
			await runWrangler("deploy ./index");

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
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mBecause 'workers_dev' is not in your Wrangler file, it will be enabled for this deployment by default.[0m

				  To override this setting, you can disable workers.dev by explicitly setting 'workers_dev = false'
				  in your Wrangler file.

				"
			`);
		});

		it("should warn the user if preview_urls default is different from remote", async () => {
			writeWranglerConfig({}); // Default preview_urls should be same as workers_dev (i.e. true).
			writeWorkerSource();
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			mockGetWorkerSubdomain({ enabled: true, previews_enabled: false });
			mockUpdateWorkerSubdomain({ enabled: true });
			await runWrangler("deploy ./index");

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
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mBecause your 'workers.dev' route is enabled and your 'preview_urls' setting is not in your Wrangler file, Preview URLs will be enabled for this deployment by default.[0m

				  To override this setting, you can disable Preview URLs by explicitly setting 'preview_urls =
				  false' in your Wrangler file.

				"
			`);
		});
	});
	describe("workers_dev mixed state warnings", () => {
		beforeEach(() => {
			vi.stubEnv("WRANGLER_DISABLE_SUBDOMAIN_MIXED_STATE_CHECK", "false");
		});

		afterEach(() => {
			vi.unstubAllEnvs();
		});

		it("should not warn when config is the same as remote", async () => {
			writeWranglerConfig({
				workers_dev: false,
				preview_urls: true,
			});
			writeWorkerSource();
			mockSubDomainRequest("test-sub-domain", true, false);
			mockUploadWorkerRequest();
			mockGetWorkerSubdomain({ enabled: false, previews_enabled: true });
			await runWrangler("deploy ./index");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				No deploy targets for test-name (TIMINGS)
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("should not warn when workers_dev=false,preview_urls=false", async () => {
			writeWranglerConfig({
				workers_dev: false,
				preview_urls: false,
			});
			writeWorkerSource();
			mockSubDomainRequest("test-sub-domain", true, false);
			mockUploadWorkerRequest();
			mockGetWorkerSubdomain({ enabled: true, previews_enabled: true });
			mockUpdateWorkerSubdomain({ enabled: false, previews_enabled: false });
			await runWrangler("deploy ./index");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				No deploy targets for test-name (TIMINGS)
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("should not warn when workers_dev=true,preview_urls=true", async () => {
			writeWranglerConfig({
				workers_dev: true,
				preview_urls: true,
			});
			writeWorkerSource();
			mockSubDomainRequest("test-sub-domain", true, false);
			mockUploadWorkerRequest();
			mockGetWorkerSubdomain({ enabled: false, previews_enabled: false });
			mockUpdateWorkerSubdomain({ enabled: true, previews_enabled: true });
			await runWrangler("deploy ./index");

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

		it("should warn when workers_dev=false,preview_urls=true", async () => {
			writeWranglerConfig({
				workers_dev: false,
				preview_urls: true,
			});
			writeWorkerSource();
			mockSubDomainRequest("test-sub-domain", true, false);
			mockUploadWorkerRequest();
			mockGetWorkerSubdomain({ enabled: true, previews_enabled: true });
			mockUpdateWorkerSubdomain({ enabled: false, previews_enabled: true });
			await runWrangler("deploy ./index");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				No deploy targets for test-name (TIMINGS)
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mYou are disabling the 'workers.dev' subdomain for this Worker, but Preview URLs are still enabled.[0m

				  Preview URLs will automatically generate a unique, shareable link for each new version which will
				  be accessible at:
				    [4mhttps://<VERSION_PREFIX>-test-name.test-sub-domain.workers.dev[0m

				  To prevent this Worker from being unintentionally public, you may want to disable the Preview URLs
				  as well by setting \`preview_urls = false\` in your Wrangler config file.

				"
			`);
		});

		it("should warn when workers_dev=true,preview_urls=false", async () => {
			writeWranglerConfig({
				workers_dev: true,
				preview_urls: false,
			});
			writeWorkerSource();
			mockSubDomainRequest("test-sub-domain", true, false);
			mockUploadWorkerRequest();
			mockGetWorkerSubdomain({ enabled: false, previews_enabled: false });
			mockUpdateWorkerSubdomain({ enabled: true, previews_enabled: false });
			await runWrangler("deploy ./index");

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
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mYou are enabling the 'workers.dev' subdomain for this Worker, but Preview URLs are still disabled.[0m

				  Preview URLs will automatically generate a unique, shareable link for each new version which will
				  be accessible at:
				    [4mhttps://<VERSION_PREFIX>-test-name.test-sub-domain.workers.dev[0m

				  You may want to enable the Preview URLs as well by setting \`preview_urls = true\` in your Wrangler
				  config file.

				"
			`);
		});
	});
});
