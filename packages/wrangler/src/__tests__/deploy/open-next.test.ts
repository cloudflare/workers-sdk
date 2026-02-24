/* eslint-disable workers-sdk/no-vitest-import-expect */

import * as fs from "node:fs";
import { writeWranglerConfig } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import dedent from "ts-dedent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getInstalledPackageVersion } from "../../autoconfig/frameworks/utils/packages";
import { clearOutputFilePath } from "../../output";
import { fetchSecrets } from "../../utils/fetch-secrets";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { clearDialogs } from "../helpers/mock-dialogs";
import { useMockIsTTY } from "../helpers/mock-istty";
import { mockUploadWorkerRequest } from "../helpers/mock-upload-worker";
import { mockGetSettings } from "../helpers/mock-worker-settings";
import { mockSubDomainRequest } from "../helpers/mock-workers-subdomain";
import { createFetchResult, msw } from "../helpers/msw";
import { mswListNewDeploymentsLatestFull } from "../helpers/msw/handlers/versions";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import { writeWorkerSource } from "../helpers/write-worker-source";
import {
	mockAUSRequest,
	mockDeploymentsListRequest,
	mockGetServiceBindings,
	mockGetServiceByName,
	mockGetServiceCustomDomainRecords,
	mockGetServiceMetadata,
	mockGetServiceRoutes,
	mockGetServiceSchedules,
	mockGetServiceSubDomainData,
	mockLastDeploymentRequest,
	mockPatchScriptSettings,
} from "./helpers";
import type { ServiceMetadataRes } from "@cloudflare/workers-utils";
import type { MockInstance } from "vitest";

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

	describe("open-next delegation", () => {
		async function mockOpenNextLikeProject() {
			vi.mocked(getInstalledPackageVersion).mockReturnValue("1.14.4");

			fs.mkdirSync("./.open-next/assets", { recursive: true });
			fs.writeFileSync(
				"./.open-next/worker.js",
				"export default { fetch() { return new Response(''); } };"
			);
			fs.writeFileSync("./next.config.js", "export default {};");
			fs.writeFileSync(
				"./open-next.config.ts",
				dedent`
					import { defineCloudflareConfig } from "@opennextjs/cloudflare";
					export default defineCloudflareConfig();
				`
			);

			await mockAUSRequest([]);

			writeWorkerSource();
			mockGetServiceByName("test-name", "production", "dash");
			writeWranglerConfig(
				{
					main: ".open-next/worker.js",
					compatibility_date: "2024-04-24",
					compatibility_flags: [
						"nodejs_compat",
						"global_fetch_strictly_public",
					],
					assets: {
						binding: "ASSETS",
						directory: ".open-next/assets",
					},
				},
				"./wrangler.jsonc"
			);
			mockSubDomainRequest();
			mockUploadWorkerRequest({ expectedMainModule: "worker.js" });
			mockGetServiceBindings("test-name", []);
			mockGetServiceRoutes("test-name", []);
			mockGetServiceCustomDomainRecords([]);
			mockGetServiceSubDomainData("test-name", {
				enabled: true,
				previews_enabled: true,
			});
			mockGetServiceSchedules("test-name", { schedules: [] });
			mockGetServiceMetadata("test-name", {
				created_on: "2025-08-07T09:34:47.846308Z",
				modified_on: "2025-08-08T10:48:12.688997Z",
				script: {
					created_on: "2025-08-07T09:34:47.846308Z",
					modified_on: "2025-08-08T10:48:12.688997Z",
					id: "my-worker-id",
					compatibility_date: "2024-04-24",
				},
			} as unknown as ServiceMetadataRes["default_environment"]);
		}

		it("should delegate to open-next when run in an open-next project and set OPEN_NEXT_DEPLOY", async () => {
			vi.spyOn(process, "argv", "get").mockReturnValue([
				"npx",
				"wrangler",
				"deploy",
				"--x-autoconfig",
			]);
			const runCommandSpy = (await import("../../autoconfig/c3-vendor/command"))
				.runCommand;

			await mockOpenNextLikeProject();

			await runWrangler("deploy --x-autoconfig");

			expect(runCommandSpy).toHaveBeenCalledOnce();
			const call = (runCommandSpy as unknown as MockInstance).mock.calls[0];
			const [command, options] = call;
			expect(command).toEqual([
				"npx",
				"opennextjs-cloudflare",
				"deploy",
				"--x-autoconfig",
			]);
			expect(options).toMatchObject({
				env: {
					// Note: we want to ensure that OPEN_NEXT_DEPLOY has been set, this is not strictly necessary but it helps us
					//       ensure that we can't end up in an infinite wrangler<>open-next invokation loop
					OPEN_NEXT_DEPLOY: "true",
				},
			});

			expect(std).toMatchInlineSnapshot(`
				{
				  "debug": "",
				  "err": "",
				  "info": "",
				  "out": "
				 ⛅️ wrangler x.x.x
				──────────────────
				OpenNext project detected, calling \`opennextjs-cloudflare deploy\`",
				  "warn": "",
				}
			`);
		});

		it("should delegate to open-next when run in an open-next project and set OPEN_NEXT_DEPLOY and pass the various CLI arguments", async () => {
			vi.spyOn(process, "argv", "get").mockReturnValue([
				"npx",
				"wrangler",
				"deploy",
				"--keep-vars",
				"--x-autoconfig",
			]);
			const runCommandSpy = (await import("../../autoconfig/c3-vendor/command"))
				.runCommand;

			await mockOpenNextLikeProject();

			await runWrangler("deploy --x-autoconfig");

			expect(runCommandSpy).toHaveBeenCalledOnce();
			const call = (runCommandSpy as unknown as MockInstance).mock.calls[0];
			const [command, options] = call;
			expect(command).toEqual([
				"npx",
				"opennextjs-cloudflare",
				"deploy",
				// `opennextjs-cloudflare deploy` accepts all the same arguments `wrangler deploy` does (since it then forwards them
				// to wrangler), so we do want to make sure that arguments are indeed forwarded to `opennextjs-cloudflare deploy`
				"--keep-vars",
				"--x-autoconfig",
			]);
			expect(options).toMatchObject({
				env: {
					// Note: we want to ensure that OPEN_NEXT_DEPLOY has been set, this is not strictly necessary but it helps us
					//       ensure that we can't end up in an infinite wrangler<>open-next invokation loop
					OPEN_NEXT_DEPLOY: "true",
				},
			});

			expect(std).toMatchInlineSnapshot(`
				{
				  "debug": "",
				  "err": "",
				  "info": "",
				  "out": "
				 ⛅️ wrangler x.x.x
				──────────────────
				OpenNext project detected, calling \`opennextjs-cloudflare deploy\`",
				  "warn": "",
				}
			`);
		});

		it("should not delegate to open-next deploy when run in an open-next project and OPEN_NEXT_DEPLOY is set", async () => {
			vi.stubEnv("OPEN_NEXT_DEPLOY", "1");

			const runCommandSpy = (await import("../../autoconfig/c3-vendor/command"))
				.runCommand;

			await mockOpenNextLikeProject();

			await runWrangler("deploy --x-autoconfig");

			expect(runCommandSpy).not.toHaveBeenCalledOnce();

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Your Worker has access to the following bindings:
				Binding            Resource
				env.ASSETS         Assets

				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("should not delegate to open-next deploy when --x-autoconfig=false is provided", async () => {
			const runCommandSpy = (await import("../../autoconfig/c3-vendor/command"))
				.runCommand;

			await mockOpenNextLikeProject();

			await runWrangler("deploy --x-autoconfig=false");

			expect(runCommandSpy).not.toHaveBeenCalledOnce();

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Your Worker has access to the following bindings:
				Binding            Resource
				env.ASSETS         Assets

				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("should not delegate to open-next deploy when the Next.js config file is missing (to avoid false positives)", async () => {
			const runCommandSpy = (await import("../../autoconfig/c3-vendor/command"))
				.runCommand;

			await mockOpenNextLikeProject();

			// Let's delete the next.config.js file
			fs.rmSync("./next.config.js");

			await runWrangler("deploy --x-autoconfig");

			expect(runCommandSpy).not.toHaveBeenCalledOnce();

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Your Worker has access to the following bindings:
				Binding            Resource
				env.ASSETS         Assets

				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("should not delegate to open-next deploy when the open-next config file is missing (to avoid false positives)", async () => {
			const runCommandSpy = (await import("../../autoconfig/c3-vendor/command"))
				.runCommand;

			await mockOpenNextLikeProject();

			// Let's delete the open-next.config.ts file
			fs.rmSync("./open-next.config.ts");

			await runWrangler("deploy --x-autoconfig");

			expect(runCommandSpy).not.toHaveBeenCalledOnce();

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Your Worker has access to the following bindings:
				Binding            Resource
				env.ASSETS         Assets

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
