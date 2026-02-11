import {
	writeRedirectedWranglerConfig,
	writeWranglerConfig,
} from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
/* eslint-disable workers-sdk/no-vitest-import-expect -- expect used in MSW handler callbacks */
import { beforeEach, describe, expect, it, test, vi } from "vitest";
/* eslint-enable workers-sdk/no-vitest-import-expect */
import { dedent } from "../../utils/dedent";
import { generatePreviewAlias } from "../../versions/upload";
import { makeApiRequestAsserter } from "../helpers/assert-request";
import { captureRequestsFrom } from "../helpers/capture-requests-from";
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

		assertApiRequest(/.*?workers\/scripts\/test-name\/versions/, {
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

			expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mMultiple environments are defined in the Wrangler configuration file, but no target environment was specified for the versions upload command.[0m

				  To avoid unintentional changes to the wrong environment, it is recommended to explicitly specify
				  the target environment using the \`-e|--env\` flag.
				  If your intention is to use the top-level environment of your configuration simply pass an empty
				  string to the flag to target such environment. For example \`--env=""\`.

				"
			`);
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
		expect(result).toBeDefined();
		expect(result).toMatch(/^a{36}-[a-f0-9]{4}$/);
		expect(result?.length).toBe(41);
		expect(result).not.toBeUndefined();
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
		expect(result).toMatch(
			/^some-really-really-really-really-really-long-br-[a-f0-9]{4}$/
		);
		expect(result?.length).toBe(52);
		expect(result).not.toBeUndefined();
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
