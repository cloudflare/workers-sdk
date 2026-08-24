import * as fs from "node:fs";
import { getInstalledPackageVersion } from "@cloudflare/autoconfig";
import {
	runInTempDir,
	writeWranglerConfig,
} from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { clearOutputFilePath } from "../../output";
import { INVALID_INHERIT_BINDING_CODE } from "../../utils/error-codes";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { clearDialogs } from "../helpers/mock-dialogs";
import { useMockIsTTY } from "../helpers/mock-istty";
import { mockUploadWorkerRequest } from "../helpers/mock-upload-worker";
import { mockGetSettings } from "../helpers/mock-worker-settings";
import { mockSubDomainRequest } from "../helpers/mock-workers-subdomain";
import { createFetchResult, msw } from "../helpers/msw";
import { mswListNewDeploymentsLatestFull } from "../helpers/msw/handlers/versions";
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

vi.mock("@cloudflare/autoconfig", async (importOriginal) => ({
	...(await importOriginal()),
	runAutoConfig: vi.fn(),
	getInstalledPackageVersion: vi.fn(),
}));
vi.mock("@cloudflare/cli-shared-helpers/command");

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
			}),
			http.get(
				"*/accounts/:accountId/workers/scripts/:scriptName/secrets",
				() => HttpResponse.json(createFetchResult([]))
			)
		);
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
			).rejects.toThrow();
		});

		it("should fail when secrets file contains invalid JSON", async ({
			expect,
		}) => {
			const secretsFile = "invalid.json";
			fs.writeFileSync(secretsFile, "{ invalid json }");

			await expect(
				runWrangler(`deploy --secrets-file ${secretsFile}`)
			).rejects.toThrow();
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
Use \`wrangler secret put <NAME>\` to set secrets before deploying,
or supply them when deploying with \`wrangler deploy --secrets-file <path-to-file>\`.
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
			// A new Worker triggers a pre-upload workers.dev subdomain check.
			mockSubDomainRequest();

			await expect(
				runWrangler("deploy index.js")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: The following required secrets have not been set: API_KEY, DB_PASSWORD
This Worker does not exist yet, so secrets cannot be set in advance with \`wrangler secret put\`.
To deploy a new Worker with secrets, supply them via a secrets file:
  wrangler deploy --secrets-file <path-to-file>
where the file contains lines in the format \`SECRET_NAME=value\` (or JSON).
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

			// The subdomain is fetched both before upload (new Worker check) and
			// again for the post-upload triggers, so use a persistent handler.
			mockSubDomainRequest("test-sub-domain", true, false);
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
			// A new Worker triggers a pre-upload workers.dev subdomain check.
			mockSubDomainRequest();

			await expect(
				runWrangler(`deploy --secrets-file ${secretsFile}`)
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: The following required secrets have not been set: SECRET2, SECRET3
This Worker does not exist yet, so secrets cannot be set in advance with \`wrangler secret put\`.
To deploy a new Worker with secrets, supply them via a secrets file:
  wrangler deploy --secrets-file <path-to-file>
where the file contains lines in the format \`SECRET_NAME=value\` (or JSON).
See https://developers.cloudflare.com/workers/configuration/secrets/#secrets-on-deployed-workers for more information.]`
			);
		});

		it("should keep inherit bindings for required secrets in replace mode", async () => {
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
				],
				expectedCompatibilityDate: "2022-01-12",
				expectedMainModule: "index.js",
				keepSecrets: false,
			});

			await runWrangler(
				`deploy --secrets-file ${secretsFile} --secrets-file-mode replace`
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

	describe("--secrets-file-mode", () => {
		it("should not keep remote secrets when --secrets-file-mode is replace", async ({
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
				// no keep_bindings entries for secrets should be sent
				keepSecrets: false,
			});

			await runWrangler(
				`deploy --secrets-file ${secretsFile} --secrets-file-mode replace`
			);

			expect(std.out).toContain("Uploaded test-name");
		});

		it("should keep remote secrets when --secrets-file-mode is merge", async ({
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

			await runWrangler(
				`deploy --secrets-file ${secretsFile} --secrets-file-mode merge`
			);

			expect(std.out).toContain("Uploaded test-name");
		});

		it("should warn about remote secrets that will be deleted in replace mode", async ({
			expect,
		}) => {
			const secretsFile = "secrets.json";
			fs.writeFileSync(
				secretsFile,
				JSON.stringify({
					SECRET1: "value1",
				})
			);

			msw.use(
				http.get(
					"*/accounts/:accountId/workers/scripts/:scriptName/secrets",
					() =>
						HttpResponse.json(
							createFetchResult([
								{ name: "SECRET1", type: "secret_text" },
								{ name: "OLD_SECRET", type: "secret_text" },
							])
						)
				)
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
				],
				expectedCompatibilityDate: "2022-01-12",
				expectedMainModule: "index.js",
				keepSecrets: false,
			});

			await runWrangler(
				`deploy --secrets-file ${secretsFile} --secrets-file-mode replace`
			);

			expect(std.warn).toContain("will be deleted: OLD_SECRET");
			expect(std.warn).not.toContain("SECRET1");
			// the warning does not prompt for confirmation
			expect(std.out).toContain("Uploaded test-name");
		});

		it("should warn about remote secrets that will be deleted in replace mode in non-interactive sessions", async ({
			expect,
		}) => {
			setIsTTY(false);

			const secretsFile = "secrets.json";
			fs.writeFileSync(
				secretsFile,
				JSON.stringify({
					SECRET1: "value1",
				})
			);

			msw.use(
				http.get(
					"*/accounts/:accountId/workers/scripts/:scriptName/secrets",
					() =>
						HttpResponse.json(
							createFetchResult([
								{ name: "SECRET1", type: "secret_text" },
								{ name: "OLD_SECRET", type: "secret_text" },
							])
						)
				)
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
				],
				expectedCompatibilityDate: "2022-01-12",
				expectedMainModule: "index.js",
				keepSecrets: false,
			});

			await runWrangler(
				`deploy --secrets-file ${secretsFile} --secrets-file-mode replace`
			);

			expect(std.warn).toContain("will be deleted: OLD_SECRET");
			expect(std.out).toContain("Uploaded test-name");
		});

		it("should abort the deploy in replace mode when secrets would be deleted and --strict is set", async ({
			expect,
		}) => {
			setIsTTY(false);

			const secretsFile = "secrets.json";
			fs.writeFileSync(
				secretsFile,
				JSON.stringify({
					SECRET1: "value1",
				})
			);

			msw.use(
				http.get(
					"*/accounts/:accountId/workers/scripts/:scriptName/secrets",
					() =>
						HttpResponse.json(
							createFetchResult([{ name: "OLD_SECRET", type: "secret_text" }])
						)
				)
			);

			mockServiceScriptData({
				scriptName: workerName,
				script: { id: workerName },
			});

			await runWrangler(
				`deploy --secrets-file ${secretsFile} --secrets-file-mode replace --strict`
			);

			expect(std.warn).toContain("will be deleted: OLD_SECRET");
			expect(std.err).toContain(
				"Aborting the upload operation because of conflicts"
			);
			expect(std.out).not.toContain("Uploaded test-name");
			expect(process.exitCode).not.toBe(0);
		});

		it("should not warn about remote secrets declared in secrets.required in replace mode", async ({
			expect,
		}) => {
			writeWranglerConfig({
				name: workerName,
				main: "./index.js",
				secrets: { required: ["KEEP_ME"] },
			});

			const secretsFile = "secrets.json";
			fs.writeFileSync(
				secretsFile,
				JSON.stringify({
					SECRET1: "value1",
				})
			);

			msw.use(
				http.get(
					"*/accounts/:accountId/workers/scripts/:scriptName/secrets",
					() =>
						HttpResponse.json(
							createFetchResult([
								{ name: "KEEP_ME", type: "secret_text" },
								{ name: "DROP_ME", type: "secret_text" },
							])
						)
				)
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
						name: "KEEP_ME",
					},
				],
				expectedCompatibilityDate: "2022-01-12",
				expectedMainModule: "index.js",
				keepSecrets: false,
			});

			await runWrangler(
				`deploy --secrets-file ${secretsFile} --secrets-file-mode replace`
			);

			expect(std.warn).toContain("will be deleted: DROP_ME");
			expect(std.warn).not.toContain("KEEP_ME");
		});

		it("should error when --secrets-file-mode is used without --secrets-file", async ({
			expect,
		}) => {
			await expect(
				runWrangler("deploy --secrets-file-mode replace")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: The --secrets-file-mode option can only be used together with --secrets-file.]`
			);
		});

		it("should error when --secrets-file-mode is given an unknown mode", async ({
			expect,
		}) => {
			const secretsFile = "secrets.json";
			fs.writeFileSync(secretsFile, JSON.stringify({ SECRET1: "value1" }));

			await expect(
				runWrangler(
					`deploy --secrets-file ${secretsFile} --secrets-file-mode bananas`
				)
			).rejects.toThrow();
		});
	});
});
