/* eslint-disable workers-sdk/no-vitest-import-expect */

import * as fs from "node:fs";
import { APIError } from "@cloudflare/workers-utils";
import {
	normalizeString,
	writeWranglerConfig,
} from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getInstalledPackageVersion } from "../../autoconfig/frameworks/utils/packages";
import { clearOutputFilePath } from "../../output";
import { fetchSecrets } from "../../utils/fetch-secrets";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { clearDialogs, mockConfirm } from "../helpers/mock-dialogs";
import { useMockIsTTY } from "../helpers/mock-istty";
import { mockUploadWorkerRequest } from "../helpers/mock-upload-worker";
import { mockGetSettings } from "../helpers/mock-worker-settings";
import { mockSubDomainRequest } from "../helpers/mock-workers-subdomain";
import {
	createFetchResult,
	msw,
	mswSuccessDeploymentScriptAPI,
} from "../helpers/msw";
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

	function normalizeLogWithConfigDiff(log: string): string {
		// If the path is long the log could be wrapped so we need to remove the potential wrapping
		let normalizedLog = log.replace(/"main":\s*"/, '"main": "');

		if (process.platform === "win32") {
			// On windows the snapshot paths incorrectly use double slashes, such as:
			//  `\"main\": \"C://Users//RUNNER~1//AppData//Local//Temp//wrangler-testse63LuJ//index.js\",
			// so in the `main` field we replace all possible occurrences of `//` with just `\\`
			// (so that the path normalization of `normalizeString` can appropriately work)
			normalizedLog = normalizedLog.replace(
				/"main": "(.*?)"/,
				(_, mainPath: string) => `"main": "${mainPath.replaceAll("//", "\\")}"`
			);
		}

		normalizedLog = normalizeString(normalizedLog);

		// Let's remove the various extra characters for colors to get a more clear output
		normalizedLog = normalizedLog
			.replaceAll("", "X")
			.replaceAll(/X\[\d+(?:;\d+)?m/g, "");

		// Let's also normalize Windows newlines
		normalizedLog = normalizedLog.replaceAll("\r\n", "\n");

		return normalizedLog;
	}

	describe("config remote differences", () => {
		it("should present a diff warning to the user when there are differences between the local config (json/jsonc) and the dash config", async () => {
			writeWorkerSource();
			mockGetServiceByName("test-name", "production", "dash");
			writeWranglerConfig(
				{
					compatibility_date: "2024-04-24",
					main: "./index.js",
					workers_dev: true,
					preview_urls: true,
					vars: {
						MY_VAR: 123,
					},
					observability: {
						enabled: true,
					},
				},
				"./wrangler.json"
			);
			mockSubDomainRequest();
			mockUploadWorkerRequest({ wranglerConfigPath: "./wrangler.json" });
			mockGetServiceBindings("test-name", [
				{ name: "MY_VAR", text: "abc", type: "plain_text" },
			]);
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
					observability: { enabled: true, head_sampling_rate: 1 },
					compatibility_date: "2024-04-24",
				},
			} as unknown as ServiceMetadataRes["default_environment"]);

			mockConfirm({
				text: "Would you like to continue?",
				result: true,
			});

			await runWrangler("deploy");

			expect(normalizeLogWithConfigDiff(std.warn)).toMatchInlineSnapshot(`
				"▲ [WARNING] The local configuration being used (generated from your local configuration file) differs from the remote configuration of your Worker set via the Cloudflare Dashboard:

				   {
				     vars: {
				  -    MY_VAR: "abc"
				  +    MY_VAR: 123
				     }
				   }


				  Deploying the Worker will override the remote configuration with your local one.

				"
			`);
		});

		it("should not present a diff warning to the user when there are differences between the local config (json/jsonc) and the dash config in dry-run mode", async () => {
			writeWorkerSource();
			writeWranglerConfig(
				{
					compatibility_date: "2024-04-24",
					main: "./index.js",
					workers_dev: true,
					preview_urls: true,
					vars: {
						MY_VAR: 123,
					},
					observability: {
						enabled: true,
					},
				},
				"./wrangler.json"
			);

			// Note: we don't set any mocks here since in dry-run we don't expect wragnler to interact
			//       with the rest API in any way

			await runWrangler("deploy --dry-run");

			expect(normalizeLogWithConfigDiff(std.warn)).toMatchInlineSnapshot(`""`);
		});

		it("should present a diff warning to the user when there are differences between the local config (toml) and the dash config", async () => {
			writeWorkerSource();
			mockGetServiceByName("test-name", "production", "dash");
			writeWranglerConfig(
				{
					compatibility_date: "2024-04-24",
					main: "./index.js",
					workers_dev: true,
					preview_urls: true,
					vars: {
						MY_VAR: "this is a toml file",
					},
					observability: {
						enabled: true,
					},
				},
				"./wrangler.toml"
			);
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			mockGetServiceBindings("test-name", [
				{ name: "MY_VAR", text: "abc", type: "plain_text" },
			]);
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
					observability: { enabled: true, head_sampling_rate: 1 },
					compatibility_date: "2024-04-24",
				},
			} as unknown as ServiceMetadataRes["default_environment"]);

			mockConfirm({
				text: "Would you like to continue?",
				result: true,
			});

			await runWrangler("deploy");

			// Note: we display the toml config diff in json format since code-wise we'd have to convert the rawConfig to toml
			//       to be able to show toml content/diffs, that combined with the fact that json(c) config files are the
			//       recommended ones moving forward makes this small shortcoming of the config diffing acceptable
			expect(normalizeLogWithConfigDiff(std.warn)).toMatchInlineSnapshot(`
				"▲ [WARNING] The local configuration being used (generated from your local configuration file) differs from the remote configuration of your Worker set via the Cloudflare Dashboard:

				   {
				     vars: {
				  -    MY_VAR: "abc"
				  +    MY_VAR: "this is a toml file"
				     }
				   }


				  Deploying the Worker will override the remote configuration with your local one.

				"
			`);
		});

		it("in non-intractive (and non-strict) mode, should present a diff when there are differences between the local config and the dash config, and proceed with the deployment", async () => {
			setIsTTY(false);

			fs.mkdirSync("./public");

			await mockAUSRequest([]);

			writeWorkerSource();
			mockGetServiceByName("test-name", "production", "dash");
			writeWranglerConfig(
				{
					compatibility_date: "2024-04-24",
					main: "./index.js",
					workers_dev: true,
					preview_urls: true,
					vars: {
						MY_VAR: "this is a toml file",
					},
					assets: {
						binding: "ASSETS",
						// Note: remotely we only get the assets' binding name, so in the diff below you can see that
						//       no diff for the directory configuration is shown
						directory: "public",
					},
					observability: {
						enabled: true,
					},
				},
				"./wrangler.toml"
			);
			mockSubDomainRequest();
			mockUploadWorkerRequest();
			mockGetServiceBindings("test-name", [
				{ name: "MY_VAR", text: "abc", type: "plain_text" },
			]);
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
					observability: { enabled: true, head_sampling_rate: 1 },
					compatibility_date: "2024-04-24",
				},
			} as unknown as ServiceMetadataRes["default_environment"]);

			await runWrangler("deploy");

			// Note: we display the toml config diff in json format since code-wise we'd have to convert the rawConfig to toml
			//       to be able to show toml content/diffs, that combined with the fact that json(c) config files are the
			//       recommended ones moving forward makes this small shortcoming of the config diffing acceptable
			expect(normalizeLogWithConfigDiff(std.warn)).toMatchInlineSnapshot(`
				"▲ [WARNING] The local configuration being used (generated from your local configuration file) differs from the remote configuration of your Worker set via the Cloudflare Dashboard:

				   {
				  +  assets: {
				  +    binding: "ASSETS"
				  +  }
				     vars: {
				  -    MY_VAR: "abc"
				  +    MY_VAR: "this is a toml file"
				     }
				   }


				  Deploying the Worker will override the remote configuration with your local one.

				"
			`);

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				? Would you like to continue?
				🤖 Using fallback value in non-interactive context: yes
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Your Worker has access to the following bindings:
				Binding                                 Resource
				env.ASSETS                              Assets
				env.MY_VAR ("this is a toml file")      Environment Variable

				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		describe("with strict mode enabled", () => {
			it("should error if there are remote config difference in non-interactive mode", async () => {
				setIsTTY(false);

				writeWorkerSource();
				mockGetServiceByName("test-name", "production", "dash");
				writeWranglerConfig(
					{
						compatibility_date: "2024-04-24",
						main: "./index.js",
						workers_dev: true,
						preview_urls: true,
					},
					"./wrangler.json"
				);
				mockSubDomainRequest();
				mockUploadWorkerRequest({ wranglerConfigPath: "./wrangler.json" });
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
						observability: { enabled: true, head_sampling_rate: 1 },
						compatibility_date: "2024-04-24",
					},
				} as unknown as ServiceMetadataRes["default_environment"]);

				await runWrangler("deploy --strict");

				expect(normalizeLogWithConfigDiff(std.warn)).toMatchInlineSnapshot(`
					"▲ [WARNING] The local configuration being used (generated from your local configuration file) differs from the remote configuration of your Worker set via the Cloudflare Dashboard:

					   {
					     observability: {
					  -    enabled: true
					  +    enabled: false
					       logs: {
					  -      enabled: true
					  +      enabled: false
					       }
					     }
					   }


					  Deploying the Worker will override the remote configuration with your local one.

					"
				`);

				expect(std.err).toMatchInlineSnapshot(`
					"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mAborting the deployment operation because of conflicts. To override and deploy anyway remove the \`--strict\` flag[0m

					"
				`);
				// note: the test and the wrangler run share the same process, and we expect the deploy command (which fails)
				//       to set a non-zero exit code
				expect(process.exitCode).not.toBe(0);
			});

			it("should error when worker was last deployed from api", async () => {
				setIsTTY(false);

				msw.use(...mswSuccessDeploymentScriptAPI);
				writeWranglerConfig();
				writeWorkerSource();
				mockSubDomainRequest();
				mockUploadWorkerRequest();

				await runWrangler("deploy ./index --strict");

				expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mYou are about to publish a Workers Service that was last updated via the script API.[0m

				  Edits that have been made via the script API will be overridden by your local code and config.

				"
				`);
				expect(std.err).toMatchInlineSnapshot(`
					"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mAborting the deployment operation because of conflicts. To override and deploy anyway remove the \`--strict\` flag[0m

					"
				`);
				// note: the test and the wrangler run share the same process, and we expect the deploy command (which fails)
				//       to set a non-zero exit code
				expect(process.exitCode).not.toBe(0);
			});
		});

		it("should warn the user when the deployment would (likely unintentionally) override remote secrets", async () => {
			writeWorkerSource();
			mockGetServiceByName("test-name", "production", "dash");
			writeWranglerConfig(
				{
					compatibility_date: "2024-04-24",
					main: "./index.js",
					vars: {
						MY_SECRET: 123,
					},
					observability: {
						enabled: true,
					},
				},
				"./wrangler.json"
			);
			mockSubDomainRequest();
			mockUploadWorkerRequest({ wranglerConfigPath: "./wrangler.json" });
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
					observability: { enabled: true, head_sampling_rate: 1 },
					compatibility_date: "2024-04-24",
				},
			} as unknown as ServiceMetadataRes["default_environment"]);

			vi.mocked(fetchSecrets).mockResolvedValue([
				{ name: "MY_SECRET", type: "secret_text" },
			]);
			mockConfirm({
				text: "Would you like to continue?",
				result: true,
			});

			await runWrangler("deploy");

			expect(fetchSecrets).toHaveBeenCalled();
			expect(normalizeLogWithConfigDiff(std.warn)).toMatchInlineSnapshot(`
				"▲ [WARNING] Environment variable \`MY_SECRET\` conflicts with an existing remote secret. This deployment will replace the remote secret with your environment variable.

				"
			`);
		});

		it("should handle the remote secrets fetching check for new workers", async () => {
			writeWorkerSource();
			writeWranglerConfig(
				{
					compatibility_date: "2024-04-24",
					main: "./index.js",
					vars: {
						MY_SECRET: 123,
					},
					observability: {
						enabled: true,
					},
				},
				"./wrangler.json"
			);
			mockSubDomainRequest();
			mockUploadWorkerRequest({ wranglerConfigPath: "./wrangler.json" });

			msw.use(
				http.get(
					`*/accounts/:accountId/workers/scripts/:scriptName/secrets`,
					() => {
						const workerNotFoundAPIError = new APIError({
							status: 404,
							text: "A request to the Cloudflare API (/accounts/xxx/workers/scripts/yyy/secrets) failed.",
						});

						workerNotFoundAPIError.code = 10007;
						throw workerNotFoundAPIError;
					},
					{ once: true }
				)
			);

			await runWrangler("deploy");

			expect(fetchSecrets).toHaveBeenCalled();
			expect(std.warn).toMatchInlineSnapshot(`""`);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Your Worker has access to the following bindings:
				Binding                  Resource
				env.MY_SECRET (123)      Environment Variable

				Uploaded test-name (TIMINGS)
				Deployed test-name triggers (TIMINGS)
				  https://test-name.test-sub-domain.workers.dev
				Current Version ID: Galaxy-Class"
			`);
		});

		it("should not fetch remote secrets in dry-run mode", async () => {
			writeWorkerSource();
			writeWranglerConfig(
				{
					compatibility_date: "2024-04-24",
					main: "./index.js",
					vars: {
						MY_SECRET: 123,
					},
					observability: {
						enabled: true,
					},
				},
				"./wrangler.json"
			);

			// Note: we don't set any mocks here since in dry-run we don't expect wragnler to interact
			//       with the rest API in any way

			vi.mocked(fetchSecrets).mockResolvedValue([
				{ name: "MY_SECRET", type: "secret_text" },
			]);

			await runWrangler("deploy --dry-run");

			expect(fetchSecrets).not.toHaveBeenCalled();
			expect(normalizeLogWithConfigDiff(std.warn)).toMatchInlineSnapshot(`""`);
		});

		it("should abort the deployment when it would (likely unintentionally) override remote secrets in non-interactive strict mode", async () => {
			setIsTTY(false);

			writeWorkerSource();
			mockGetServiceByName("test-name", "production", "dash");
			writeWranglerConfig(
				{
					compatibility_date: "2024-04-24",
					main: "./index.js",
					vars: {
						MY_SECRET: 123,
					},
					observability: {
						enabled: true,
					},
				},
				"./wrangler.json"
			);
			mockSubDomainRequest();
			mockUploadWorkerRequest({ wranglerConfigPath: "./wrangler.json" });
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
					observability: { enabled: true, head_sampling_rate: 1 },
					compatibility_date: "2024-04-24",
				},
			} as unknown as ServiceMetadataRes["default_environment"]);

			vi.mocked(fetchSecrets).mockResolvedValue([
				{ name: "MY_SECRET", type: "secret_text" },
			]);

			await runWrangler("deploy --strict");

			expect(fetchSecrets).toHaveBeenCalled();

			expect(normalizeLogWithConfigDiff(std.warn)).toMatchInlineSnapshot(`
				"▲ [WARNING] Environment variable \`MY_SECRET\` conflicts with an existing remote secret. This deployment will replace the remote secret with your environment variable.

				"
			`);

			expect(std.err).toMatchInlineSnapshot(`
				"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mAborting the deployment operation because of conflicts. To override and deploy anyway remove the \`--strict\` flag[0m

				"
			`);

			// note: the test and the wrangler run share the same process, and we expect the deploy command (which fails)
			//       to set a non-zero exit code
			expect(process.exitCode).not.toBe(0);
		});
	});
});
