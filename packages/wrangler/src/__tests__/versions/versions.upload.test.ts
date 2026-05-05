import * as fs from "node:fs";
import {
	writeRedirectedWranglerConfig,
	writeWranglerConfig,
} from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
// eslint-disable-next-line no-restricted-imports
import { assert, beforeEach, describe, expect, it, test, vi } from "vitest";
import { multiEnvWarning } from "../helpers/multi-env-warning";
import { dedent } from "../../utils/dedent";
import { generatePreviewAlias } from "../../versions/upload";
import { makeApiRequestAsserter } from "../helpers/assert-request";
import { captureRequestsFrom } from "../helpers/capture-requests-from";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { mockConfirm } from "../helpers/mock-dialogs";
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
import type { WorkerMetadata } from "@cloudflare/workers-utils";

describe("versions upload", () => {
	runInTempDir();
	mockAccountId();
	mockApiToken();
	const { setIsTTY } = useMockIsTTY();
	const std = mockConsoleMethods();
	const assertApiRequest = makeApiRequestAsserter(std);

	function mockGetScript(result?: unknown) {
		msw.use(
			http.get(
				`*/accounts/:accountId/workers/services/:scriptName`,
				({ params }) => {
					expect(params.scriptName).toMatch(/^test-name(-test)?/);

					return HttpResponse.json(
						createFetchResult(
							result ?? {
								default_environment: {
									script: {
										last_deployed_from: "wrangler",
									},
								},
							}
						)
					);
				},
				{ once: true }
			)
		);
	}

	function mockGetScriptWithTags(tags: string[] | null) {
		mockGetScript({
			default_environment: {
				script: {
					last_deployed_from: "wrangler",
					tags,
				},
			},
		});
	}

	const mockPatchScriptSettings = captureRequestsFrom(
		http.patch(
			`*/accounts/:accountId/workers/scripts/:scriptName/script-settings`,
			async ({ request }) => {
				return HttpResponse.json(
					createFetchResult(await request.clone().json())
				);
			}
		)
	);

	function mockUploadVersion(
		has_preview: boolean,
		flakeCount = 1,
		expectedAnnotations?: Record<string, string | undefined>
	) {
		const requests: Request[] = [];
		msw.use(
			http.post(
				`*/accounts/:accountId/workers/scripts/:scriptName/versions`,
				async ({ params, request }) => {
					requests.push(request.clone());
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

					expect(params.scriptName).toMatch(/^test-name(-test)?/);

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
		return requests;
	}

	/** Parse the WorkerMetadata from a captured upload request */
	async function getMetadata(request: Request) {
		const formBody = await request.clone().formData();
		return JSON.parse(
			await toString(formBody.get("metadata"))
		) as WorkerMetadata;
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
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Total Upload: xx KiB / gzip: xx KiB
			Worker Startup Time: 500 ms
			Your Worker has access to the following bindings:
			Binding                                   Resource
			env.KV (xxxx-xxxx-xxxx-xxxx)              KV Namespace
			env.TEST ("test-string")                  Environment Variable
			env.JSON ({"abc":"def","bool":true})      Environment Variable

			Uploaded test-name (TIMINGS)
			Worker Version ID: 51e4886e-2db7-4900-8d38-fbfecfeab993"
		`);
	});

	test("should render config vars literally and --var as hidden", async () => {
		mockGetScript();
		mockUploadVersion(false);

		writeWranglerConfig({
			name: "test-name",
			main: "./index.js",
			vars: {
				CONFIG_VAR: "visible value",
			},
		});
		writeWorkerSource();
		setIsTTY(false);

		const result = runWrangler("versions upload --var CLI_VAR:from_cli");

		await expect(result).resolves.toBeUndefined();

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Total Upload: xx KiB / gzip: xx KiB
			Worker Startup Time: 500 ms
			Your Worker has access to the following bindings:
			Binding                               Resource
			env.CONFIG_VAR ("visible value")      Environment Variable
			env.CLI_VAR ("(hidden)")              Environment Variable

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
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Total Upload: xx KiB / gzip: xx KiB
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
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Total Upload: xx KiB / gzip: xx KiB
			Worker Startup Time: 500 ms
			Your Worker has access to the following bindings:
			Binding                       Resource
			env.TEST ("test-string")      Environment Variable

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
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Total Upload: xx KiB / gzip: xx KiB
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

		const result = runWrangler("versions upload", { WRANGLER_LOG: "debug" });

		await expect(result).resolves.toBeUndefined();

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Total Upload: xx KiB / gzip: xx KiB
			Worker Startup Time: 500 ms
			Your Worker has access to the following bindings:
			Binding                       Resource
			env.TEST ("test-string")      Environment Variable

			Uploaded test-name (TIMINGS)
			Worker Version ID: 51e4886e-2db7-4900-8d38-fbfecfeab993"
		`);

		expect(std.debug).toContain("Retrying API call after error...");
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

		assertApiRequest(expect, /.*?workers\/scripts\/test-name\/versions/, {
			method: "POST",
			// Make sure the main module (index.py) has a text/x-python content type
			body: /Content-Disposition: form-data; name="index.py"; filename="index.py"\nContent-Type: text\/x-python/,
		});

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			┌─┬─┬─┐
			│ Name │ Type │ Size │
			├─┼─┼─┤
			│ another.py │ python │ xx KiB │
			├─┼─┼─┤
			│ Total (1 module) │ │ xx KiB │
			└─┴─┴─┘
			Total Upload: xx KiB / gzip: xx KiB
			Worker Startup Time: 500 ms
			Uploaded test-name (TIMINGS)
			Worker Version ID: 51e4886e-2db7-4900-8d38-fbfecfeab993
			Version Preview URL: https://51e4886e-test-name.test-sub-domain.workers.dev"
		`);
	});

	describe("Service and environment tagging", () => {
		beforeEach(() => {
			msw.resetHandlers();

			mockUploadVersion(true);
			mockGetWorkerSubdomain({
				enabled: true,
				previews_enabled: true,
				expectedScriptName: false,
			});
			mockSubDomainRequest();
			writeWorkerSource();
			setIsTTY(false);
		});

		test("has environments, no existing tags, top-level env", async () => {
			mockGetScriptWithTags(null);

			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
				env: {
					production: {},
				},
			});

			const patchScriptSettings = mockPatchScriptSettings();

			await runWrangler("versions upload");

			await expect(patchScriptSettings.requests[0].json()).resolves.toEqual({
				tags: ["cf:service=test-name"],
			});
		});

		test("has environments, no existing tags, named env", async () => {
			mockGetScriptWithTags(null);

			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
				env: {
					production: {},
				},
			});

			const patchScriptSettings = mockPatchScriptSettings();

			await runWrangler("versions upload --env production");

			await expect(patchScriptSettings.requests[0].json()).resolves.toEqual({
				tags: ["cf:service=test-name", "cf:environment=production"],
			});
		});

		test("has environments, missing tags, top-level env", async () => {
			mockGetScriptWithTags(["some-tag"]);

			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
				env: {
					production: {},
				},
			});

			const patchScriptSettings = mockPatchScriptSettings();

			await runWrangler("versions upload");

			await expect(patchScriptSettings.requests[0].json()).resolves.toEqual({
				tags: ["some-tag", "cf:service=test-name"],
			});
		});

		test("has environments, missing tags, named env", async () => {
			mockGetScriptWithTags(["some-tag"]);

			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
				env: {
					production: {},
				},
			});

			const patchScriptSettings = mockPatchScriptSettings();

			await runWrangler("versions upload --env production");

			await expect(patchScriptSettings.requests[0].json()).resolves.toEqual({
				tags: ["some-tag", "cf:service=test-name", "cf:environment=production"],
			});
		});

		test("has environments, missing environment tag, named env", async () => {
			mockGetScriptWithTags(["some-tag", "cf:service=test-name"]);

			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
				env: {
					production: {},
				},
			});

			const patchScriptSettings = mockPatchScriptSettings();

			await runWrangler("versions upload --env production");

			await expect(patchScriptSettings.requests[0].json()).resolves.toEqual({
				tags: ["some-tag", "cf:service=test-name", "cf:environment=production"],
			});
		});

		test("has environments, stale service tag, top-level env", async () => {
			mockGetScriptWithTags(["some-tag", "cf:service=some-other-service"]);

			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
				env: {
					production: {},
				},
			});

			const patchScriptSettings = mockPatchScriptSettings();

			await runWrangler("versions upload");

			await expect(patchScriptSettings.requests[0].json()).resolves.toEqual({
				tags: ["some-tag", "cf:service=test-name"],
			});
		});

		test("has environments, stale service tag, named env", async () => {
			mockGetScriptWithTags([
				"some-tag",
				"cf:service=some-other-service",
				"cf:environment=production",
			]);

			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
				env: {
					production: {},
				},
			});

			const patchScriptSettings = mockPatchScriptSettings();

			await runWrangler("versions upload --env production");

			await expect(patchScriptSettings.requests[0].json()).resolves.toEqual({
				tags: ["some-tag", "cf:service=test-name", "cf:environment=production"],
			});
		});

		test("has environments, stale environment tag, top-level env", async () => {
			mockGetScriptWithTags([
				"some-tag",
				"cf:service=test-name",
				"cf:environment=some-other-env",
			]);

			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
				env: {
					production: {},
				},
			});

			const patchScriptSettings = mockPatchScriptSettings();

			await runWrangler("versions upload");

			await expect(patchScriptSettings.requests[0].json()).resolves.toEqual({
				tags: ["some-tag", "cf:service=test-name"],
			});
		});

		test("has environments, stale environment tag, named env", async () => {
			mockGetScriptWithTags([
				"some-tag",
				"cf:service=test-name",
				"cf:environment=some-other-env",
			]);

			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
				env: {
					production: {},
				},
			});

			const patchScriptSettings = mockPatchScriptSettings();

			await runWrangler("versions upload --env production");

			await expect(patchScriptSettings.requests[0].json()).resolves.toEqual({
				tags: ["some-tag", "cf:service=test-name", "cf:environment=production"],
			});
		});

		test("has environments, has expected tags, top-level env", async () => {
			mockGetScriptWithTags(["some-tag", "cf:service=test-name"]);

			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
				env: {
					production: {},
				},
			});

			const patchScriptSettings = mockPatchScriptSettings();

			await runWrangler("versions upload");

			expect(patchScriptSettings.requests.length).toBe(0);
		});

		test("has environments, has expected tags, named env", async () => {
			mockGetScriptWithTags([
				"some-tag",
				"cf:service=test-name",
				"cf:environment=production",
			]);

			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
				env: {
					production: {},
				},
			});

			const patchScriptSettings = mockPatchScriptSettings();

			await runWrangler("versions upload --env production");

			expect(patchScriptSettings.requests.length).toBe(0);
		});

		test("no environments", async () => {
			mockGetScriptWithTags([
				"some-tag",
				"cf:service=some-other-service",
				"cf:environment=some-other-env",
			]);

			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
			});

			const patchScriptSettings = mockPatchScriptSettings();

			await runWrangler("versions upload");

			await expect(patchScriptSettings.requests[0].json()).resolves.toEqual({
				tags: ["some-tag"],
			});
		});

		test("no top-level name", async () => {
			mockGetScriptWithTags(["some-tag", "cf:service=undefined"]);

			writeWranglerConfig({
				name: undefined,
				main: "./index.js",
				env: {
					production: {
						name: "test-name-production",
					},
				},
			});

			const patchScriptSettings = mockPatchScriptSettings();

			await runWrangler("versions upload --env production");

			await expect(patchScriptSettings.requests[0].json()).resolves.toEqual({
				tags: ["some-tag"],
			});

			expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mNo top-level \`name\` has been defined in Wrangler configuration. Add a top-level \`name\` to group this Worker together with its sibling environments in the Cloudflare dashboard.[0m

				"
			`);
		});

		test("environments with redirected config", async () => {
			mockGetScriptWithTags(["some-tag"]);

			writeWranglerConfig(
				{
					name: "test-name",
					main: "./index.js",
					env: {
						production: {
							name: "test-name-production",
						},
					},
				},
				"./wrangler.toml"
			);

			writeRedirectedWranglerConfig(
				{
					name: "test-name-production",
					main: "../index.js",
					userConfigPath: "./wrangler.toml",
					topLevelName: "test-name",
					targetEnvironment: "production",
					definedEnvironments: ["production"],
				},
				"./dist/wrangler.json"
			);

			const patchScriptSettings = mockPatchScriptSettings();

			await runWrangler("versions upload");

			await expect(patchScriptSettings.requests[0].json()).resolves.toEqual({
				tags: ["some-tag", "cf:service=test-name", "cf:environment=production"],
			});

			expect(std.info).toContain(dedent`
				Using redirected Wrangler configuration.
				 - Configuration being used: "dist/wrangler.json"
				 - Original user's configuration: "wrangler.toml"
				 - Deploy configuration file: ".wrangler/deploy/config.json"`);
		});

		test("displays warning when error updating tags", async () => {
			mockGetScriptWithTags([
				"some-tag",
				"cf:service=some-other-service",
				"cf:environment=some-other-env",
			]);

			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
				env: {
					production: {},
				},
			});

			const patchScriptSettings = captureRequestsFrom(
				http.patch(
					`*/accounts/:accountId/workers/scripts/:scriptName/script-settings`,
					() => HttpResponse.error()
				)
			)();

			await runWrangler("versions upload --env production");

			await expect(patchScriptSettings.requests[0].json()).resolves.toEqual({
				tags: ["some-tag", "cf:service=test-name", "cf:environment=production"],
			});

			expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mCould not apply service and environment tags. This Worker will not appear grouped together with its sibling environments in the Cloudflare dashboard.[0m

				"
			`);
		});
	});

	describe("multi-env warning", () => {
		it("should warn if the wrangler config contains environments but none was specified in the command", async () => {
			mockGetScript();
			mockUploadVersion(true);
			mockPatchScriptSettings();
			mockGetWorkerSubdomain({
				enabled: true,
				previews_enabled: false,
				useServiceEnvironments: false,
			});

			// Setup
			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
				env: {
					test: {},
				},
			});
			writeWorkerSource();
			setIsTTY(false);

			const result = runWrangler("versions upload");

			await expect(result).resolves.toBeUndefined();

			expect(std.warn).toMatchInlineSnapshot(multiEnvWarning("versions upload"));
		});

		it("should not warn if the wrangler config contains environments and one was specified in the command", async () => {
			mockGetScript();
			mockUploadVersion(true);
			mockPatchScriptSettings();
			mockGetWorkerSubdomain({
				enabled: true,
				previews_enabled: false,
				useServiceEnvironments: false,
				env: "test",
			});

			// Setup
			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
				env: {
					test: {},
				},
			});
			writeWorkerSource();
			setIsTTY(false);

			const result = runWrangler("versions upload -e test");

			await expect(result).resolves.toBeUndefined();

			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("should not warn if the wrangler config doesn't contain environments and none was specified in the command", async () => {
			mockGetScript();
			mockUploadVersion(true);
			mockGetWorkerSubdomain({ enabled: true, previews_enabled: false });

			// Setup
			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
			});
			writeWorkerSource();
			setIsTTY(false);

			const result = runWrangler("versions upload");

			await expect(result).resolves.toBeUndefined();

			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("should not warn if the wrangler config contains environments and CLOUDFLARE_ENV is set", async () => {
			vi.stubEnv("CLOUDFLARE_ENV", "test");
			mockGetScript();
			mockUploadVersion(true);
			mockPatchScriptSettings();
			mockGetWorkerSubdomain({
				enabled: true,
				previews_enabled: false,
				useServiceEnvironments: false,
				env: "test",
			});

			// Setup
			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
				env: {
					test: {},
				},
			});
			writeWorkerSource();
			setIsTTY(false);

			const result = runWrangler("versions upload");

			await expect(result).resolves.toBeUndefined();

			expect(std.warn).toMatchInlineSnapshot(`""`);
		});
	});

	describe("keep_vars", () => {
		beforeEach(() => {
			mockGetScript();
			mockGetWorkerSubdomain({ enabled: true, previews_enabled: false });
			writeWorkerSource();
			setIsTTY(false);
		});

		test("should include plain_text and json in keep_bindings when keep_vars is true", async () => {
			const mockUploadVersionCapture = captureRequestsFrom(
				http.post(
					`*/accounts/:accountId/workers/scripts/:scriptName/versions`,
					async () => {
						return HttpResponse.json(
							createFetchResult({
								id: "version-id",
								startup_time_ms: 500,
								metadata: {
									has_preview: false,
								},
							})
						);
					}
				)
			)();

			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
				keep_vars: true,
			});

			await runWrangler("versions upload");

			const request = mockUploadVersionCapture.requests[0];
			const formBody = await request.clone().formData();
			const metadata = JSON.parse(
				await toString(formBody.get("metadata"))
			) as WorkerMetadata;

			expect(metadata.keep_bindings).toEqual(
				expect.arrayContaining(["plain_text", "json"])
			);
		});

		test("should not include plain_text and json in keep_bindings when keep_vars is false", async () => {
			const mockUploadVersionCapture = captureRequestsFrom(
				http.post(
					`*/accounts/:accountId/workers/scripts/:scriptName/versions`,
					async () => {
						return HttpResponse.json(
							createFetchResult({
								id: "version-id",
								startup_time_ms: 500,
								metadata: {
									has_preview: false,
								},
							})
						);
					}
				)
			)();

			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
				keep_vars: false,
			});

			await runWrangler("versions upload");

			const request = mockUploadVersionCapture.requests[0];
			const formBody = await request.clone().formData();
			const metadata = JSON.parse(
				await toString(formBody.get("metadata"))
			) as WorkerMetadata;

			expect(metadata.keep_bindings).not.toEqual(
				expect.arrayContaining(["plain_text", "json"])
			);
		});

		test("should not include plain_text and json in keep_bindings when keep_vars is not provided", async () => {
			const mockUploadVersionCapture = captureRequestsFrom(
				http.post(
					`*/accounts/:accountId/workers/scripts/:scriptName/versions`,
					async () => {
						return HttpResponse.json(
							createFetchResult({
								id: "version-id",
								startup_time_ms: 500,
								metadata: {
									has_preview: false,
								},
							})
						);
					}
				)
			)();

			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
			});

			await runWrangler("versions upload");

			const request = mockUploadVersionCapture.requests[0];
			const formBody = await request.clone().formData();
			const metadata = JSON.parse(
				await toString(formBody.get("metadata"))
			) as WorkerMetadata;

			expect(metadata.keep_bindings).not.toEqual(
				expect.arrayContaining(["plain_text", "json"])
			);
		});
	});

	describe("containers", () => {
		beforeEach(() => {
			mockGetScript();
			mockGetWorkerSubdomain({ enabled: true, previews_enabled: false });
			writeWorkerSource();
			setIsTTY(false);
		});

		test("should preserve containers config in metadata", async () => {
			msw.use(
				http.get(
					"*/accounts/:accountId/workers/scripts",
					() => {
						return HttpResponse.json({
							success: true,
							errors: [],
							messages: [],
							result: [{ id: "test-name", migration_tag: "v1" }],
						});
					},
					{ once: true }
				)
			);

			const mockUploadVersionCapture = captureRequestsFrom(
				http.post(
					`*/accounts/:accountId/workers/scripts/:scriptName/versions`,
					async () => {
						return HttpResponse.json(
							createFetchResult({
								id: "version-id",
								startup_time_ms: 500,
								metadata: {
									has_preview: false,
								},
							})
						);
					}
				)
			)();

			writeWorkerSource({ durableObjects: ["MyDurableObject"] });

			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
				durable_objects: {
					bindings: [
						{
							name: "MY_DO",
							class_name: "MyDurableObject",
						},
					],
				},
				migrations: [
					{
						tag: "v1",
						new_sqlite_classes: ["MyDurableObject"],
					},
				],
				containers: [
					{
						class_name: "MyDurableObject",
						image: "registry.cloudflare.com/my-image:latest",
						max_instances: 5,
					},
				],
			});

			await runWrangler("versions upload");

			const request = mockUploadVersionCapture.requests[0];
			const formBody = await request.clone().formData();
			const metadata = JSON.parse(
				await toString(formBody.get("metadata"))
			) as WorkerMetadata;

			expect(metadata.containers).toEqual([{ class_name: "MyDurableObject" }]);

			expect(std.warn).toContain(
				"Container configuration changes (such as image, max_instances, etc.) will not be gradually rolled out with versions"
			);
		});
	});

	describe("error validation", () => {
		beforeEach(() => {
			setIsTTY(false);
		});

		test("should error with --node-compat", async ({ expect }) => {
			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
			});
			writeWorkerSource();

			await expect(
				runWrangler("versions upload --node-compat")
			).rejects.toThrow(
				/The --node-compat flag is no longer supported as of Wrangler v4/
			);
		});

		test("should error when using Workers Sites", async ({ expect }) => {
			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
				site: { bucket: "./public" },
			});
			writeWorkerSource();

			await expect(runWrangler("versions upload")).rejects.toThrow(
				/Workers Sites does not support uploading versions/
			);
		});

		test("should error when using --site flag", async ({ expect }) => {
			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
			});
			writeWorkerSource();

			await expect(
				runWrangler("versions upload --site ./public")
			).rejects.toThrow(/Workers Sites does not support uploading versions/);
		});

		test("should error when no name is provided", async ({ expect }) => {
			writeWorkerSource();
			await expect(
				runWrangler("versions upload index.js --latest --dry-run")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: You need to provide a name of your worker. Either pass it as a cli arg with \`--name <name>\` or in your config file as \`name = "<name>"\`]`
			);
		});

		test("should error when no compatibility_date is provided", async ({
			expect,
		}) => {
			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
				compatibility_date: undefined,
			});
			writeWorkerSource();

			await expect(runWrangler("versions upload --dry-run")).rejects.toThrow(
				/A compatibility_date is required when uploading a Worker Version/
			);
		});

		test("should warn when --no-bundle and --minify are used together", async ({
			expect,
		}) => {
			mockGetScript();
			mockUploadVersion(false);

			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
			});
			writeWorkerSource();

			await runWrangler("versions upload --no-bundle --minify");

			expect(std.warn).toContain(
				"`--minify` and `--no-bundle` can't be used together"
			);
		});
	});

	describe("dashboard/API deploy warnings", () => {
		beforeEach(() => {
			setIsTTY(true);
		});

		test("should warn when worker was last deployed from dashboard", async ({
			expect,
		}) => {
			mockGetScript({
				default_environment: {
					script: {
						last_deployed_from: "dash",
						tag: "test-tag",
						tags: null,
					},
				},
			});
			mockUploadVersion(false);

			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
			});
			writeWorkerSource();

			mockConfirm({
				text: "Would you like to continue?",
				result: true,
			});

			await runWrangler("versions upload");

			expect(std.warn).toContain(
				"You are about to upload a Worker Version that was last published via the Cloudflare Dashboard"
			);
		});

		test("should warn when worker was last deployed from API", async ({
			expect,
		}) => {
			mockGetScript({
				default_environment: {
					script: {
						last_deployed_from: "api",
						tag: "test-tag",
						tags: null,
					},
				},
			});
			mockUploadVersion(false);

			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
			});
			writeWorkerSource();

			mockConfirm({
				text: "Would you like to continue?",
				result: true,
			});

			await runWrangler("versions upload");

			expect(std.warn).toContain(
				"You are about to upload a Workers Version that was last updated via the API"
			);
		});

		test("should abort when user declines dashboard override confirmation", async ({
			expect,
		}) => {
			mockGetScript({
				default_environment: {
					script: {
						last_deployed_from: "dash",
						tag: "test-tag",
						tags: null,
					},
				},
			});

			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
			});
			writeWorkerSource();

			mockConfirm({
				text: "Would you like to continue?",
				result: false,
			});

			await runWrangler("versions upload");

			// Should not have uploaded
			expect(std.out).not.toContain("Uploaded");
		});

		test("should handle worker not found gracefully (new worker)", async ({
			expect,
		}) => {
			// Mock a 404 for the service lookup
			msw.use(
				http.get(
					`*/accounts/:accountId/workers/services/:scriptName`,
					() => {
						return HttpResponse.json(
							createFetchResult(null, false, [
								{
									code: 10090,
									message: "workers.api.error.service_not_found",
								},
							])
						);
					},
					{ once: true }
				)
			);
			mockUploadVersion(false);

			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
			});
			writeWorkerSource();

			await runWrangler("versions upload");

			expect(std.out).toContain("Uploaded test-name");
		});
	});

	describe("--dry-run", () => {
		beforeEach(() => {
			setIsTTY(false);
		});

		test("should not require auth for dry-run", async ({ expect }) => {
			// Explicitly remove auth credentials to prove dry-run doesn't need them
			vi.stubEnv("CLOUDFLARE_API_TOKEN", "");
			vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "");

			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
			});
			writeWorkerSource();

			await runWrangler("versions upload --dry-run");

			expect(std.out).toContain("--dry-run: exiting now.");
		});

		test("should print bindings in dry-run", async ({ expect }) => {
			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
				vars: { MY_VAR: "my-value" },
				kv_namespaces: [{ binding: "MY_KV", id: "kv-id" }],
			});
			writeWorkerSource();

			await runWrangler("versions upload --dry-run");

			expect(std.out).toContain("MY_VAR");
			expect(std.out).toContain("MY_KV");
			expect(std.out).toContain("--dry-run: exiting now.");
		});
	});

	// --no-bundle, --var/--define/--alias, annotations, non-versioned fields,
	// and compat date/flags override tests are in config-args-merging.test.ts

	describe("upload metadata", () => {
		beforeEach(() => {
			setIsTTY(false);
		});

		test("should include versioned config fields in metadata", async ({
			expect,
		}) => {
			mockGetScript();
			const requests = mockUploadVersion(false);

			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
				compatibility_date: "2024-01-01",
				compatibility_flags: ["nodejs_compat"],
				placement: { mode: "smart" },
				limits: { cpu_ms: 100 },
				cache: { enabled: true },
			});
			writeWorkerSource();

			// Verify --compatibility-date CLI flag overrides config value
			await runWrangler("versions upload --compatibility-date 2025-01-01");

			const metadata = await getMetadata(requests[requests.length - 1]);
			expect(metadata.compatibility_date).toEqual("2025-01-01");
			expect(metadata.compatibility_flags).toEqual(["nodejs_compat"]);
			expect(metadata.placement).toEqual({ mode: "smart" });
			expect(metadata.limits).toEqual({ cpu_ms: 100 });
			// cache is serialized as cache_options in the upload form metadata
			expect((metadata as Record<string, unknown>).cache_options).toEqual({
				enabled: true,
			});
		});
	});

	describe("bindings", () => {
		beforeEach(() => {
			setIsTTY(false);
		});

		test("should include all binding types in upload metadata", async ({
			expect,
		}) => {
			mockGetScript();
			const requests = mockUploadVersion(false);

			msw.use(
				http.get("*/accounts/:accountId/queues", () => {
					return HttpResponse.json({
						success: true,
						errors: [],
						messages: [],
						result: [
							{
								queue_id: "q-id",
								queue_name: "my-queue",
								producers: [],
								consumers: [],
							},
						],
					});
				}),
				http.get("*/accounts/:accountId/r2/buckets/:bucketName", () => {
					return HttpResponse.json(createFetchResult({ name: "my-bucket" }));
				})
			);

			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
				vars: { STRING_VAR: "hello", JSON_VAR: { key: "value" } },
				kv_namespaces: [{ binding: "MY_KV", id: "kv-ns-id-1" }],
				r2_buckets: [{ binding: "MY_R2", bucket_name: "my-bucket" }],
				d1_databases: [
					{
						binding: "MY_DB",
						database_id: "d1-db-id-1",
						database_name: "my-db",
					},
				],
				services: [{ binding: "MY_SERVICE", service: "other-worker" }],
				durable_objects: {
					bindings: [{ name: "MY_DO", class_name: "MyDurableObject" }],
				},
				queues: {
					producers: [{ binding: "MY_QUEUE", queue: "my-queue" }],
				},
				analytics_engine_datasets: [
					{ binding: "MY_AE", dataset: "my-dataset" },
				],
				dispatch_namespaces: [
					{ binding: "MY_DISPATCH", namespace: "my-namespace" },
				],
				mtls_certificates: [
					{ binding: "MY_CERT", certificate_id: "cert-id-1" },
				],
				ai: { binding: "MY_AI" },
				hyperdrive: [{ binding: "MY_HD", id: "hd-config-id" }],
				vectorize: [{ binding: "MY_VEC", index_name: "my-index" }],
				version_metadata: { binding: "MY_VERSION" },
				send_email: [{ name: "MY_EMAIL" }],
			});
			writeWorkerSource({ durableObjects: ["MyDurableObject"] });

			await runWrangler("versions upload");

			const bindings = (await getMetadata(requests[requests.length - 1]))
				.bindings;
			expect(bindings).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						type: "plain_text",
						name: "STRING_VAR",
						text: "hello",
					}),
					expect.objectContaining({
						type: "json",
						name: "JSON_VAR",
						json: { key: "value" },
					}),
					expect.objectContaining({
						type: "kv_namespace",
						name: "MY_KV",
						namespace_id: "kv-ns-id-1",
					}),
					expect.objectContaining({
						type: "r2_bucket",
						name: "MY_R2",
						bucket_name: "my-bucket",
					}),
					expect.objectContaining({
						type: "d1",
						name: "MY_DB",
						id: "d1-db-id-1",
					}),
					expect.objectContaining({
						type: "service",
						name: "MY_SERVICE",
						service: "other-worker",
					}),
					expect.objectContaining({
						type: "durable_object_namespace",
						name: "MY_DO",
						class_name: "MyDurableObject",
					}),
					expect.objectContaining({
						type: "queue",
						name: "MY_QUEUE",
						queue_name: "my-queue",
					}),
					expect.objectContaining({
						type: "analytics_engine",
						name: "MY_AE",
						dataset: "my-dataset",
					}),
					expect.objectContaining({
						type: "dispatch_namespace",
						name: "MY_DISPATCH",
						namespace: "my-namespace",
					}),
					expect.objectContaining({
						type: "mtls_certificate",
						name: "MY_CERT",
						certificate_id: "cert-id-1",
					}),
					expect.objectContaining({ type: "ai", name: "MY_AI" }),
					expect.objectContaining({
						type: "hyperdrive",
						name: "MY_HD",
						id: "hd-config-id",
					}),
					expect.objectContaining({
						type: "vectorize",
						name: "MY_VEC",
						index_name: "my-index",
					}),
					expect.objectContaining({
						type: "version_metadata",
						name: "MY_VERSION",
					}),
					expect.objectContaining({ type: "send_email", name: "MY_EMAIL" }),
				])
			);
		});
	});

	describe("--outdir and --outfile", () => {
		beforeEach(() => {
			setIsTTY(false);
		});

		test("should write bundled output to --outdir", async ({ expect }) => {
			mockGetScript();
			mockUploadVersion(false);

			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
			});
			writeWorkerSource();

			await runWrangler("versions upload --outdir dist");

			expect(fs.existsSync("dist")).toBe(true);
			expect(fs.existsSync("dist/README.md")).toBe(true);
			expect(fs.readFileSync("dist/README.md", "utf-8")).toContain("test-name");
		});

		test("should write form data to --outfile", async ({ expect }) => {
			mockGetScript();
			mockUploadVersion(false);

			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
			});
			writeWorkerSource();

			await runWrangler("versions upload --outfile output/worker.bin");

			expect(fs.existsSync("output/worker.bin")).toBe(true);
			expect(fs.statSync("output/worker.bin").size).toBeGreaterThan(0);
		});
	});

	describe("--latest", () => {
		beforeEach(() => {
			setIsTTY(false);
		});

		test("should warn when using --latest", async ({ expect }) => {
			mockGetScript();
			mockUploadVersion(false);

			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
				compatibility_date: undefined,
			});
			writeWorkerSource();

			await runWrangler("versions upload --latest");

			expect(std.warn).toContain(
				"Using the latest version of the Workers runtime"
			);
			expect(std.out).toContain("Uploaded test-name");
		});
	});

	describe("ES module format validation", () => {
		beforeEach(() => {
			setIsTTY(false);
		});

		test("should error when wasm_modules used with ES modules", async ({
			expect,
		}) => {
			mockGetScript();

			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
				wasm_modules: { MODULE: "module.wasm" },
			});
			writeWorkerSource();
			await fs.promises.writeFile("module.wasm", "fake-wasm");

			await expect(runWrangler("versions upload")).rejects.toThrow(
				/You cannot configure \[wasm_modules\] with an ES module worker/
			);
		});

		test("should error when text_blobs used with ES modules", async ({
			expect,
		}) => {
			mockGetScript();

			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
				text_blobs: { BLOB: "blob.txt" },
			});
			writeWorkerSource();
			await fs.promises.writeFile("blob.txt", "hello");

			await expect(runWrangler("versions upload")).rejects.toThrow(
				/You cannot configure \[text_blobs\] with an ES module worker/
			);
		});

		test("should error when data_blobs used with ES modules", async ({
			expect,
		}) => {
			mockGetScript();

			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
				data_blobs: { DATA: "data.bin" },
			});
			writeWorkerSource();
			await fs.promises.writeFile("data.bin", "binary");

			await expect(runWrangler("versions upload")).rejects.toThrow(
				/You cannot configure \[data_blobs\] with an ES module worker/
			);
		});
	});

	describe("assets", () => {
		beforeEach(() => {
			setIsTTY(false);
		});

		test("should upload assets and include jwt in metadata", async ({
			expect,
		}) => {
			mockGetScript();
			const requests = mockUploadVersion(false, 0);

			// Mock asset upload session
			msw.use(
				http.post(
					`*/accounts/:accountId/workers/scripts/:scriptName/assets-upload-session`,
					() => {
						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: { jwt: "test-assets-jwt", buckets: [[]] },
							},
							{ status: 201 }
						);
					}
				)
			);

			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
				assets: { directory: "./public" },
			});
			writeWorkerSource();
			fs.mkdirSync("public", { recursive: true });
			fs.writeFileSync("public/index.html", "<h1>Hello</h1>");

			await runWrangler("versions upload");

			const metadata = await getMetadata(requests[requests.length - 1]);
			expect(metadata.assets).toBeDefined();
			expect(metadata.assets?.jwt).toEqual("test-assets-jwt");
		});

		test("should upload assets via --assets CLI flag", async ({ expect }) => {
			mockGetScript();
			const requests = mockUploadVersion(false, 0);

			// Mock asset upload session
			msw.use(
				http.post(
					`*/accounts/:accountId/workers/scripts/:scriptName/assets-upload-session`,
					() => {
						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: { jwt: "test-assets-jwt", buckets: [[]] },
							},
							{ status: 201 }
						);
					}
				)
			);

			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
			});
			writeWorkerSource();
			fs.mkdirSync("public", { recursive: true });
			fs.writeFileSync("public/index.html", "<h1>Hello</h1>");

			await runWrangler("versions upload --assets public");

			const metadata = await getMetadata(requests[requests.length - 1]);
			expect(metadata.assets).toBeDefined();
			expect(metadata.assets?.jwt).toEqual("test-assets-jwt");
		});

		test("should not upload assets in dry-run", async ({ expect }) => {
			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
				assets: { directory: "./public" },
			});
			writeWorkerSource();
			fs.mkdirSync("public", { recursive: true });
			fs.writeFileSync("public/index.html", "<h1>Hello</h1>");

			await runWrangler("versions upload --dry-run");

			expect(std.out).toContain("--dry-run: exiting now.");
		});
	});

	describe("durable object migrations", () => {
		beforeEach(() => {
			setIsTTY(false);
		});

		test("should include migrations in upload metadata", async ({ expect }) => {
			mockGetScript();

			// Mock the scripts list for migration tag lookup
			msw.use(
				http.get(
					"*/accounts/:accountId/workers/scripts",
					() => {
						return HttpResponse.json({
							success: true,
							errors: [],
							messages: [],
							result: [{ id: "test-name", migration_tag: "" }],
						});
					},
					{ once: true }
				)
			);

			const requests = mockUploadVersion(false, 0);

			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
				durable_objects: {
					bindings: [{ name: "MY_DO", class_name: "MyDurableObject" }],
				},
				migrations: [
					{
						tag: "v1",
						new_classes: ["MyDurableObject"],
					},
				],
			});
			writeWorkerSource({ durableObjects: ["MyDurableObject"] });

			await runWrangler("versions upload");

			const metadata = await getMetadata(requests[requests.length - 1]);
			expect(metadata.migrations).toBeDefined();
			expect(metadata.migrations?.new_tag).toEqual("v1");
		});

		test("should skip migrations in dry-run", async ({ expect }) => {
			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
				durable_objects: {
					bindings: [{ name: "MY_DO", class_name: "MyDurableObject" }],
				},
				migrations: [
					{
						tag: "v1",
						new_classes: ["MyDurableObject"],
					},
				],
			});
			writeWorkerSource({ durableObjects: ["MyDurableObject"] });

			// No scripts mock needed - dry-run skips migrations
			await runWrangler("versions upload --dry-run");

			expect(std.out).toContain("--dry-run: exiting now.");
		});
	});

	describe("CI override", () => {
		beforeEach(() => {
			setIsTTY(false);
		});

		test("should override worker name with WRANGLER_CI_OVERRIDE_NAME", async ({
			expect,
		}) => {
			vi.stubEnv("WRANGLER_CI_OVERRIDE_NAME", "ci-worker-name");

			msw.use(
				http.get(
					`*/accounts/:accountId/workers/services/:scriptName`,
					({ params }) => {
						expect(params.scriptName).toEqual("ci-worker-name");
						return HttpResponse.json(
							createFetchResult({
								default_environment: {
									script: { last_deployed_from: "wrangler" },
								},
							})
						);
					},
					{ once: true }
				)
			);

			const capture = captureRequestsFrom(
				http.post(
					`*/accounts/:accountId/workers/scripts/:scriptName/versions`,
					async ({ params }) => {
						expect(params.scriptName).toEqual("ci-worker-name");
						return HttpResponse.json(
							createFetchResult({
								id: "version-id",
								startup_time_ms: 500,
								metadata: { has_preview: false },
							})
						);
					}
				)
			)();

			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
			});
			writeWorkerSource();

			await runWrangler("versions upload");

			expect(capture.requests.length).toBe(1);
			expect(std.warn).toContain(
				'Failed to match Worker name. Your config file is using the Worker name "test-name", but the CI system expected "ci-worker-name"'
			);
			expect(std.out).toContain("Uploaded ci-worker-name");
		});
	});

	describe("retry on API failure", () => {
		beforeEach(() => {
			setIsTTY(false);
		});

		test("should retry on transient upload failure", async ({ expect }) => {
			mockGetScript();
			// mockUploadVersion with flakeCount=1 already tests this
			// (first request returns error, second succeeds)
			mockUploadVersion(false, 1);

			writeWranglerConfig({
				name: "test-name",
				main: "./index.js",
			});
			writeWorkerSource();

			await runWrangler("versions upload");

			expect(std.out).toContain("Uploaded test-name");
		});
	});
});

const mockExecSync = vi.fn();

describe("generatePreviewAlias", () => {
	mockConsoleMethods();
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
		const scriptName = "worker";
		mockExecSync
			.mockImplementationOnce(() => {}) // is-inside-work-tree
			.mockImplementationOnce(() => Buffer.from("feat/awesome-feature"));

		const result = generatePreviewAlias(scriptName);
		expect(result).toBe("feat-awesome-feature");
		expect(result).not.toBeUndefined();
		expect((scriptName + "-" + result).length).toBeLessThanOrEqual(63);
	});

	it("truncates and hashes long branch names that don't fit within DNS label constraints", () => {
		const scriptName = "very-long-worker-name";
		const longBranch = "a".repeat(62);
		mockExecSync
			.mockImplementationOnce(() => {}) // is-inside-work-tree
			.mockImplementationOnce(() => Buffer.from(longBranch));

		const result = generatePreviewAlias(scriptName);

		// Should be truncated to fit: max 63 - 21 - 1 = 41 chars
		// With 4-char hash + hyphen, we have 41 - 4 - 1 = 36 chars for the prefix
		assert(result);
		expect(result).toMatch(/^a{36}-[a-f0-9]{4}$/);
		expect(result.length).toBe(41);
		expect((scriptName + "-" + result).length).toBeLessThanOrEqual(63);
	});

	it("handles multiple, leading, and trailing dashes", () => {
		const scriptName = "testscript";
		mockExecSync
			.mockImplementationOnce(() => {}) // is-inside-work-tree
			.mockImplementationOnce(() => Buffer.from("--some--branch--name--"));

		const result = generatePreviewAlias(scriptName);
		expect(result).toBe("some-branch-name");
		expect(result).not.toBeUndefined();
		expect((scriptName + "-" + result).length).toBeLessThanOrEqual(63);
	});

	it("lowercases branch names", () => {
		const scriptName = "testscript";
		mockExecSync
			.mockImplementationOnce(() => {}) // is-inside-work-tree
			.mockImplementationOnce(() => Buffer.from("HEAD/feature/work"));

		const result = generatePreviewAlias(scriptName);
		expect(result).toBe("head-feature-work");
		expect(result).not.toBeUndefined();
		expect((scriptName + "-" + result).length).toBeLessThanOrEqual(63);
	});

	it("Generates from workers ci branch", () => {
		const scriptName = "testscript";
		vi.stubEnv("WORKERS_CI_BRANCH", "some/debug-branch");

		const result = generatePreviewAlias(scriptName);
		expect(result).toBe("some-debug-branch");
		expect(result).not.toBeUndefined();
		expect((scriptName + "-" + result).length).toBeLessThanOrEqual(63);
	});

	it("Truncates and hashes long workers ci branch names", () => {
		const scriptName = "testscript";
		vi.stubEnv(
			"WORKERS_CI_BRANCH",
			"some/really-really-really-really-really-long-branch-name"
		);

		const result = generatePreviewAlias(scriptName);
		assert(result);
		expect(result).toMatch(
			/^some-really-really-really-really-really-long-br-[a-f0-9]{4}$/
		);
		expect(result.length).toBe(52);
		expect((scriptName + "-" + result).length).toBeLessThanOrEqual(63);
	});

	it("Strips leading dashes from branch name", () => {
		const scriptName = "testscript";
		vi.stubEnv("WORKERS_CI_BRANCH", "-some-branch-name");

		const result = generatePreviewAlias(scriptName);
		expect(result).toBe("some-branch-name");
		expect(result).not.toBeUndefined();
		expect((scriptName + "-" + result).length).toBeLessThanOrEqual(63);
	});

	it("Removes concurrent dashes from branch name", () => {
		const scriptName = "testscript";
		vi.stubEnv("WORKERS_CI_BRANCH", "some----branch-----name");

		const result = generatePreviewAlias(scriptName);
		expect(result).toBe("some-branch-name");
		expect(result).not.toBeUndefined();
		expect((scriptName + "-" + result).length).toBeLessThanOrEqual(63);
	});

	it("Does not produce an alias with leading numbers", () => {
		vi.stubEnv("WORKERS_CI_BRANCH", "0AF0ED");

		const result = generatePreviewAlias("testscript");
		expect(result).toBeUndefined();
	});

	it("returns undefined when script name is too long to allow any alias", () => {
		const scriptName = "a".repeat(60);
		mockExecSync
			.mockImplementationOnce(() => {}) // is-inside-work-tree
			.mockImplementationOnce(() => Buffer.from("short-branch"));

		const result = generatePreviewAlias(scriptName);
		expect(result).toBeUndefined();
	});

	it("handles long branch names with truncation", () => {
		const scriptName = "longer-branch-name-worker";
		const longBranch = "a".repeat(100);
		mockExecSync
			.mockImplementationOnce(() => {}) // is-inside-work-tree
			.mockImplementationOnce(() => Buffer.from(longBranch));

		const result = generatePreviewAlias(scriptName);

		expect(result).toBeDefined();
		expect(result).not.toBeUndefined();
		expect((scriptName + "-" + result).length).toBeLessThanOrEqual(63);
	});
});
