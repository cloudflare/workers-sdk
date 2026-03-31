import * as fs from "node:fs";
import { writeWranglerConfig } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { getInstalledPackageVersion } from "../../autoconfig/frameworks/utils/packages";
import { clearOutputFilePath } from "../../output";
import { INVALID_INHERIT_BINDING_CODE } from "../../utils/error-codes";
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
	mockDeploymentsListRequest,
	mockLastDeploymentRequest,
	mockPatchScriptSettings,
	mockServiceScriptData,
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
vi.mock("@cloudflare/cli/command");

describe("deploy secrets", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();
	const std = mockConsoleMethods();

	const workerName = "test-name";

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
		msw.use(
			http.get("*/accounts/:accountId/r2/buckets/:bucketName", async () => {
				return HttpResponse.json(createFetchResult({}));
			})
		);
		vi.mocked(fetchSecrets).mockResolvedValue([]);
		vi.mocked(getInstalledPackageVersion).mockReturnValue(undefined);

		writeWranglerConfig({
			name: workerName,
			main: "./index.js",
		});
		writeWorkerSource();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		clearDialogs();
		clearOutputFilePath();
	});

	describe("--secrets-file", () => {
		it("should upload secrets from a JSON file alongside the worker", async ({
			expect,
		}) => {
			const secretsFile = "secrets.json";
			fs.writeFileSync(
				secretsFile,
				JSON.stringify({
					SECRET1: "value1",
					SECRET2: "value2",
				})
			);

			mockServiceScriptData({
				scriptName: workerName,
				script: { id: workerName },
			});
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedBindings: [
					{
						type: "secret_text",
						name: "SECRET1",
						text: "value1",
					},
					{
						type: "secret_text",
						name: "SECRET2",
						text: "value2",
					},
				],
				expectedCompatibilityDate: "2022-01-12",
				expectedMainModule: "index.js",
				keepSecrets: true,
			});

			await runWrangler(`deploy --secrets-file ${secretsFile}`);

			expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Total Upload: xx KiB / gzip: xx KiB
			Worker Startup Time: 100 ms
			Your Worker has access to the following bindings:
			Binding                       Resource
			env.SECRET1 ("(hidden)")      Environment Variable
			env.SECRET2 ("(hidden)")      Environment Variable

			Uploaded test-name (TIMINGS)
			Deployed test-name triggers (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Version ID: Galaxy-Class"
		`);
		});

		it("should upload secrets from a .env file alongside the worker", async ({
			expect,
		}) => {
			const secretsFile = ".env.production";
			fs.writeFileSync(
				secretsFile,
				`SECRET1=value1
SECRET2=value2
# Comment line
SECRET3=value3`
			);

			mockServiceScriptData({
				scriptName: workerName,
				script: { id: workerName },
			});
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedBindings: [
					{
						type: "secret_text",
						name: "SECRET1",
						text: "value1",
					},
					{
						type: "secret_text",
						name: "SECRET2",
						text: "value2",
					},
					{
						type: "secret_text",
						name: "SECRET3",
						text: "value3",
					},
				],
				expectedCompatibilityDate: "2022-01-12",
				expectedMainModule: "index.js",
				keepSecrets: true,
			});

			await runWrangler(`deploy --secrets-file ${secretsFile}`);

			expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Total Upload: xx KiB / gzip: xx KiB
			Worker Startup Time: 100 ms
			Your Worker has access to the following bindings:
			Binding                       Resource
			env.SECRET1 ("(hidden)")      Environment Variable
			env.SECRET2 ("(hidden)")      Environment Variable
			env.SECRET3 ("(hidden)")      Environment Variable

			Uploaded test-name (TIMINGS)
			Deployed test-name triggers (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Version ID: Galaxy-Class"
		`);
		});

		it("should set keepSecrets to inherit non-provided secrets when providing secrets file", async ({
			expect,
		}) => {
			const secretsFile = "secrets.json";
			fs.writeFileSync(
				secretsFile,
				JSON.stringify({
					MY_SECRET: "secret_value",
				})
			);

			mockServiceScriptData({
				scriptName: workerName,
				script: { id: workerName },
			});
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedBindings: [
					{
						type: "secret_text",
						name: "MY_SECRET",
						text: "secret_value",
					},
				],
				expectedCompatibilityDate: "2022-01-12",
				expectedMainModule: "index.js",
				keepSecrets: true,
			});

			await runWrangler(`deploy --secrets-file ${secretsFile}`);

			expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Total Upload: xx KiB / gzip: xx KiB
			Worker Startup Time: 100 ms
			Your Worker has access to the following bindings:
			Binding                         Resource
			env.MY_SECRET ("(hidden)")      Environment Variable

			Uploaded test-name (TIMINGS)
			Deployed test-name triggers (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Version ID: Galaxy-Class"
		`);
		});

		it("should fail when secrets file does not exist", async ({ expect }) => {
			await expect(
				runWrangler("deploy --secrets-file non-existent-file.json")
			).rejects.toThrowError();
		});

		it("should fail when secrets file contains invalid JSON", async ({
			expect,
		}) => {
			const secretsFile = "invalid.json";
			fs.writeFileSync(secretsFile, "{ invalid json }");

			await expect(
				runWrangler(`deploy --secrets-file ${secretsFile}`)
			).rejects.toThrowError();
		});
	});

	describe("secrets.required", () => {
		it("should add inherit bindings for required secrets", async () => {
			writeWranglerConfig({
				name: workerName,
				main: "./index.js",
				secrets: { required: ["API_KEY", "DB_PASSWORD"] },
			});

			mockUploadWorkerRequest({
				expectedBindings: [
					{ type: "inherit", name: "API_KEY" },
					{ type: "inherit", name: "DB_PASSWORD" },
				],
			});
			mockSubDomainRequest();

			await runWrangler("deploy index.js");
		});

		it("should error when required secrets are missing from the deployed Worker", async ({
			expect,
		}) => {
			writeWranglerConfig({
				name: workerName,
				main: "./index.js",
				secrets: { required: ["API_KEY", "DB_PASSWORD"] },
			});

			// Mock the versions API to return inherit binding errors for all missing secrets
			msw.use(
				http.post(
					"*/accounts/:accountId/workers/scripts/:scriptName/versions",
					() => {
						return HttpResponse.json(
							createFetchResult(null, false, [
								{
									code: INVALID_INHERIT_BINDING_CODE,
									message:
										"inherit binding 'API_KEY' is invalid: previous version does not have binding named 'API_KEY'",
								},
								{
									code: INVALID_INHERIT_BINDING_CODE,
									message:
										"inherit binding 'DB_PASSWORD' is invalid: previous version does not have binding named 'DB_PASSWORD'",
								},
							])
						);
					},
					{ once: true }
				)
			);

			mockSubDomainRequest();

			await expect(
				runWrangler("deploy index.js")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: The following required secrets have not been set: API_KEY, DB_PASSWORD
Use \`wrangler secret put <NAME>\` to set secrets before deploying.
See https://developers.cloudflare.com/workers/configuration/secrets/#secrets-on-deployed-workers for more information.]`
			);
		});

		it("should error before uploading when the Worker does not exist", async ({
			expect,
		}) => {
			writeWranglerConfig({
				name: workerName,
				main: "./index.js",
				secrets: { required: ["API_KEY", "DB_PASSWORD"] },
			});

			mockServiceScriptData({});

			await expect(
				runWrangler("deploy index.js")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: The following required secrets have not been set: API_KEY, DB_PASSWORD
Use \`wrangler secret put <NAME>\` to set secrets before deploying.
See https://developers.cloudflare.com/workers/configuration/secrets/#secrets-on-deployed-workers for more information.]`
			);
		});
	});

	describe("--secrets-file with secrets.required", () => {
		it("should deploy when --secrets-file satisfies all required secrets even if the Worker does not exist", async () => {
			writeWranglerConfig({
				name: workerName,
				main: "./index.js",
				secrets: { required: ["SECRET1", "SECRET2"] },
			});

			const secretsFile = "secrets.json";
			fs.writeFileSync(
				secretsFile,
				JSON.stringify({
					SECRET1: "value1",
					SECRET2: "value2",
				})
			);

			// Worker does not exist
			mockServiceScriptData({});

			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedBindings: [
					{
						type: "secret_text",
						name: "SECRET1",
						text: "value1",
					},
					{
						type: "secret_text",
						name: "SECRET2",
						text: "value2",
					},
				],
				expectedCompatibilityDate: "2022-01-12",
				expectedMainModule: "index.js",
				keepSecrets: true,
				// Worker doesn't exist so the old upload API is used
				useOldUploadApi: true,
			});

			await runWrangler(`deploy --secrets-file ${secretsFile}`);
		});

		it("should error listing only the secrets not provided by --secrets-file when the Worker does not exist", async ({
			expect,
		}) => {
			writeWranglerConfig({
				name: workerName,
				main: "./index.js",
				secrets: { required: ["SECRET1", "SECRET2", "SECRET3"] },
			});

			const secretsFile = "secrets.json";
			fs.writeFileSync(
				secretsFile,
				JSON.stringify({
					SECRET1: "value1",
				})
			);

			// Worker does not exist
			mockServiceScriptData({});

			await expect(
				runWrangler(`deploy --secrets-file ${secretsFile}`)
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: The following required secrets have not been set: SECRET2, SECRET3
Use \`wrangler secret put <NAME>\` to set secrets before deploying.
See https://developers.cloudflare.com/workers/configuration/secrets/#secrets-on-deployed-workers for more information.]`
			);
		});

		it("should use inherit bindings only for required secrets not provided by --secrets-file", async () => {
			writeWranglerConfig({
				name: workerName,
				main: "./index.js",
				secrets: { required: ["SECRET1", "SECRET2", "SECRET3"] },
			});

			const secretsFile = "secrets.json";
			fs.writeFileSync(
				secretsFile,
				JSON.stringify({
					SECRET1: "value1",
				})
			);

			mockServiceScriptData({
				scriptName: workerName,
				script: { id: workerName },
			});
			mockSubDomainRequest();
			mockUploadWorkerRequest({
				expectedBindings: [
					{
						type: "secret_text",
						name: "SECRET1",
						text: "value1",
					},
					{
						type: "inherit",
						name: "SECRET2",
					},
					{
						type: "inherit",
						name: "SECRET3",
					},
				],
				expectedCompatibilityDate: "2022-01-12",
				expectedMainModule: "index.js",
				keepSecrets: true,
			});

			await runWrangler(`deploy --secrets-file ${secretsFile}`);
		});
	});
});
