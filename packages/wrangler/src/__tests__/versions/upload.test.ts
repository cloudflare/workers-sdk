import { writeFileSync } from "node:fs";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, it } from "vitest";
import { captureRequestsFrom } from "../helpers/capture-requests-from";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { createFetchResult, msw } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import { toString } from "../helpers/serialize-form-data-entry";
import { writeWorkerSource } from "../helpers/write-worker-source";
import { writeWranglerConfig } from "../helpers/write-wrangler-config";

describe("versions upload --secrets-file", () => {
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

	it("should upload secrets from a JSON file alongside the worker version", async ({
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

	it("should upload secrets from a .env file alongside the worker version", async ({
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
