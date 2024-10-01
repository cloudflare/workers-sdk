import { http, HttpResponse } from "msw";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { useMockIsTTY } from "../helpers/mock-istty";
import { mockSubDomainRequest } from "../helpers/mock-workers-subdomain";
import { createFetchResult, msw } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import { writeWorkerSource } from "../helpers/write-worker-source";
import { writeWranglerToml } from "../helpers/write-wrangler-toml";

describe("versions upload", () => {
	runInTempDir();
	mockAccountId();
	mockApiToken();
	const { setIsTTY } = useMockIsTTY();
	const std = mockConsoleMethods();

	function mockGetScript() {
		msw.use(
			http.get(
				`*/accounts/:accountId/workers/services/:scriptName`,
				({ params }) => {
					expect(params.scriptName).toEqual("test-worker");

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
	function mockUploadVersion(has_preview: boolean, flakeCount = 1) {
		msw.use(
			http.post(
				`*/accounts/:accountId/workers/scripts/:scriptName/versions`,
				({ params }) => {
					if (flakeCount > 0) {
						flakeCount--;
						return HttpResponse.error();
					}

					expect(params.scriptName).toEqual("test-worker");

					return HttpResponse.json(
						createFetchResult({
							id: "51e4886e-2db7-4900-8d38-fbfecfeab993",
							startup_time_ms: 500,
							metadata: {
								has_preview: has_preview,
							},
						})
					);
				}
			)
		);
	}

	function mockGetWorkerSubdomain(available_on_subdomain: boolean) {
		msw.use(
			http.get(
				`*/accounts/:accountId/workers/scripts/:scriptName/subdomain`,
				({ params }) => {
					expect(params.scriptName).toEqual("test-worker");
					return HttpResponse.json(
						createFetchResult({ enabled: available_on_subdomain })
					);
				}
			)
		);
	}

	test("should print bindings & startup time on versions upload", async () => {
		mockGetScript();
		mockUploadVersion(false);

		// Setup
		writeWranglerToml({
			name: "test-worker",
			main: "./index.js",
			vars: {
				TEST: "test-string",
				JSON: {
					abc: "def",
					bool: true,
				},
			},
			kv_namespaces: [{ binding: "KV", id: "xxxx-xxxx-xxxx-xxxx" }],
		});
		writeWorkerSource();
		setIsTTY(false);

		const result = runWrangler("versions upload --x-versions");

		await expect(result).resolves.toBeUndefined();

		expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Worker Startup Time: 500 ms
			Your worker has access to the following bindings:
			- KV Namespaces:
			  - KV: xxxx-xxxx-xxxx-xxxx
			- Vars:
			  - TEST: \\"test-string\\"
			  - JSON: {
			 \\"abc\\": \\"def\\",
			 \\"bool\\": true
			}
			Uploaded test-worker (TIMINGS)
			Worker Version ID: 51e4886e-2db7-4900-8d38-fbfecfeab993"
		`);
	});

	test("should print preview url if version has preview", async () => {
		mockGetScript();
		mockUploadVersion(true);
		mockGetWorkerSubdomain(true);
		mockSubDomainRequest();

		// Setup
		writeWranglerToml({
			name: "test-worker",
			main: "./index.js",
			vars: {
				TEST: "test-string",
			},
		});
		writeWorkerSource();
		setIsTTY(false);

		const result = runWrangler("versions upload --x-versions");

		await expect(result).resolves.toBeUndefined();

		expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Worker Startup Time: 500 ms
			Your worker has access to the following bindings:
			- Vars:
			  - TEST: \\"test-string\\"
			Uploaded test-worker (TIMINGS)
			Worker Version ID: 51e4886e-2db7-4900-8d38-fbfecfeab993
			Version Preview URL: https://51e4886e-test-worker.test-sub-domain.workers.dev"
		`);
	});

	it("should not print preview url workers_dev is false", async () => {
		mockGetScript();
		mockUploadVersion(true);
		mockGetWorkerSubdomain(false);

		// Setup
		writeWranglerToml({
			name: "test-worker",
			main: "./index.js",
			vars: {
				TEST: "test-string",
			},
		});
		writeWorkerSource();
		setIsTTY(false);

		const result = runWrangler("versions upload --x-versions");

		await expect(result).resolves.toBeUndefined();

		expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Worker Startup Time: 500 ms
			Your worker has access to the following bindings:
			- Vars:
			  - TEST: \\"test-string\\"
			Uploaded test-worker (TIMINGS)
			Worker Version ID: 51e4886e-2db7-4900-8d38-fbfecfeab993"
		`);
	});
});
