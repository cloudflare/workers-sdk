import { http, HttpResponse } from "msw";
import { generatePreviewAlias } from "../../versions/upload";
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
import { toString } from "../helpers/serialize-form-data-entry";
import { writeWorkerSource } from "../helpers/write-worker-source";
import { writeWranglerConfig } from "../helpers/write-wrangler-config";
import type { WorkerMetadata } from "../../deployment-bundle/create-worker-upload-form";

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
	function mockUploadVersion(
		has_preview: boolean,
		flakeCount = 1,
		expectedAnnotations?: Record<string, string>
	) {
		msw.use(
			http.post(
				`*/accounts/:accountId/workers/scripts/:scriptName/versions`,
				async ({ params, request }) => {
					const formBody = await request.formData();
					const metadata = JSON.parse(
						await toString(formBody.get("metadata"))
					) as WorkerMetadata;

					if (expectedAnnotations) {
						expect(metadata.annotations).toEqual(expectedAnnotations);
					}

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
			Your Worker has access to the following bindings:
			Binding                                   Resource
			env.KV (xxxx-xxxx-xxxx-xxxx)              KV Namespace
			env.TEST (\\"test-string\\")                  Environment Variable
			env.JSON ({\\"abc\\":\\"def\\",\\"bool\\":true})      Environment Variable

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
			Your Worker has access to the following bindings:
			Binding                       Resource
			env.TEST (\\"test-string\\")      Environment Variable

			Uploaded test-name (TIMINGS)
			Worker Version ID: 51e4886e-2db7-4900-8d38-fbfecfeab993
			Version Preview URL: https://51e4886e-test-name.test-sub-domain.workers.dev"
		`);
	});

	test("should allow specifying --preview-alias", async () => {
		mockGetScript();
		mockUploadVersion(true, 1, { "workers/alias": "abcd1234" });
		mockGetWorkerSubdomain({ enabled: true, previews_enabled: true });
		mockSubDomainRequest();
		writeWranglerConfig({
			name: "test-name",
			main: "./index.js",
		});
		writeWorkerSource();

		await runWrangler("versions upload --preview-alias abcd1234");

		expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Worker Startup Time: 500 ms
			Uploaded test-name (TIMINGS)
			Worker Version ID: 51e4886e-2db7-4900-8d38-fbfecfeab993
			Version Preview URL: https://51e4886e-test-name.test-sub-domain.workers.dev
			Version Preview Alias URL: https://abcd1234-test-name.test-sub-domain.workers.dev"
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
			Your Worker has access to the following bindings:
			Binding                       Resource
			env.TEST (\\"test-string\\")      Environment Variable

			Uploaded test-name (TIMINGS)
			Worker Version ID: 51e4886e-2db7-4900-8d38-fbfecfeab993"
		`);

		expect(std.info).toContain("Retrying API call after error...");
	});
});

const mockExecSync = vi.fn();

describe("generatePreviewAlias", () => {
	vi.mock("child_process", () => ({
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		execSync: (...args: any[]) => mockExecSync(...args),
	}));

	beforeEach(() => {
		mockExecSync.mockReset();
	});

	it("returns undefined if not in a git directory", () => {
		mockExecSync.mockImplementationOnce(() => {
			throw new Error("not a git repo");
		});

		const result = generatePreviewAlias("worker");
		expect(result).toBeUndefined();
	});

	it("returns undefined if git branch name cannot be retrieved", () => {
		mockExecSync
			.mockImplementationOnce(() => {}) // is-inside-work-tree
			.mockImplementationOnce(() => {
				throw new Error("failed to get branch");
			});

		const result = generatePreviewAlias("worker");
		expect(result).toBeUndefined();
	});

	it("sanitizes branch names correctly", () => {
		mockExecSync
			.mockImplementationOnce(() => {}) // is-inside-work-tree
			.mockImplementationOnce(() => Buffer.from("feat/awesome-feature"));

		const result = generatePreviewAlias("worker");
		expect(result).toBe("feat-awesome-feature");
	});

	it("returns undefined for long branch names which don't fit within DNS label constraints", () => {
		const longBranch = "a".repeat(70);
		mockExecSync
			.mockImplementationOnce(() => {}) // is-inside-work-tree
			.mockImplementationOnce(() => Buffer.from(longBranch));

		const result = generatePreviewAlias("worker");
		expect(result).toBeUndefined();
	});

	it("handles multiple, leading, and trailing dashes", () => {
		mockExecSync
			.mockImplementationOnce(() => {}) // is-inside-work-tree
			.mockImplementationOnce(() => Buffer.from("--some--branch--name--"));

		const result = generatePreviewAlias("testscript");
		expect(result).toBe("some-branch-name");
	});

	it("lowercases branch names", () => {
		mockExecSync
			.mockImplementationOnce(() => {}) // is-inside-work-tree
			.mockImplementationOnce(() => Buffer.from("HEAD/feature/work"));

		const result = generatePreviewAlias("testscript");
		expect(result).toBe("head-feature-work");
	});
});
