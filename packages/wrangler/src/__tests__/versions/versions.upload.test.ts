import * as fs from "node:fs";
import { http, HttpResponse } from "msw";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { useMockIsTTY } from "../helpers/mock-istty";
import { mockSubDomainRequest } from "../helpers/mock-workers-subdomain";
import { msw } from "../helpers/msw";
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

	test("should print bindings & startup time on versions upload", async () => {
		msw.use(
			http.get(
				`*/accounts/:accountId/workers/services/:scriptName`,
				({ params }) => {
					expect(params.scriptName).toEqual("test-worker");

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: {
								default_environment: {
									script: {
										last_deployed_from: "wrangler",
									},
								},
							},
						},
						{ status: 200 }
					);
				},
				{ once: true }
			),
			http.post(
				`*/accounts/:accountId/workers/scripts/:scriptName/versions`,
				({ params }) => {
					expect(params.scriptName).toEqual("test-worker");

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: {
								id: "51e4886e-2db7-4900-8d38-fbfecfeab993",
								startup_time_ms: 500,
							},
						},
						{ status: 200 }
					);
				},
				{ once: true }
			)
		);
		mockSubDomainRequest();

		// Setup
		fs.mkdirSync("./versions-upload-test-worker", { recursive: true });
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
			Worker Version ID: 51e4886e-2db7-4900-8d38-fbfecfeab993
			Uploaded test-worker (TIMINGS)"
		`);
	});
});
