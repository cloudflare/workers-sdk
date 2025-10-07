import { writeFileSync } from "node:fs";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { createFetchResult, msw } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
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
				({ params }) => {
					expect(params.scriptName).toEqual(workerName);

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

	it("should upload secrets from a JSON file alongside the worker version", async () => {
		mockGetScript();
		const secretsFile = "secrets.json";
		writeFileSync(
			secretsFile,
			JSON.stringify({
				SECRET1: "value1",
				SECRET2: "value2",
			})
		);

		msw.use(
			http.post(
				"*/accounts/:accountId/workers/scripts/:scriptName/versions",
				async ({ request, params }) => {
					expect(params.accountId).toEqual("some-account-id");
					expect(params.scriptName).toEqual(workerName);

					const formData = await request.formData();
					const metadata = JSON.parse(formData.get("metadata") as string);

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

					return HttpResponse.json(
						createFetchResult({
							id: "version-id-123",
							startup_time_ms: 100,
							metadata: {
								has_preview: false,
							},
						})
					);
				},
				{ once: true }
			)
		);

		await runWrangler(
			`versions upload --name ${workerName} --secrets-file ${secretsFile}`
		);

		expect(std.out).toContain("Worker Startup Time:");
	});

	it("should upload secrets from a .env file alongside the worker version", async () => {
		mockGetScript();
		const secretsFile = ".env.production";
		writeFileSync(
			secretsFile,
			`SECRET1=value1
SECRET2=value2
# Comment line
SECRET3=value3`
		);

		msw.use(
			http.post(
				"*/accounts/:accountId/workers/scripts/:scriptName/versions",
				async ({ request, params }) => {
					expect(params.accountId).toEqual("some-account-id");
					expect(params.scriptName).toEqual(workerName);

					const formData = await request.formData();
					const metadata = JSON.parse(formData.get("metadata") as string);

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

					return HttpResponse.json(
						createFetchResult({
							id: "version-id-123",
							startup_time_ms: 100,
							metadata: {
								has_preview: false,
							},
						})
					);
				},
				{ once: true }
			)
		);

		await runWrangler(
			`versions upload --name ${workerName} --secrets-file ${secretsFile}`
		);

		expect(std.out).toContain("Worker Startup Time:");
	});

	it("should set keep_bindings to inherit non-provided secrets when providing secrets file", async () => {
		mockGetScript();
		const secretsFile = "secrets.json";
		writeFileSync(
			secretsFile,
			JSON.stringify({
				MY_SECRET: "secret_value",
			})
		);

		msw.use(
			http.post(
				"*/accounts/:accountId/workers/scripts/:scriptName/versions",
				async ({ request }) => {
					const formData = await request.formData();
					const metadata = JSON.parse(formData.get("metadata") as string);

					expect(metadata.keep_bindings).toEqual(["secret_text", "secret_key"]);

					return HttpResponse.json(
						createFetchResult({
							id: "version-id-123",
							startup_time_ms: 100,
							metadata: {
								has_preview: false,
							},
						})
					);
				},
				{ once: true }
			)
		);

		await runWrangler(
			`versions upload --name ${workerName} --secrets-file ${secretsFile}`
		);
	});

	it("should inherit secrets when not providing secrets file", async () => {
		mockGetScript();
		msw.use(
			http.post(
				"*/accounts/:accountId/workers/scripts/:scriptName/versions",
				async ({ request }) => {
					const formData = await request.formData();
					const metadata = JSON.parse(formData.get("metadata") as string);

					expect(metadata.keep_bindings).toEqual(["secret_text", "secret_key"]);

					return HttpResponse.json(
						createFetchResult({
							id: "version-id-123",
							startup_time_ms: 100,
							metadata: {
								has_preview: false,
							},
						})
					);
				},
				{ once: true }
			)
		);

		await runWrangler(`versions upload --name ${workerName}`);
	});

	it("should fail when secrets file does not exist", async () => {
		await expect(
			runWrangler(
				`versions upload --name ${workerName} --secrets-file non-existent-file.json`
			)
		).rejects.toThrowError();
	});

	it("should fail when secrets file contains invalid JSON", async () => {
		const secretsFile = "invalid.json";
		writeFileSync(secretsFile, "{ invalid json }");

		await expect(
			runWrangler(
				`versions upload --name ${workerName} --secrets-file ${secretsFile}`
			)
		).rejects.toThrowError();
	});
});
