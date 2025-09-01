import { http, HttpResponse } from "msw";
import { makeApiRequestAsserter } from "../helpers/assert-request";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { useMockIsTTY } from "../helpers/mock-istty";
import {
	mockGetWorkerSubdomain,
	mockSubDomainRequest,
} from "../helpers/mock-workers-subdomain";
import { createFetchResult, msw } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import { writeWorkerSource } from "../helpers/write-worker-source";
import { writeWranglerConfig } from "../helpers/write-wrangler-config";

describe("versions upload", () => {
	runInTempDir();
	mockAccountId();
	mockApiToken();
	const { setIsTTY } = useMockIsTTY();
	const std = mockConsoleMethods();
	const assertApiRequest = makeApiRequestAsserter(std);

	function mockGetScript() {
		msw.use(
			http.get(
				`*/accounts/:accountId/workers/services/:scriptName`,
				({ params }) => {
					expect(params.scriptName).toEqual("test-name");

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

					expect(params.scriptName).toEqual("test-name");

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

	test("should print bindings & startup time on versions upload", async () => {
		mockGetScript();
		mockUploadVersion(false);

		// Setup
		writeWranglerConfig({
			name: "test-name",
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

		const result = runWrangler("versions upload");

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
			Uploaded test-name (TIMINGS)
			Worker Version ID: 51e4886e-2db7-4900-8d38-fbfecfeab993"
		`);
	});

	test("should accept script as a positional arg", async () => {
		mockGetScript();
		mockUploadVersion(false);

		// Setup
		writeWranglerConfig({
			name: "test-name",
			// i.e. would error if the arg wasn't picked up
			main: "./nope.js",
		});
		writeWorkerSource();
		setIsTTY(false);

		const result = runWrangler("versions upload index.js");

		await expect(result).resolves.toBeUndefined();

		expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Worker Startup Time: 500 ms
			Uploaded test-name (TIMINGS)
			Worker Version ID: 51e4886e-2db7-4900-8d38-fbfecfeab993"
		`);
	});

	test("should print preview url if version has preview", async () => {
		mockGetScript();
		mockUploadVersion(true);
		mockGetWorkerSubdomain({ enabled: true, previews_enabled: true });
		mockSubDomainRequest();

		// Setup
		writeWranglerConfig({
			name: "test-name",
			main: "./index.js",
			vars: {
				TEST: "test-string",
			},
		});
		writeWorkerSource();
		setIsTTY(false);

		const result = runWrangler("versions upload");

		await expect(result).resolves.toBeUndefined();

		expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Worker Startup Time: 500 ms
			Your worker has access to the following bindings:
			- Vars:
			  - TEST: \\"test-string\\"
			Uploaded test-name (TIMINGS)
			Worker Version ID: 51e4886e-2db7-4900-8d38-fbfecfeab993
			Version Preview URL: https://51e4886e-test-name.test-sub-domain.workers.dev"
		`);
	});

	it("should not print preview url when preview_urls is false", async () => {
		mockGetScript();
		mockUploadVersion(true);
		mockGetWorkerSubdomain({ enabled: true, previews_enabled: false });

		// Setup
		writeWranglerConfig({
			name: "test-name",
			main: "./index.js",
			vars: {
				TEST: "test-string",
			},
		});
		writeWorkerSource();
		setIsTTY(false);

		const result = runWrangler("versions upload");

		await expect(result).resolves.toBeUndefined();

		expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Worker Startup Time: 500 ms
			Your worker has access to the following bindings:
			- Vars:
			  - TEST: \\"test-string\\"
			Uploaded test-name (TIMINGS)
			Worker Version ID: 51e4886e-2db7-4900-8d38-fbfecfeab993"
		`);

		expect(std.info).toContain("Retrying API call after error...");
	});

	test("correctly detects python workers", async () => {
		mockGetScript();
		mockUploadVersion(true);
		mockGetWorkerSubdomain({ enabled: true, previews_enabled: true });
		mockSubDomainRequest();

		// Setup
		writeWranglerConfig({
			name: "test-name",
			main: "./index.py",
			compatibility_flags: ["python_workers"],
		});
		writeWorkerSource({ type: "python", format: "py" });
		setIsTTY(false);

		await runWrangler("versions upload");

		assertApiRequest(/.*?workers\/scripts\/test-name\/versions/, {
			method: "POST",
			// Make sure the main module (index.py) has a text/x-python content type
			body: /Content-Disposition: form-data; name="index.py"; filename="index.py"\nContent-Type: text\/x-python/,
		});

		expect(std.out).toMatchInlineSnapshot(`
			"┌──────────────────┬────────┬──────────┐
			│ Name             │ Type   │ Size     │
			├──────────────────┼────────┼──────────┤
			│ another.py       │ python │ xx KiB │
			├──────────────────┼────────┼──────────┤
			│ Total (1 module) │        │ xx KiB │
			└──────────────────┴────────┴──────────┘
			Total Upload: xx KiB / gzip: xx KiB
			Worker Startup Time: 500 ms
			No bindings found.
			Uploaded test-name (TIMINGS)
			Worker Version ID: 51e4886e-2db7-4900-8d38-fbfecfeab993
			Version Preview URL: https://51e4886e-test-name.test-sub-domain.workers.dev"
		`);
	});
});
