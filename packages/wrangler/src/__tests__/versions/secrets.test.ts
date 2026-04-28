import { writeFileSync } from "node:fs";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, it } from "vitest";
import { INVALID_INHERIT_BINDING_CODE } from "../../utils/error-codes";
import { captureRequestsFrom } from "../helpers/capture-requests-from";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { createFetchResult, msw } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import { toString } from "../helpers/serialize-form-data-entry";
import { writeWorkerSource } from "../helpers/write-worker-source";
import { writeWranglerConfig } from "../helpers/write-wrangler-config";

describe("versions upload secrets", () => {
	const std = mockConsoleMethods();
	runInTempDir();
	mockAccountId();
	mockApiToken();

	const workerName = "test-worker";

	function mockGetScript() {
		msw.use(
			http.get(
				`*/accounts/:accountId/workers/services/:scriptName`,
				() => {
					return HttpResponse.json(
						createFetchResult({
							default_environment: {
								script: {
									last_deployed_from: "wrangler",
								},
							},
						})
					);
				},
				{ once: true }
			)
		);
	}

	beforeEach(() => {
		writeWranglerConfig({
			name: workerName,
			main: "./index.js",
		});
		writeWorkerSource();
	});

	describe("--secrets-file", () => {
		it("should upload secrets from a JSON file alongside the Worker version", async ({
			expect,
		}) => {
			mockGetScript();
			const secretsFile = "secrets.json";
			writeFileSync(
				secretsFile,
				JSON.stringify({
					SECRET1: "value1",
					SECRET2: "value2",
				})
			);

			const captured = captureRequestsFrom(
				http.post(
					"*/accounts/:accountId/workers/scripts/:scriptName/versions",
					async () => {
						return HttpResponse.json(
							createFetchResult({
								id: "version-id-123",
								startup_time_ms: 100,
								metadata: {
									has_preview: false,
								},
							})
						);
					}
				)
			)();

			await runWrangler(
				`versions upload --name ${workerName} --secrets-file ${secretsFile}`
			);

			const formData = await captured.requests[0].clone().formData();
			const metadata = JSON.parse(await toString(formData.get("metadata")));

			expect(metadata.bindings).toEqual([
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
			]);
			expect(metadata.keep_bindings).toEqual(["secret_text", "secret_key"]);
			expect(std.out).toContain("Worker Startup Time:");
		});

		it("should upload secrets from a .env file alongside the Worker version", async ({
			expect,
		}) => {
			mockGetScript();
			const secretsFile = ".env.production";
			writeFileSync(
				secretsFile,
				`SECRET1=value1
SECRET2=value2
# Comment line
SECRET3=value3`
			);

			const captured = captureRequestsFrom(
				http.post(
					"*/accounts/:accountId/workers/scripts/:scriptName/versions",
					async () => {
						return HttpResponse.json(
							createFetchResult({
								id: "version-id-123",
								startup_time_ms: 100,
								metadata: {
									has_preview: false,
								},
							})
						);
					}
				)
			)();

			await runWrangler(
				`versions upload --name ${workerName} --secrets-file ${secretsFile}`
			);

			const formData = await captured.requests[0].clone().formData();
			const metadata = JSON.parse(await toString(formData.get("metadata")));

			expect(metadata.bindings).toEqual(
				expect.arrayContaining([
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
				])
			);
			expect(metadata.keep_bindings).toEqual(["secret_text", "secret_key"]);
			expect(std.out).toContain("Worker Startup Time:");
		});

		it("should set keep_bindings to inherit non-provided secrets when providing secrets file", async ({
			expect,
		}) => {
			mockGetScript();
			const secretsFile = "secrets.json";
			writeFileSync(
				secretsFile,
				JSON.stringify({
					MY_SECRET: "secret_value",
				})
			);

			const captured = captureRequestsFrom(
				http.post(
					"*/accounts/:accountId/workers/scripts/:scriptName/versions",
					async () => {
						return HttpResponse.json(
							createFetchResult({
								id: "version-id-123",
								startup_time_ms: 100,
								metadata: {
									has_preview: false,
								},
							})
						);
					}
				)
			)();

			await runWrangler(
				`versions upload --name ${workerName} --secrets-file ${secretsFile}`
			);

			const formData = await captured.requests[0].clone().formData();
			const metadata = JSON.parse(await toString(formData.get("metadata")));

			expect(metadata.keep_bindings).toEqual(["secret_text", "secret_key"]);
		});

		it("should inherit secrets when not providing secrets file", async ({
			expect,
		}) => {
			mockGetScript();

			const captured = captureRequestsFrom(
				http.post(
					"*/accounts/:accountId/workers/scripts/:scriptName/versions",
					async () => {
						return HttpResponse.json(
							createFetchResult({
								id: "version-id-123",
								startup_time_ms: 100,
								metadata: {
									has_preview: false,
								},
							})
						);
					}
				)
			)();

			await runWrangler(`versions upload --name ${workerName}`);

			const formData = await captured.requests[0].clone().formData();
			const metadata = JSON.parse(await toString(formData.get("metadata")));

			expect(metadata.keep_bindings).toEqual(["secret_text", "secret_key"]);
		});

		it("should fail when secrets file does not exist", async ({ expect }) => {
			await expect(
				runWrangler(
					`versions upload --name ${workerName} --secrets-file non-existent-file.json`
				)
			).rejects.toThrowError();
		});

		it("should fail when secrets file is neither valid JSON nor .env format", async ({
			expect,
		}) => {
			const secretsFile = "invalid_file";
			writeFileSync(secretsFile, "{ invalid file }");

			await expect(
				runWrangler(
					`versions upload --name ${workerName} --secrets-file ${secretsFile}`
				)
			).rejects.toThrowError();
		});
	});

	describe("secrets.required", () => {
		it("should add inherit bindings for required secrets", async ({
			expect,
		}) => {
			writeWranglerConfig({
				name: workerName,
				main: "./index.js",
				secrets: { required: ["API_KEY", "DB_PASSWORD"] },
			});

			mockGetScript();

			const captured = captureRequestsFrom(
				http.post(
					"*/accounts/:accountId/workers/scripts/:scriptName/versions",
					() => {
						return HttpResponse.json(
							createFetchResult({
								id: "version-id-123",
								startup_time_ms: 100,
								metadata: {
									has_preview: false,
								},
							})
						);
					}
				)
			)();

			await runWrangler(`versions upload --name ${workerName}`);

			const formData = await captured.requests[0].clone().formData();
			const metadata = JSON.parse(await toString(formData.get("metadata")));

			expect(metadata.bindings).toEqual(
				expect.arrayContaining([
					{ type: "inherit", name: "API_KEY" },
					{ type: "inherit", name: "DB_PASSWORD" },
				])
			);
		});

		it("should error when required secrets are missing", async ({ expect }) => {
			writeWranglerConfig({
				name: workerName,
				main: "./index.js",
				secrets: { required: ["API_KEY", "DB_PASSWORD"] },
			});

			mockGetScript();

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

			await expect(
				runWrangler(`versions upload --name ${workerName}`)
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: The following required secrets have not been set: API_KEY, DB_PASSWORD
Use \`wrangler versions secret put <NAME>\` to set secrets before uploading.
See https://developers.cloudflare.com/workers/configuration/secrets/#secrets-on-deployed-workers for more information.]`
			);
		});
	});

	describe("--secrets-file with secrets.required", () => {
		it("should use inherit bindings only for required secrets not provided by --secrets-file", async ({
			expect,
		}) => {
			writeWranglerConfig({
				name: workerName,
				main: "./index.js",
				secrets: { required: ["SECRET1", "SECRET2", "SECRET3"] },
			});

			const secretsFile = "secrets.json";
			writeFileSync(
				secretsFile,
				JSON.stringify({
					SECRET1: "value1",
				})
			);

			mockGetScript();

			const captured = captureRequestsFrom(
				http.post(
					"*/accounts/:accountId/workers/scripts/:scriptName/versions",
					() => {
						return HttpResponse.json(
							createFetchResult({
								id: "version-id-123",
								startup_time_ms: 100,
								metadata: {
									has_preview: false,
								},
							})
						);
					}
				)
			)();

			await runWrangler(
				`versions upload --name ${workerName} --secrets-file ${secretsFile}`
			);

			const formData = await captured.requests[0].clone().formData();
			const metadata = JSON.parse(await toString(formData.get("metadata")));

			expect(metadata.bindings).toEqual(
				expect.arrayContaining([
					{ type: "secret_text", name: "SECRET1", text: "value1" },
					{ type: "inherit", name: "SECRET2" },
					{ type: "inherit", name: "SECRET3" },
				])
			);
		});
	});
});
