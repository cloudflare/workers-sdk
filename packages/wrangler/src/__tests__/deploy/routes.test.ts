/* eslint-disable workers-sdk/no-vitest-import-expect */

import { writeWranglerConfig } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getInstalledPackageVersion } from "../../autoconfig/frameworks/utils/packages";
import { clearOutputFilePath } from "../../output";
import { fetchSecrets } from "../../utils/fetch-secrets";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { clearDialogs, mockConfirm } from "../helpers/mock-dialogs";
import {
	mockGetZones,
	mockGetZonesMulti,
} from "../helpers/mock-get-zone-from-host";
import { useMockIsTTY } from "../helpers/mock-istty";
import { mockUploadWorkerRequest } from "../helpers/mock-upload-worker";
import { mockGetSettings } from "../helpers/mock-worker-settings";
import {
	mockGetWorkerSubdomain,
	mockSubDomainRequest,
	mockUpdateWorkerSubdomain,
} from "../helpers/mock-workers-subdomain";
import {
	mockGetZoneWorkerRoutes,
	mockGetZoneWorkerRoutesMulti,
} from "../helpers/mock-zone-routes";
import { createFetchResult, msw } from "../helpers/msw";
import { mswListNewDeploymentsLatestFull } from "../helpers/msw/handlers/versions";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import { writeWorkerSource } from "../helpers/write-worker-source";
import {
	mockAUSRequest,
	mockCustomDomainLookup,
	mockCustomDomainsChangesetRequest,
	mockDeploymentsListRequest,
	mockLastDeploymentRequest,
	mockPatchScriptSettings,
	mockPublishCustomDomainsRequest,
	mockPublishRoutesFallbackRequest,
	mockPublishRoutesRequest,
	mockPublishSchedulesRequest,
	mockServiceScriptData,
	mockUnauthorizedPublishRoutesRequest,
	writeAssets,
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

	describe("routes", () => {
		it("should deploy the worker to a route", async () => {
			writeWranglerConfig({
				routes: ["example.com/some-route/*"],
			});
			writeWorkerSource();
			mockUpdateWorkerSubdomain({ enabled: false });
			mockUploadWorkerRequest({ expectedType: "esm" });
			// These run during route conflict resolution.
			// vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv
			mockGetZones("example.com", [{ id: "example-com-id" }]);
			mockGetZoneWorkerRoutes("example-com-id");
			// ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
			mockPublishRoutesRequest({ routes: ["example.com/some-route/*"] });
			await runWrangler("deploy ./index");
		});

		it("should deploy with an empty string route", async () => {
			writeWranglerConfig({
				route: "",
			});
			writeWorkerSource();
			mockUpdateWorkerSubdomain({ enabled: false });
			mockUploadWorkerRequest({ expectedType: "esm" });
			mockSubDomainRequest();
			mockPublishRoutesRequest({ routes: [] });
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
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class",
				  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

				    - The "route" field in your configuration is an empty string and will be ignored.
				      Please remove the "route" field from your configuration.

				",
				}
			`);
		});
		it("should deploy to a route with a pattern/{zone_id|zone_name} combo", async () => {
			writeWranglerConfig({
				routes: [
					"some-example.com/some-route/*",
					{ pattern: "*a-boring-website.com", zone_id: "a-boring-website-id" },
					{
						pattern: "*another-boring-website.com",
						zone_name: "some-zone.com",
					},
					{ pattern: "example.com/some-route/*", zone_id: "example-com-id" },
					"more-examples.com/*",
				],
			});
			writeWorkerSource();
			mockUpdateWorkerSubdomain({ enabled: false });
			mockUploadWorkerRequest({ expectedType: "esm" });
			// These run during route conflict resolution.
			// vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv
			mockGetZonesMulti({
				"some-example.com": {
					accountId: "some-account-id",
					zones: [{ id: "some-example-com-id" }],
				},
				"a-boring-website.com": {
					accountId: "some-account-id",
					zones: [{ id: "a-boring-website-id" }],
				},
				"another-boring-website.com": {
					accountId: "some-account-id",
					zones: [{ id: "another-boring-website-id" }],
				},
				"some-zone.com": {
					accountId: "some-account-id",
					zones: [{ id: "some-zone-id" }],
				},
				"example.com": {
					accountId: "some-account-id",
					zones: [{ id: "example-com-id" }],
				},
				"more-examples.com": {
					accountId: "some-account-id",
					zones: [{ id: "more-examples-id" }],
				},
			});
			mockGetZoneWorkerRoutesMulti({
				"some-example-com-id": [],
				"a-boring-website-id": [],
				"another-boring-website-id": [],
				"some-zone-id": [],
				"example-com-id": [],
				"more-examples-id": [],
			});
			// ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
			mockPublishRoutesRequest({
				routes: [
					"some-example.com/some-route/*",
					{ pattern: "*a-boring-website.com", zone_id: "a-boring-website-id" },
					{
						pattern: "*another-boring-website.com",
						zone_name: "some-zone.com",
					},
					{ pattern: "example.com/some-route/*", zone_id: "example-com-id" },
					"more-examples.com/*",
				],
			});
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
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  some-example.com/some-route/*
				  *a-boring-website.com (zone id: a-boring-website-id)
				  *another-boring-website.com (zone name: some-zone.com)
				  example.com/some-route/* (zone id: example-com-id)
				  more-examples.com/*
				Current Version ID: Galaxy-Class",
				  "warn": "",
				}
			`);
		});

		it("should deploy to a route with a SaaS domain", async () => {
			writeWranglerConfig({
				workers_dev: false,
				routes: [
					{
						pattern: "partner.com/*",
						zone_name: "owned-zone.com",
					},
				],
			});
			writeWorkerSource();
			mockUploadWorkerRequest();
			mockGetWorkerSubdomain({ enabled: false });
			mockGetZones("owned-zone.com", [{ id: "owned-zone-id-1" }]);
			mockGetZoneWorkerRoutes("owned-zone-id-1");
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
				{
				  "debug": "",
				  "err": "",
				  "info": "",
				  "out": "
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
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
			writeWranglerConfig({
				workers_dev: false,
				routes: [
					{
						pattern: "subdomain.partner.com/*",
						zone_name: "owned-zone.com",
					},
				],
			});
			writeWorkerSource();
			mockUploadWorkerRequest();
			mockGetWorkerSubdomain({ enabled: false });
			mockGetZones("owned-zone.com", [{ id: "owned-zone-id-1" }]);
			mockGetZoneWorkerRoutes("owned-zone-id-1");
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
				{
				  "debug": "",
				  "err": "",
				  "info": "",
				  "out": "
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
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
			writeWranglerConfig({
				env: {
					staging: {
						routes: [
							"some-example.com/some-route/*",
							{
								pattern: "*a-boring-website.com",
								zone_id: "a-boring-website-id",
							},
							{
								pattern: "*another-boring-website.com",
								zone_name: "some-zone.com",
							},
							{
								pattern: "example.com/some-route/*",
								zone_id: "example-com-id",
							},
							"more-examples.com/*",
						],
					},
				},
			});
			mockSubDomainRequest();
			writeWorkerSource();
			mockUpdateWorkerSubdomain({
				enabled: false,
				env: "staging",
				useServiceEnvironments: true,
			});
			mockUploadWorkerRequest({
				expectedType: "esm",
				env: "staging",
				useServiceEnvironments: true,
				useOldUploadApi: true,
			});
			// These run during route conflict resolution.
			// vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv
			mockGetZonesMulti({
				"some-example.com": {
					accountId: "some-account-id",
					zones: [{ id: "some-example-com-id" }],
				},
				"a-boring-website.com": {
					accountId: "some-account-id",
					zones: [{ id: "a-boring-website-id" }],
				},
				"another-boring-website.com": {
					accountId: "some-account-id",
					zones: [{ id: "another-boring-website-id" }],
				},
				"some-zone.com": {
					accountId: "some-account-id",
					zones: [{ id: "some-zone-id" }],
				},
				"example.com": {
					accountId: "some-account-id",
					zones: [{ id: "example-com-id" }],
				},
				"more-examples.com": {
					accountId: "some-account-id",
					zones: [{ id: "more-examples-id" }],
				},
			});
			mockGetZoneWorkerRoutesMulti({
				"some-example-com-id": [],
				"a-boring-website-id": [],
				"another-boring-website-id": [],
				"some-zone-id": [],
				"example-com-id": [],
				"more-examples-id": [],
			});
			// ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
			mockPublishRoutesRequest({
				routes: [
					"some-example.com/some-route/*",
					{ pattern: "*a-boring-website.com", zone_id: "a-boring-website-id" },
					{
						pattern: "*another-boring-website.com",
						zone_name: "some-zone.com",
					},
					{ pattern: "example.com/some-route/*", zone_id: "example-com-id" },
					"more-examples.com/*",
				],
				env: "staging",
				useServiceEnvironments: true,
			});
			await runWrangler("deploy ./index --legacy-env false --env staging");
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
				Uploaded test-name (staging) (TIMINGS)
				Deployed test-name (staging) triggers (TIMINGS)
				  some-example.com/some-route/*
				  *a-boring-website.com (zone id: a-boring-website-id)
				  *another-boring-website.com (zone name: some-zone.com)
				  example.com/some-route/* (zone id: example-com-id)
				  more-examples.com/*
				Current Version ID: Galaxy-Class",
				  "warn": "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

				    - Service environments are deprecated, and will be removed in the future. DO NOT USE IN
				  PRODUCTION.

				",
				}
			`);
		});

		it("should deploy to legacy environment specific routes", async () => {
			writeWranglerConfig({
				routes: ["example.com/some-route/*"],
				env: {
					dev: {
						routes: ["dev-example.com/some-route/*"],
					},
				},
			});
			writeWorkerSource();
			mockUpdateWorkerSubdomain({
				enabled: false,
				useServiceEnvironments: false,
				env: "dev",
			});
			mockUploadWorkerRequest({
				expectedType: "esm",
				useServiceEnvironments: false,
				env: "dev",
			});
			// These run during route conflict resolution.
			// vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv
			mockGetZonesMulti({
				"example.com": {
					accountId: "some-account-id",
					zones: [{ id: "example-com-id" }],
				},
				"dev-example.com": {
					accountId: "some-account-id",
					zones: [{ id: "dev-example-com-id" }],
				},
			});
			mockGetZoneWorkerRoutesMulti({
				"example-com-id": [],
				"dev-example-com-id": [],
			});
			// ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
			mockPublishRoutesRequest({
				routes: ["dev-example.com/some-route/*"],
				useServiceEnvironments: false,
				env: "dev",
			});
			await runWrangler("deploy ./index --env dev --legacy-env true");
		});

		it("services: should deploy to service environment specific routes", async () => {
			writeWranglerConfig({
				routes: ["example.com/some-route/*"],
				env: {
					dev: {
						routes: ["dev-example.com/some-route/*"],
					},
				},
			});
			writeWorkerSource();
			mockUpdateWorkerSubdomain({ enabled: false, env: "dev" });
			mockUploadWorkerRequest({
				expectedType: "esm",
				env: "dev",
			});
			// These run during route conflict resolution.
			// vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv
			mockGetZonesMulti({
				"example.com": {
					accountId: "some-account-id",
					zones: [{ id: "example-com-id" }],
				},
				"dev-example.com": {
					accountId: "some-account-id",
					zones: [{ id: "dev-example-com-id" }],
				},
			});
			mockGetZoneWorkerRoutesMulti({
				"example-com-id": [],
				"dev-example-com-id": [],
			});
			// ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
			mockPublishRoutesRequest({
				routes: ["dev-example.com/some-route/*"],
				env: "dev",
			});
			await runWrangler("deploy ./index --env dev --legacy-env false");
		});

		it("should fallback to the Wrangler v1 zone-based API if the bulk-routes API fails", async () => {
			writeWranglerConfig({
				routes: ["example.com/some-route/*"],
			});
			writeWorkerSource();
			mockUpdateWorkerSubdomain({ enabled: false });
			mockUploadWorkerRequest({ expectedType: "esm" });
			// These run during route conflict resolution.
			// vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv
			mockGetZones("example.com", [{ id: "example-com-id" }]);
			mockGetZoneWorkerRoutes("example-com-id", [
				// Simulate that the worker has already been deployed to another route.
				{
					pattern: "foo.example.com/other-route",
					script: "test-name",
				},
			]);
			// ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
			// Simulate the bulk-routes API failing with a not authorized error.
			mockUnauthorizedPublishRoutesRequest();
			mockPublishRoutesFallbackRequest({
				pattern: "example.com/some-route/*",
				script: "test-name",
			});
			await runWrangler("deploy ./index");

			expect(std.info).toMatchInlineSnapshot(`
				"The current authentication token does not have 'All Zones' permissions.
				Falling back to using the zone-based API endpoint to update each route individually.
				Note that there is no access to routes associated with zones that the API token does not have permission for.
				Existing routes for this Worker in such zones will not be deleted."
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mPreviously deployed routes:[0m

				  The following routes were already associated with this worker, and have not been deleted:
				   - "foo.example.com/other-route"
				  If these routes are not wanted then you can remove them in the dashboard.

				"
			`);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  example.com/some-route/*
				Current Version ID: Galaxy-Class"
			`);
		});

		it("should error if the bulk-routes API fails and trying to push to a non-production environment", async () => {
			writeWranglerConfig({
				routes: ["example.com/some-route/*"],
				legacy_env: false,
			});
			writeWorkerSource();
			mockUploadWorkerRequest({ env: "staging", expectedType: "esm" });
			mockUpdateWorkerSubdomain({ env: "staging", enabled: false });
			// These run during route conflict resolution.
			// vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv
			mockGetZones("example.com", [{ id: "example-com-id" }]);
			mockGetZoneWorkerRoutes("example-com-id", [
				// Simulate that the worker has already been deployed to another route.
				{
					pattern: "foo.example.com/other-route",
					script: "test-name",
				},
			]);
			// ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
			// Simulate the bulk-routes API failing with a not authorized error.
			mockUnauthorizedPublishRoutesRequest({ env: "staging" });
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
				writeWranglerConfig({
					routes: [{ pattern: "api.example.com", custom_domain: true }],
				});
				writeWorkerSource();
				mockUpdateWorkerSubdomain({ enabled: false });
				mockUploadWorkerRequest({ expectedType: "esm" });
				// These run during route conflict resolution.
				// vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv
				mockGetZones("api.example.com", [{ id: "api-example-com-id" }]);
				mockGetZoneWorkerRoutes("api-example-com-id", []);
				// ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
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
				writeWranglerConfig({
					routes: [{ pattern: "api.example.com", custom_domain: true }],
				});
				writeWorkerSource();
				mockUpdateWorkerSubdomain({ enabled: false });
				mockUploadWorkerRequest({ expectedType: "esm" });
				// These run during route conflict resolution.
				// vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv
				mockGetZones("api.example.com", [{ id: "api-example-com-id" }]);
				mockGetZoneWorkerRoutes("api-example-com-id", []);
				// ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
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
				writeWranglerConfig({
					routes: [{ pattern: "api.example.com", custom_domain: true }],
				});
				writeWorkerSource();
				mockUpdateWorkerSubdomain({ enabled: false });
				mockUploadWorkerRequest({ expectedType: "esm" });
				// These run during route conflict resolution.
				// vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv
				mockGetZones("api.example.com", [{ id: "api-example-com-id" }]);
				mockGetZoneWorkerRoutes("api-example-com-id", []);
				// ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
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
				writeWranglerConfig({
					routes: [{ pattern: "api.example.com", custom_domain: true }],
				});
				writeWorkerSource();
				mockUpdateWorkerSubdomain({ enabled: false });
				mockUploadWorkerRequest({ expectedType: "esm" });
				// These run during route conflict resolution.
				// vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv
				mockGetZones("api.example.com", [{ id: "api-example-com-id" }]);
				mockGetZoneWorkerRoutes("api-example-com-id", []);
				// ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
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
				writeWranglerConfig({
					routes: [{ pattern: "*.example.com", custom_domain: true }],
				});
				writeWorkerSource();
				await expect(runWrangler("deploy ./index")).rejects
					.toThrowErrorMatchingInlineSnapshot(`
					[Error: Invalid Routes:
					*.example.com:
					Wildcard operators (*) are not allowed in Custom Domains]
				`);

				writeWranglerConfig({
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
				writeWranglerConfig({
					routes: [{ pattern: "api.example.com", custom_domain: true }],
				});
				writeWorkerSource();
				mockUpdateWorkerSubdomain({ enabled: false });
				mockUploadWorkerRequest({ expectedType: "esm" });
				// These run during route conflict resolution.
				// vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv
				mockGetZones("api.example.com", [{ id: "api-example-com-id" }]);
				mockGetZoneWorkerRoutes("api-example-com-id", []);
				// ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
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
			it("should deploy domains passed via --domain flag as custom domains", async () => {
				writeWranglerConfig({});
				writeWorkerSource();
				mockSubDomainRequest();
				mockUploadWorkerRequest({ expectedType: "esm" });
				mockUpdateWorkerSubdomain({ enabled: false });
				mockCustomDomainsChangesetRequest({});
				mockPublishCustomDomainsRequest({
					publishFlags: {
						override_scope: true,
						override_existing_origin: false,
						override_existing_dns_record: false,
					},
					domains: [{ hostname: "api.example.com" }],
				});

				await runWrangler("deploy ./index --domain api.example.com");
				expect(std.out).toContain("api.example.com (custom domain)");
			});

			it("should deploy multiple domains passed via --domain flags", async () => {
				writeWranglerConfig({});
				writeWorkerSource();
				mockSubDomainRequest();
				mockUploadWorkerRequest({ expectedType: "esm" });
				mockUpdateWorkerSubdomain({ enabled: false });
				mockCustomDomainsChangesetRequest({});
				mockPublishCustomDomainsRequest({
					publishFlags: {
						override_scope: true,
						override_existing_origin: false,
						override_existing_dns_record: false,
					},
					domains: [
						{ hostname: "api.example.com" },
						{ hostname: "app.example.com" },
					],
				});

				await runWrangler(
					"deploy ./index --domain api.example.com --domain app.example.com"
				);
				expect(std.out).toContain("api.example.com (custom domain)");
				expect(std.out).toContain("app.example.com (custom domain)");
			});

			it("should deploy --domain flags alongside routes (from config when no CLI routes)", async () => {
				writeWranglerConfig({
					routes: ["example.com/api/*"],
				});
				writeWorkerSource();
				mockSubDomainRequest();
				mockUpdateWorkerSubdomain({ enabled: false });
				mockUploadWorkerRequest({ expectedType: "esm" });
				// These run during route conflict resolution.
				// vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv
				mockGetZonesMulti({
					"example.com": {
						accountId: "some-account-id",
						zones: [{ id: "example-com-id" }],
					},
					"api.example.com": {
						accountId: "some-account-id",
						zones: [{ id: "api-example-com-id" }],
					},
				});
				mockGetZoneWorkerRoutesMulti({
					"example-com-id": [],
					"api-example-com-id": [],
				});
				// ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
				mockCustomDomainsChangesetRequest({});
				mockPublishCustomDomainsRequest({
					publishFlags: {
						override_scope: true,
						override_existing_origin: false,
						override_existing_dns_record: false,
					},
					domains: [{ hostname: "api.example.com" }],
				});
				// Mock the regular route deployment for the configured route
				msw.use(
					http.put(
						"*/accounts/:accountId/workers/scripts/:scriptName/routes",
						() => {
							return HttpResponse.json(
								{
									success: true,
									errors: [],
									messages: [],
									result: ["example.com/api/*"],
								},
								{ status: 200 }
							);
						},
						{ once: true }
					)
				);

				await runWrangler("deploy ./index --domain api.example.com");
				expect(std.out).toContain("example.com/api/*");
				expect(std.out).toContain("api.example.com (custom domain)");
			});

			it("should validate domain flags and reject invalid domains with wildcards", async () => {
				writeWranglerConfig({});
				writeWorkerSource();

				await expect(runWrangler("deploy ./index --domain *.example.com"))
					.rejects.toThrowErrorMatchingInlineSnapshot(`
					[Error: Invalid Routes:
					*.example.com:
					Wildcard operators (*) are not allowed in Custom Domains]
				`);
			});

			it("should validate domain flags and reject invalid domains with paths", async () => {
				writeWranglerConfig({});
				writeWorkerSource();

				await expect(
					runWrangler("deploy ./index --domain api.example.com/path")
				).rejects.toThrowErrorMatchingInlineSnapshot(`
					[Error: Invalid Routes:
					api.example.com/path:
					Paths are not allowed in Custom Domains]
				`);
			});

			it("should handle both --route and --domain flags together", async () => {
				writeWranglerConfig({
					routes: ["config.com/api/*"],
				});
				writeWorkerSource();
				mockSubDomainRequest();
				mockUpdateWorkerSubdomain({ enabled: false });
				mockUploadWorkerRequest({ expectedType: "esm" });
				// These run during route conflict resolution.
				// vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv
				mockGetZonesMulti({
					"config.com": {
						accountId: "some-account-id",
						zones: [{ id: "config-com-id" }],
					},
					"api.example.com": {
						accountId: "some-account-id",
						zones: [{ id: "api-example-com-id" }],
					},
					"cli.com": {
						accountId: "some-account-id",
						zones: [{ id: "cli-com-id" }],
					},
				});
				mockGetZoneWorkerRoutesMulti({
					"config-com-id": [],
					"api-example-com-id": [],
					"cli-com-id": [],
				});
				// ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
				mockCustomDomainsChangesetRequest({});
				mockPublishCustomDomainsRequest({
					publishFlags: {
						override_scope: true,
						override_existing_origin: false,
						override_existing_dns_record: false,
					},
					domains: [{ hostname: "api.example.com" }],
				});
				// Mock the regular route deployment for the CLI route (should override config)
				msw.use(
					http.put(
						"*/accounts/:accountId/workers/scripts/:scriptName/routes",
						() => {
							return HttpResponse.json(
								{
									success: true,
									errors: [],
									messages: [],
									result: ["cli.com/override/*"],
								},
								{ status: 200 }
							);
						},
						{ once: true }
					)
				);

				await runWrangler(
					"deploy ./index --route cli.com/override/* --domain api.example.com"
				);
				expect(std.out).toContain("cli.com/override/*");
				expect(std.out).toContain("api.example.com (custom domain)");
				expect(std.out).not.toContain("config.com/api/*");
			});
		});

		describe("deploy asset routes", () => {
			it("shouldn't error on routes with paths if there are no assets", async () => {
				writeWranglerConfig({
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

			it("should warn on mounted paths", async () => {
				writeWranglerConfig({
					routes: [
						"simple.co.uk/path/*",
						"simple.co.uk/*",
						"*/*",
						"*/blog/*",
						{ pattern: "example.com/blog/*", zone_id: "example-com-id" },
						{ pattern: "example.com/*", zone_id: "example-com-id" },
						{ pattern: "example.com/abc/def/*", zone_id: "example-com-id" },
					],
				});
				await mockAUSRequest([]);
				mockSubDomainRequest();
				mockUpdateWorkerSubdomain({ enabled: false, previews_enabled: false });
				mockUploadWorkerRequest({
					expectedAssets: {
						jwt: "<<aus-completion-token>>",
						config: {},
					},
					expectedType: "none",
				});
				// These run during route conflict resolution.
				// vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv
				mockGetZonesMulti({
					"simple.co.uk": {
						accountId: "some-account-id",
						zones: [{ id: "simple-co-uk-id" }],
					},
					"example.com": {
						accountId: "some-account-id",
						zones: [{ id: "example-com-id" }],
					},
				});
				mockGetZoneWorkerRoutesMulti({
					"simple-co-uk-id": [],
					"example-com-id": [],
				});
				// ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
				mockPublishRoutesRequest({
					routes: [
						// @ts-expect-error - this is what is expected
						{
							pattern: "simple.co.uk/path/*",
						},
						// @ts-expect-error - this is what is expected
						{
							pattern: "simple.co.uk/*",
						},
						// @ts-expect-error - this is what is expected
						{
							pattern: "*/*",
						},
						// @ts-expect-error - this is what is expected
						{
							pattern: "*/blog/*",
						},
						{
							pattern: "example.com/blog/*",
							zone_id: "example-com-id",
						},
						{
							pattern: "example.com/*",
							zone_id: "example-com-id",
						},
						{
							pattern: "example.com/abc/def/*",
							zone_id: "example-com-id",
						},
					],
				});

				writeWorkerSource();
				writeAssets([{ filePath: "asset.txt", content: "Content of file-1" }]);

				await runWrangler(`deploy --assets assets`);

				expect(std.warn).toMatchInlineSnapshot(`
					"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mWarning: The following routes will attempt to serve Assets on a configured path:[0m

					    • simple.co.uk/path/* (Will match assets: assets/path/*)
					    • */blog/* (Will match assets: assets/blog/*)
					    • example.com/blog/* (Will match assets: assets/blog/*)
					    • example.com/abc/def/* (Will match assets: assets/abc/def/*)

					"
				`);
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  simple.co.uk/path/*
					  simple.co.uk/*
					  */*
					  */blog/*
					  example.com/blog/* (zone id: example-com-id)
					  example.com/* (zone id: example-com-id)
					  example.com/abc/def/* (zone id: example-com-id)
					Current Version ID: Galaxy-Class"
				`);
			});

			it("does not mention 404s hit a Worker if it's assets only", async () => {
				writeWranglerConfig({
					routes: [
						{ pattern: "example.com/blog/*", zone_id: "example-com-id" },
						{ pattern: "example.com/*", zone_id: "example-com-id" },
						{ pattern: "example.com/abc/def/*", zone_id: "example-com-id" },
					],
					assets: {
						directory: "assets",
					},
				});
				await mockAUSRequest([]);
				mockSubDomainRequest();
				mockUpdateWorkerSubdomain({ enabled: false, previews_enabled: false });
				mockUploadWorkerRequest({
					expectedAssets: {
						jwt: "<<aus-completion-token>>",
						config: {},
					},
					expectedType: "none",
				});
				// These run during route conflict resolution.
				// vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv
				mockGetZones("example.com", [{ id: "example-com-id" }]);
				mockGetZoneWorkerRoutes("example-com-id", []);
				// ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
				mockPublishRoutesRequest({
					routes: [
						{
							pattern: "example.com/blog/*",
							zone_id: "example-com-id",
						},
						{
							pattern: "example.com/*",
							zone_id: "example-com-id",
						},
						{
							pattern: "example.com/abc/def/*",
							zone_id: "example-com-id",
						},
					],
				});

				writeAssets([{ filePath: "asset.txt", content: "Content of file-1" }]);

				await runWrangler(`deploy`);

				expect(std.warn).toMatchInlineSnapshot(`
					"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mWarning: The following routes will attempt to serve Assets on a configured path:[0m

					    • example.com/blog/* (Will match assets: assets/blog/*)
					    • example.com/abc/def/* (Will match assets: assets/abc/def/*)

					"
				`);
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  example.com/blog/* (zone id: example-com-id)
					  example.com/* (zone id: example-com-id)
					  example.com/abc/def/* (zone id: example-com-id)
					Current Version ID: Galaxy-Class"
				`);
			});

			it("does mention hitting the Worker on 404 if there is one", async () => {
				writeWranglerConfig({
					routes: [
						{ pattern: "example.com/blog/*", zone_id: "example-com-id" },
						{ pattern: "example.com/*", zone_id: "example-com-id" },
						{ pattern: "example.com/abc/def/*", zone_id: "example-com-id" },
					],
					assets: {
						directory: "assets",
					},
				});
				writeWorkerSource();
				await mockAUSRequest([]);
				mockSubDomainRequest();
				mockUpdateWorkerSubdomain({ enabled: false, previews_enabled: false });
				mockUploadWorkerRequest({
					expectedAssets: {
						jwt: "<<aus-completion-token>>",
						config: {},
					},
					expectedType: "esm",
					expectedMainModule: "index.js",
				});
				// These run during route conflict resolution.
				// vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv
				mockGetZones("example.com", [{ id: "example-com-id" }]);
				mockGetZoneWorkerRoutes("example-com-id", []);
				// ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
				mockPublishRoutesRequest({
					routes: [
						{
							pattern: "example.com/blog/*",
							zone_id: "example-com-id",
						},
						{
							pattern: "example.com/*",
							zone_id: "example-com-id",
						},
						{
							pattern: "example.com/abc/def/*",
							zone_id: "example-com-id",
						},
					],
				});

				writeAssets([{ filePath: "asset.txt", content: "Content of file-1" }]);

				await runWrangler(`deploy ./index`);

				expect(std.warn).toMatchInlineSnapshot(`
					"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mWarning: The following routes will attempt to serve Assets on a configured path:[0m

					    • example.com/blog/* (Will match assets: assets/blog/*)
					    • example.com/abc/def/* (Will match assets: assets/abc/def/*)

					  Requests not matching an asset will be forwarded to the Worker's code.

					"
				`);
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  example.com/blog/* (zone id: example-com-id)
					  example.com/* (zone id: example-com-id)
					  example.com/abc/def/* (zone id: example-com-id)
					Current Version ID: Galaxy-Class"
				`);
			});

			it("should not warn on mounted paths if run_worker_first = false", async () => {
				writeWranglerConfig({
					routes: [
						"simple.co.uk/path/*",
						"simple.co.uk/*",
						"*/*",
						"*/blog/*",
						{ pattern: "example.com/blog/*", zone_id: "example-com-id" },
						{ pattern: "example.com/*", zone_id: "example-com-id" },
						{ pattern: "example.com/abc/def/*", zone_id: "example-com-id" },
					],
					assets: {
						directory: "assets",
						run_worker_first: false,
					},
				});
				await mockAUSRequest([]);
				mockSubDomainRequest();
				mockUpdateWorkerSubdomain({ enabled: false, previews_enabled: false });
				mockUploadWorkerRequest({
					expectedAssets: {
						jwt: "<<aus-completion-token>>",
						config: {
							run_worker_first: false,
						},
					},
					expectedType: "none",
				});
				// These run during route conflict resolution.
				// vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv
				mockGetZonesMulti({
					"simple.co.uk": {
						accountId: "some-account-id",
						zones: [{ id: "simple-co-uk-id" }],
					},
					"example.com": {
						accountId: "some-account-id",
						zones: [{ id: "example-com-id" }],
					},
				});
				mockGetZoneWorkerRoutesMulti({
					"simple-co-uk-id": [],
					"example-com-id": [],
				});
				// ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
				mockPublishRoutesRequest({
					routes: [
						// @ts-expect-error - this is what is expected
						{
							pattern: "simple.co.uk/path/*",
						},
						// @ts-expect-error - this is what is expected
						{
							pattern: "simple.co.uk/*",
						},
						// @ts-expect-error - this is what is expected
						{
							pattern: "*/*",
						},
						// @ts-expect-error - this is what is expected
						{
							pattern: "*/blog/*",
						},
						{
							pattern: "example.com/blog/*",
							zone_id: "example-com-id",
						},
						{
							pattern: "example.com/*",
							zone_id: "example-com-id",
						},
						{
							pattern: "example.com/abc/def/*",
							zone_id: "example-com-id",
						},
					],
				});

				writeWorkerSource();
				writeAssets([{ filePath: "asset.txt", content: "Content of file-1" }]);

				await runWrangler(`deploy`);

				expect(std.warn).toMatchInlineSnapshot(`""`);
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  simple.co.uk/path/*
					  simple.co.uk/*
					  */*
					  */blog/*
					  example.com/blog/* (zone id: example-com-id)
					  example.com/* (zone id: example-com-id)
					  example.com/abc/def/* (zone id: example-com-id)
					Current Version ID: Galaxy-Class"
				`);
			});
		});
		it.todo("should error if it's a workers.dev route");
	});
	describe("triggers", () => {
		it("should deploy the worker with a scheduled trigger", async () => {
			const crons = ["*/5 * * * *", "0 18 * * 6L"];
			writeWranglerConfig({
				triggers: { crons },
			});
			writeWorkerSource();
			mockSubDomainRequest();
			mockUploadWorkerRequest({ expectedType: "esm" });
			mockPublishSchedulesRequest({ crons });
			await runWrangler("deploy ./index");
		});

		it("should deploy the worker with an empty array of scheduled triggers", async () => {
			const crons: string[] = [];
			writeWranglerConfig({
				triggers: { crons },
			});
			writeWorkerSource();
			mockSubDomainRequest();
			mockUploadWorkerRequest({ expectedType: "esm" });
			mockPublishSchedulesRequest({ crons });
			await runWrangler("deploy ./index");
		});

		it.each([{ triggers: { crons: undefined } }, { triggers: undefined }, {}])(
			"should deploy the worker without updating the scheduled triggers",
			async (config) => {
				writeWranglerConfig(config);
				writeWorkerSource();
				mockSubDomainRequest();
				mockUploadWorkerRequest({ expectedType: "esm" });
				await runWrangler("deploy ./index");
			}
		);
	});
});
