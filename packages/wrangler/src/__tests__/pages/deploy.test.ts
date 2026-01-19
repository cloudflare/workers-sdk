import { mkdirSync, writeFileSync } from "node:fs";
import { chdir } from "node:process";
import { writeWranglerConfig } from "@cloudflare/workers-utils/test-helpers";
import { execa } from "execa";
import { http, HttpResponse } from "msw";
import TOML from "smol-toml";
import dedent from "ts-dedent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { version } from "../../../package.json";
import { ROUTES_SPEC_VERSION } from "../../pages/constants";
import { ApiErrorCodes } from "../../pages/errors";
import { isRoutesJSONSpec } from "../../pages/functions/routes-validation";
import { endEventLoop } from "../helpers/end-event-loop";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { mockPrompt } from "../helpers/mock-dialogs";
import { mockGetUploadTokenRequest } from "../helpers/mock-get-pages-upload-token";
import { useMockIsTTY } from "../helpers/mock-istty";
import { mockSetTimeout } from "../helpers/mock-set-timeout";
import { msw } from "../helpers/msw";
import { normalizeProgressSteps } from "../helpers/normalize-progress";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import {
	formDataToObject,
	toString,
} from "../helpers/serialize-form-data-entry";
import type { Project, UploadPayloadFile } from "../../pages/types";
import type { StrictRequest } from "msw";
import type { FormDataEntryValue } from "undici";

describe("pages deploy", () => {
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();

	const workerHasD1Shim = async (contents: FormDataEntryValue | null) =>
		(await toString(contents)).includes("D1_ERROR");

	runInTempDir();
	mockAccountId();
	mockApiToken();
	mockSetTimeout();

	//TODO Abstract MSW handlers that repeat to this level - JACOB
	beforeEach(() => {
		vi.stubEnv("CI", "true");
		setIsTTY(false);
	});

	afterEach(async () => {
		// Force a tick to ensure that all promises resolve
		await endEventLoop();
		// Reset MSW after tick to ensure that all requests have been handled
		msw.resetHandlers();
		msw.restoreHandlers();
	});

	it("should be aliased with 'wrangler pages deploy'", async () => {
		await runWrangler("pages deploy --help");
		await endEventLoop();

		expect(std.out).toMatchInlineSnapshot(`
			"wrangler pages deploy [directory]

			Deploy a directory of static assets as a Pages deployment

			POSITIONALS
			  directory  The directory of static files to upload  [string]

			GLOBAL FLAGS
			      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help      Show help  [boolean]
			  -v, --version   Show version number  [boolean]

			OPTIONS
			      --project-name        The name of the project you want to deploy to  [string]
			      --branch              The name of the branch you want to deploy to  [string]
			      --commit-hash         The SHA to attach to this deployment  [string]
			      --commit-message      The commit message to attach to this deployment  [string]
			      --commit-dirty        Whether or not the workspace should be considered dirty for this deployment  [boolean]
			      --skip-caching        Skip asset caching which speeds up builds  [boolean]
			      --no-bundle           Whether to run bundling on \`_worker.js\` before deploying  [boolean]
			      --upload-source-maps  Whether to upload any server-side sourcemaps with this deployment  [boolean] [default: false]"
		`);
	});

	it("should error if no `[<directory>]` arg is specified in the `pages deploy` command", async () => {
		await expect(
			runWrangler("pages deploy")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Must specify a directory of assets to deploy. Please specify the [<directory>] argument in the \`pages deploy\` command, or configure \`pages_build_output_dir\` in your Wrangler configuration file.]`
		);
	});

	it("should error if no `[--project-name]` is specified", async () => {
		await expect(
			runWrangler("pages deploy public")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Must specify a project name.]`
		);
	});

	it("should error if the [--config] command line arg was specififed", async () => {
		await expect(
			runWrangler("pages deploy public --config=/path/to/wrangler.toml")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Pages does not support custom paths for the Wrangler configuration file]`
		);
	});

	it("should error if the [--env] command line arg was specififed", async () => {
		await expect(
			runWrangler("pages deploy public --env=production")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Pages does not support targeting an environment with the --env flag. Use the --branch flag to target your production or preview branch]`
		);
	});

	it("should upload a directory of files", async () => {
		writeFileSync("logo.png", "foobar");
		mockGetUploadTokenRequest(
			"<<funfetti-auth-jwt>>",
			"some-account-id",
			"foo"
		);

		let getProjectRequestCount = 0;
		msw.use(
			http.post(
				"*/pages/assets/check-missing",
				async ({ request }) => {
					const body = (await request.json()) as { hashes: string[] };

					expect(request.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt>>"
					);
					expect(body).toMatchObject({
						hashes: ["2082190357cfd3617ccfe04f340c6247"],
					});

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: body.hashes,
						},
						{ status: 200 }
					);
				},
				{ once: true }
			),
			http.post(
				"*/pages/assets/upload",
				async ({ request }) => {
					expect(request.headers.get("Authorization")).toMatchInlineSnapshot(
						`"Bearer <<funfetti-auth-jwt>>"`
					);
					expect(await request.json()).toMatchObject([
						{
							key: "2082190357cfd3617ccfe04f340c6247",
							value: Buffer.from("foobar").toString("base64"),
							metadata: {
								contentType: "image/png",
							},
							base64: true,
						},
					]);
					return HttpResponse.json(
						{ success: true, errors: [], messages: [], result: null },
						{ status: 200 }
					);
				},
				{ once: true }
			),
			http.post(
				"*/accounts/:accountId/pages/projects/foo/deployments",
				async ({ request, params }) => {
					expect(params.accountId).toEqual("some-account-id");
					expect(await formDataToObject(await request.formData()))
						.toMatchInlineSnapshot(`
							Array [
							  Object {
							    "name": "manifest",
							    "value": "{\\"/logo.png\\":\\"2082190357cfd3617ccfe04f340c6247\\"}",
							  },
							]
						`);
					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: {
								id: "123-456-789",
								url: "https://abcxyz.foo.pages.dev/",
							},
						},
						{ status: 200 }
					);
				},
				{ once: true }
			),
			http.get(
				"*/accounts/:accountId/pages/projects/foo/deployments/:deploymentId",
				async ({ params }) => {
					expect(params.accountId).toEqual("some-account-id");
					expect(params.deploymentId).toEqual("123-456-789");

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: {
								id: "123-456-789",
								latest_stage: {
									name: "deploy",
									status: "success",
								},
							},
						},
						{ status: 200 }
					);
				},
				{ once: true }
			),
			http.get(
				"*/accounts/:accountId/pages/projects/foo",
				async ({ params }) => {
					getProjectRequestCount++;

					expect(params.accountId).toEqual("some-account-id");

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: { deployment_configs: { production: {}, preview: {} } },
						},
						{ status: 200 }
					);
				}
			)
		);

		await runWrangler("pages deploy . --project-name=foo");

		expect(getProjectRequestCount).toBe(2);
		expect(normalizeProgressSteps(std.out)).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			✨ Success! Uploaded 1 files (TIMINGS)

			🌎 Deploying...
			✨ Deployment complete! Take a peek over at https://abcxyz.foo.pages.dev/"
		`);
	});

	it("should retry uploads", async () => {
		writeFileSync("logo.txt", "foobar");

		mockGetUploadTokenRequest(
			"<<funfetti-auth-jwt>>",
			"some-account-id",
			"foo"
		);

		// Accumulate multiple requests then assert afterwards
		const uploadRequests: StrictRequest<{ hashes: string[] }>[] = [];
		let getProjectRequestCount = 0;

		msw.use(
			http.post<never, { hashes: string[] }>(
				"*/pages/assets/check-missing",
				async ({ request }) => {
					const body = await request.json();

					expect(request.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt>>"
					);
					expect(body).toMatchObject({
						hashes: ["1a98fb08af91aca4a7df1764a2c4ddb0"],
					});

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: body.hashes,
						},
						{ status: 200 }
					);
				},
				{ once: true }
			),
			http.post<never, { hashes: string[] }>(
				"*/pages/assets/upload",
				async ({ request }) => {
					uploadRequests.push(request);
					expect(request.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt>>"
					);
					expect(await request.json()).toMatchObject([
						{
							key: "1a98fb08af91aca4a7df1764a2c4ddb0",
							value: Buffer.from("foobar").toString("base64"),
							metadata: {
								contentType: "text/plain",
							},
							base64: true,
						},
					]);

					if (uploadRequests.length < 2) {
						return HttpResponse.json(
							{
								success: false,
								errors: [
									{
										code: ApiErrorCodes.UNKNOWN_ERROR,
										message: "Something exploded, please retry",
									},
								],
								messages: [],
								result: null,
							},
							{ status: 200 }
						);
					} else {
						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: null,
							},
							{ status: 200 }
						);
					}
				}
			),
			http.post(
				"*/accounts/:accountId/pages/projects/foo/deployments",
				async ({ request, params }) => {
					expect(params.accountId).toEqual("some-account-id");
					expect(await formDataToObject(await request.formData()))
						.toMatchInlineSnapshot(`
							Array [
							  Object {
							    "name": "manifest",
							    "value": "{\\"/logo.txt\\":\\"1a98fb08af91aca4a7df1764a2c4ddb0\\"}",
							  },
							]
						`);

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: {
								id: "abc-def-ghi",
								url: "https://abcxyz.foo.pages.dev/",
							},
						},
						{ status: 200 }
					);
				},
				{ once: true }
			),
			http.get(
				"*/accounts/:accountId/pages/projects/foo/deployments/:deploymentId",
				async ({ params }) => {
					expect(params.accountId).toEqual("some-account-id");
					expect(params.deploymentId).toEqual("abc-def-ghi");

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: {
								latest_stage: {
									name: "deploy",
									status: "success",
								},
							},
						},
						{ status: 200 }
					);
				},
				{ once: true }
			),
			http.get(
				"*/accounts/:accountId/pages/projects/foo",
				async ({ params }) => {
					getProjectRequestCount++;

					expect(params.accountId).toEqual("some-account-id");

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: { deployment_configs: { production: {}, preview: {} } },
						},
						{ status: 200 }
					);
				}
			)
		);

		await runWrangler("pages deploy . --project-name=foo");

		// Should be 2 attempts to upload
		expect(uploadRequests.length).toBe(2);
		expect(getProjectRequestCount).toBe(2);

		expect(normalizeProgressSteps(std.out)).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			✨ Success! Uploaded 1 files (TIMINGS)

			🌎 Deploying...
			✨ Deployment complete! Take a peek over at https://abcxyz.foo.pages.dev/"
		`);
	});

	it("should retry POST /deployments", async () => {
		writeFileSync("logo.txt", "foobar");

		mockGetUploadTokenRequest(
			"<<funfetti-auth-jwt>>",
			"some-account-id",
			"foo"
		);

		// Accumulate multiple requests then assert afterwards
		const requests: StrictRequest<{ hashes: string[] }>[] = [];
		msw.use(
			http.post<never, { hashes: string[] }>(
				"*/pages/assets/check-missing",
				async ({ request }) => {
					const body = await request.json();

					expect(request.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt>>"
					);
					expect(body).toMatchObject({
						hashes: ["1a98fb08af91aca4a7df1764a2c4ddb0"],
					});

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: body.hashes,
						},
						{ status: 200 }
					);
				},
				{ once: true }
			),
			http.post("*/pages/assets/upload", async ({ request }) => {
				expect(request.headers.get("Authorization")).toBe(
					"Bearer <<funfetti-auth-jwt>>"
				);
				expect(await request.json()).toMatchObject([
					{
						key: "1a98fb08af91aca4a7df1764a2c4ddb0",
						value: Buffer.from("foobar").toString("base64"),
						metadata: {
							contentType: "text/plain",
						},
						base64: true,
					},
				]);

				return HttpResponse.json(
					{
						success: true,
						errors: [],
						messages: [],
						result: null,
					},
					{ status: 200 }
				);
			}),
			http.post<{ accountId: string }, { hashes: string[] }>(
				"*/accounts/:accountId/pages/projects/foo/deployments",
				async ({ request, params }) => {
					requests.push(request);
					expect(params.accountId).toEqual("some-account-id");
					if (requests.length === 1) {
						expect(await formDataToObject(await request.formData()))
							.toMatchInlineSnapshot(`
								Array [
								  Object {
								    "name": "manifest",
								    "value": "{\\"/logo.txt\\":\\"1a98fb08af91aca4a7df1764a2c4ddb0\\"}",
								  },
								]
							`);
					}

					if (requests.length < 2) {
						return HttpResponse.json(
							{
								success: false,
								errors: [
									{
										code: ApiErrorCodes.UNKNOWN_ERROR,
										message: "Something exploded, please retry",
									},
								],
								messages: [],
								result: null,
							},
							{ status: 500 }
						);
					} else {
						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: {
									id: "123-456-789",
									url: "https://abcxyz.foo.pages.dev/",
								},
							},
							{ status: 200 }
						);
					}
				}
			),
			http.get(
				"*/accounts/:accountId/pages/projects/foo/deployments/:deploymentId",
				async ({ params }) => {
					expect(params.accountId).toEqual("some-account-id");
					expect(params.deploymentId).toEqual("123-456-789");

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: {
								latest_stage: {
									name: "deploy",
									status: "success",
								},
							},
						},
						{ status: 200 }
					);
				},
				{ once: true }
			),
			http.get(
				"*/accounts/:accountId/pages/projects/foo",
				async ({ params }) => {
					expect(params.accountId).toEqual("some-account-id");

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: { deployment_configs: { production: {}, preview: {} } },
						},
						{ status: 200 }
					);
				}
			)
		);

		await runWrangler("pages deploy . --project-name=foo");

		// Should be 2 attempts to POST /deployments
		expect(requests.length).toBe(2);

		expect(normalizeProgressSteps(std.out)).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			✨ Success! Uploaded 1 files (TIMINGS)

			🌎 Deploying...
			✨ Deployment complete! Take a peek over at https://abcxyz.foo.pages.dev/"
		`);
	});

	it("should retry GET /deployments/:deploymentId", async () => {
		// set up the directory of static files to upload.
		mkdirSync("public");
		writeFileSync("public/README.md", "This is a readme");

		// set up /functions
		mkdirSync("functions");
		writeFileSync(
			"functions/hello.js",
			`
		const a = true;
		a();

		export async function onRequest() {
			return new Response("Hello, world!");
		}
		`
		);

		mockGetUploadTokenRequest(
			"<<funfetti-auth-jwt>>",
			"some-account-id",
			"foo"
		);

		let getProjectRequestCount = 0;
		let getDeploymentDetailsRequestCount = 0;

		msw.use(
			http.post(
				"*/pages/assets/check-missing",
				async ({ request }) => {
					const body = (await request.json()) as {
						hashes: string[];
					};

					expect(request.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt>>"
					);
					expect(body).toMatchObject({
						hashes: ["13a03eaf24ae98378acd36ea00f77f2f"],
					});

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: body.hashes,
						},
						{ status: 200 }
					);
				},
				{ once: true }
			),
			http.post(
				"*/pages/assets/upload",
				async ({ request }) => {
					expect(request.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt>>"
					);

					expect(await request.json()).toMatchObject([
						{
							key: "13a03eaf24ae98378acd36ea00f77f2f",
							value: Buffer.from("This is a readme").toString("base64"),
							metadata: {
								contentType: "text/markdown",
							},
							base64: true,
						},
					]);
					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: true,
						},
						{ status: 200 }
					);
				},
				{ once: true }
			),
			http.post(
				`*/pages/assets/upsert-hashes`,
				async ({ request }) => {
					expect(request.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt>>"
					);

					expect(await request.json()).toMatchObject({
						hashes: ["13a03eaf24ae98378acd36ea00f77f2f"],
					});

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: true,
						},
						{ status: 200 }
					);
				},
				{ once: true }
			),
			http.post(
				"*/accounts/:accountId/pages/projects/foo/deployments",
				async ({ request, params }) => {
					expect(params.accountId).toEqual("some-account-id");
					const body = await request.formData();
					const manifest = JSON.parse(await toString(body.get("manifest")));

					// make sure this is all we uploaded
					expect([...body.keys()]).toEqual([
						"manifest",
						"functions-filepath-routing-config.json",
						"_worker.bundle",
						"_routes.json",
					]);

					expect(manifest).toMatchInlineSnapshot(`
				Object {
				  "/README.md": "13a03eaf24ae98378acd36ea00f77f2f",
				}
			`);

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: {
								id: "123-456-789",
								url: "https://abcxyz.foo.pages.dev/",
							},
						},
						{ status: 200 }
					);
				},
				{ once: true }
			),
			http.get(
				"*/accounts/:accountId/pages/projects/foo/deployments/:deploymentId",
				async ({ params }) => {
					getDeploymentDetailsRequestCount++;

					expect(params.accountId).toEqual("some-account-id");
					expect(params.deploymentId).toEqual("123-456-789");

					if (getDeploymentDetailsRequestCount < 3) {
						// return a deployment stage != `deploy` for first 2 requests
						// this will force wrangler to retry
						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: {
									latest_stage: {
										name: "initialize",
										status: "active",
									},
								},
							},
							{ status: 200 }
						);
					} else {
						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: {
									latest_stage: {
										name: "deploy",
										status: "success",
									},
								},
							},
							{ status: 200 }
						);
					}
				}
			),
			http.get(
				"*/accounts/:accountId/pages/projects/foo",
				async ({ params }) => {
					getProjectRequestCount++;

					expect(params.accountId).toEqual("some-account-id");

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: {
								deployment_configs: { production: {}, preview: {} },
							},
						},
						{ status: 200 }
					);
				}
			)
		);

		await runWrangler("pages deploy public --project-name=foo");

		expect(getProjectRequestCount).toEqual(2);
		expect(getDeploymentDetailsRequestCount).toEqual(3);
		expect(normalizeProgressSteps(std.out)).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			✨ Compiled Worker successfully
			✨ Success! Uploaded 1 files (TIMINGS)

			✨ Uploading Functions bundle
			🌎 Deploying...
			✨ Deployment complete! Take a peek over at https://abcxyz.foo.pages.dev/"
		`);

		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	it("should refetch a JWT if it expires while uploading", async () => {
		writeFileSync("logo.txt", "foobar");
		mockGetUploadTokenRequest(
			"<<funfetti-auth-jwt>>",
			"some-account-id",
			"foo"
		);

		msw.use(
			http.post<never, { hashes: string[] }>(
				"*/pages/assets/check-missing",
				async ({ request }) => {
					const body = await request.json();

					expect(request.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt>>"
					);
					expect(body).toMatchObject({
						hashes: ["1a98fb08af91aca4a7df1764a2c4ddb0"],
					});

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: body.hashes,
						},
						{ status: 200 }
					);
				},
				{ once: true }
			),
			http.post<never, { hashes: string[] }>(
				"*/pages/assets/upload",
				async ({ request }) => {
					expect(request.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt>>"
					);
					return HttpResponse.json(
						{
							success: false,
							errors: [
								{
									code: ApiErrorCodes.UNAUTHORIZED,
									message: "Authorization failed",
								},
							],
							messages: [],
							result: null,
						},
						{ status: 200 }
					);
				},
				{ once: true }
			),
			http.get(
				`*/accounts/:accountId/pages/projects/foo/upload-token`,
				() => {
					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: { jwt: "<<funfetti-auth-jwt2>>" },
						},
						{ status: 200 }
					);
				},
				{ once: true }
			),
			http.post<never, { hashes: string[] }>(
				"*/pages/assets/check-missing",
				async ({ request }) => {
					const body = await request.json();

					expect(request.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt2>>"
					);
					expect(body).toMatchObject({
						hashes: ["1a98fb08af91aca4a7df1764a2c4ddb0"],
					});

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: body.hashes,
						},
						{ status: 200 }
					);
				},
				{ once: true }
			),
			http.post<never, { hashes: string[] }>(
				"*/pages/assets/upload",
				async ({ request }) => {
					expect(request.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt2>>"
					);
					expect(await request.json()).toMatchObject([
						{
							key: "1a98fb08af91aca4a7df1764a2c4ddb0",
							value: Buffer.from("foobar").toString("base64"),
							metadata: {
								contentType: "text/plain",
							},
							base64: true,
						},
					]);

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: null,
						},
						{ status: 200 }
					);
				}
			),
			http.post(
				"*/accounts/:accountId/pages/projects/foo/deployments",
				async ({ request, params }) => {
					expect(params.accountId).toEqual("some-account-id");
					expect(await formDataToObject(await request.formData()))
						.toMatchInlineSnapshot(`
							Array [
							  Object {
							    "name": "manifest",
							    "value": "{\\"/logo.txt\\":\\"1a98fb08af91aca4a7df1764a2c4ddb0\\"}",
							  },
							]
						`);

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: {
								id: "123-456-789",
								url: "https://abcxyz.foo.pages.dev/",
							},
						},
						{ status: 200 }
					);
				},
				{ once: true }
			),
			http.get(
				"*/accounts/:accountId/pages/projects/foo/deployments/:deploymentId",
				async ({ params }) => {
					expect(params.accountId).toEqual("some-account-id");
					expect(params.deploymentId).toEqual("123-456-789");

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: {
								latest_stage: {
									name: "deploy",
									status: "success",
								},
							},
						},
						{ status: 200 }
					);
				},
				{ once: true }
			),
			http.get(
				"*/accounts/:accountId/pages/projects/foo",
				async ({ params }) => {
					expect(params.accountId).toEqual("some-account-id");

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: { deployment_configs: { production: {}, preview: {} } },
						},
						{ status: 200 }
					);
				}
			)
		);

		await runWrangler("pages deploy . --project-name=foo");

		expect(normalizeProgressSteps(std.out)).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			✨ Success! Uploaded 1 files (TIMINGS)

			🌎 Deploying...
			✨ Deployment complete! Take a peek over at https://abcxyz.foo.pages.dev/"
		`);
	});

	it("should try to use multiple buckets (up to the max concurrency)", async () => {
		writeFileSync("logo.txt", "foobar");
		writeFileSync("logo.png", "foobar");
		writeFileSync("logo.html", "foobar");
		writeFileSync("logo.js", "foobar");

		mockGetUploadTokenRequest(
			"<<funfetti-auth-jwt>>",
			"some-account-id",
			"foo"
		);

		// Accumulate multiple requests then assert afterwards
		const uploadRequests: StrictRequest<UploadPayloadFile[]>[] = [];
		const bodies: UploadPayloadFile[][] = [];
		let getProjectRequestCount = 0;

		msw.use(
			http.post(
				"*/pages/assets/check-missing",
				async ({ request }) => {
					const body = (await request.json()) as {
						hashes: string[];
					};

					expect(request.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt>>"
					);
					expect(body).toMatchObject({
						hashes: expect.arrayContaining([
							"d96fef225537c9f5e44a3cb27fd0b492",
							"2082190357cfd3617ccfe04f340c6247",
							"6be321bef99e758250dac034474ddbb8",
							"1a98fb08af91aca4a7df1764a2c4ddb0",
						]),
					});

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: body.hashes,
						},
						{ status: 200 }
					);
				},
				{ once: true }
			),
			http.post<never, UploadPayloadFile[]>(
				"*/pages/assets/upload",
				async ({ request }) => {
					uploadRequests.push(request);

					expect(request.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt>>"
					);
					bodies.push(await request.json());

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: null,
						},
						{ status: 200 }
					);
				}
			),
			http.post(
				"*/accounts/:accountId/pages/projects/foo/deployments",
				async ({ request, params }) => {
					expect(params.accountId).toEqual("some-account-id");

					const body = await request.formData();
					const manifest = JSON.parse(await toString(body.get("manifest")));

					expect(manifest).toMatchInlineSnapshot(`
				                                Object {
				                                  "/logo.html": "d96fef225537c9f5e44a3cb27fd0b492",
				                                  "/logo.js": "6be321bef99e758250dac034474ddbb8",
				                                  "/logo.png": "2082190357cfd3617ccfe04f340c6247",
				                                  "/logo.txt": "1a98fb08af91aca4a7df1764a2c4ddb0",
				                                }
			                          `);

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: {
								id: "123-456-789",
								url: "https://abcxyz.foo.pages.dev/",
							},
						},
						{ status: 200 }
					);
				},
				{ once: true }
			),
			http.get(
				"*/accounts/:accountId/pages/projects/foo/deployments/:deploymentId",
				async ({ params }) => {
					expect(params.accountId).toEqual("some-account-id");
					expect(params.deploymentId).toEqual("123-456-789");

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: {
								id: "123-456-789",
								latest_stage: {
									name: "deploy",
									status: "success",
								},
							},
						},
						{ status: 200 }
					);
				},
				{ once: true }
			),
			http.get(
				"*/accounts/:accountId/pages/projects/foo",
				async ({ params }) => {
					getProjectRequestCount++;
					expect(params.accountId).toEqual("some-account-id");

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: {
								deployment_configs: { production: {}, preview: {} },
							},
						},
						{ status: 200 }
					);
				}
			)
		);

		await runWrangler("pages deploy . --project-name=foo");

		expect(getProjectRequestCount).toEqual(2);

		// We have 3 buckets, so expect 3 uploads
		expect(uploadRequests.length).toBe(3);

		// One bucket should end up with 2 files
		expect(bodies.map((b) => b.length).sort()).toEqual([1, 1, 2]);
		// But we don't know the order, so flatten and test without ordering
		expect(bodies.flatMap((b) => b)).toEqual(
			expect.arrayContaining([
				{
					base64: true,
					key: "d96fef225537c9f5e44a3cb27fd0b492",
					metadata: { contentType: "text/html" },
					value: "Zm9vYmFy",
				},
				{
					base64: true,
					key: "1a98fb08af91aca4a7df1764a2c4ddb0",
					metadata: { contentType: "text/plain" },
					value: "Zm9vYmFy",
				},
				{
					base64: true,
					key: "6be321bef99e758250dac034474ddbb8",
					metadata: { contentType: "application/javascript" },
					value: "Zm9vYmFy",
				},
				{
					base64: true,
					key: "2082190357cfd3617ccfe04f340c6247",
					metadata: { contentType: "image/png" },
					value: "Zm9vYmFy",
				},
			])
		);

		expect(normalizeProgressSteps(std.out)).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			✨ Success! Uploaded 4 files (TIMINGS)

			🌎 Deploying...
			✨ Deployment complete! Take a peek over at https://abcxyz.foo.pages.dev/"
		`);
	});

	it("should resolve child directories correctly", async () => {
		mkdirSync("public");
		mkdirSync("public/imgs");
		writeFileSync("public/logo.txt", "foobar");
		writeFileSync("public/imgs/logo.png", "foobar");
		writeFileSync("public/logo.html", "foobar");
		writeFileSync("public/logo.js", "foobar");

		mockGetUploadTokenRequest(
			"<<funfetti-auth-jwt>>",
			"some-account-id",
			"foo"
		);

		// Accumulate multiple requests then assert afterwards
		const uploadRequests: StrictRequest<UploadPayloadFile[]>[] = [];
		const bodies: UploadPayloadFile[][] = [];
		let getProjectRequestCount = 0;

		msw.use(
			http.post(
				"*/pages/assets/check-missing",
				async ({ request }) => {
					const body = (await request.json()) as {
						hashes: string[];
					};

					expect(request.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt>>"
					);
					expect(body).toMatchObject({
						hashes: expect.arrayContaining([
							"d96fef225537c9f5e44a3cb27fd0b492",
							"2082190357cfd3617ccfe04f340c6247",
							"6be321bef99e758250dac034474ddbb8",
							"1a98fb08af91aca4a7df1764a2c4ddb0",
						]),
					});

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: body.hashes,
						},
						{ status: 200 }
					);
				},
				{ once: true }
			),
			http.post<never, UploadPayloadFile[]>(
				"*/pages/assets/upload",
				async ({ request }) => {
					uploadRequests.push(request);

					expect(request.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt>>"
					);
					bodies.push(await request.json());

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: null,
						},
						{ status: 200 }
					);
				}
			),
			http.post(
				"*/accounts/:accountId/pages/projects/foo/deployments",
				async ({ request, params }) => {
					expect(params.accountId).toEqual("some-account-id");
					const body = await request.formData();
					const manifest = JSON.parse(await toString(body.get("manifest")));
					expect(manifest).toMatchInlineSnapshot(`
				                                Object {
				                                  "/imgs/logo.png": "2082190357cfd3617ccfe04f340c6247",
				                                  "/logo.html": "d96fef225537c9f5e44a3cb27fd0b492",
				                                  "/logo.js": "6be321bef99e758250dac034474ddbb8",
				                                  "/logo.txt": "1a98fb08af91aca4a7df1764a2c4ddb0",
				                                }
			                          `);

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: {
								id: "abc-def-ghi",
								url: "https://abcxyz.foo.pages.dev/",
							},
						},
						{ status: 200 }
					);
				},
				{ once: true }
			),
			http.get(
				"*/accounts/:accountId/pages/projects/foo/deployments/:deploymentId",
				async ({ params }) => {
					expect(params.accountId).toEqual("some-account-id");
					expect(params.deploymentId).toEqual("abc-def-ghi");

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: {
								latest_stage: {
									name: "deploy",
									status: "success",
								},
							},
						},
						{ status: 200 }
					);
				},
				{ once: true }
			),
			http.get(
				"*/accounts/:accountId/pages/projects/foo",
				async ({ params }) => {
					getProjectRequestCount++;

					expect(params.accountId).toEqual("some-account-id");

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: {
								deployment_configs: { production: {}, preview: {} },
							},
						},
						{ status: 200 }
					);
				}
			)
		);

		await runWrangler(`pages publish public --project-name=foo`);

		expect(getProjectRequestCount).toEqual(2);

		// We have 3 buckets, so expect 3 uploads
		expect(uploadRequests.length).toBe(3);
		// One bucket should end up with 2 files
		expect(bodies.map((b) => b.length).sort()).toEqual([1, 1, 2]);
		// But we don't know the order, so flatten and test without ordering
		expect(bodies.flatMap((b) => b)).toEqual(
			expect.arrayContaining([
				{
					base64: true,
					key: "d96fef225537c9f5e44a3cb27fd0b492",
					metadata: { contentType: "text/html" },
					value: "Zm9vYmFy",
				},
				{
					base64: true,
					key: "1a98fb08af91aca4a7df1764a2c4ddb0",
					metadata: { contentType: "text/plain" },
					value: "Zm9vYmFy",
				},
				{
					base64: true,
					key: "6be321bef99e758250dac034474ddbb8",
					metadata: { contentType: "application/javascript" },
					value: "Zm9vYmFy",
				},
				{
					base64: true,
					key: "2082190357cfd3617ccfe04f340c6247",
					metadata: { contentType: "image/png" },
					value: "Zm9vYmFy",
				},
			])
		);

		expect(normalizeProgressSteps(std.out)).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			✨ Success! Uploaded 4 files (TIMINGS)

			🌎 Deploying...
			✨ Deployment complete! Take a peek over at https://abcxyz.foo.pages.dev/"
		`);
	});

	it("should resolve the current directory correctly", async () => {
		mkdirSync("public");
		mkdirSync("public/imgs");
		writeFileSync("public/logo.txt", "foobar");
		writeFileSync("public/imgs/logo.png", "foobar");
		writeFileSync("public/logo.html", "foobar");
		writeFileSync("public/logo.js", "foobar");

		mockGetUploadTokenRequest(
			"<<funfetti-auth-jwt>>",
			"some-account-id",
			"foo"
		);

		// Accumulate multiple requests then assert afterwards
		const uploadRequests: StrictRequest<UploadPayloadFile[]>[] = [];
		const bodies: UploadPayloadFile[][] = [];
		let getProjectRequestCount = 0;

		msw.use(
			http.post(
				"*/pages/assets/check-missing",
				async ({ request }) => {
					const body = (await request.json()) as {
						hashes: string[];
					};

					expect(request.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt>>"
					);
					expect(body).toMatchObject({
						hashes: expect.arrayContaining([
							"d96fef225537c9f5e44a3cb27fd0b492",
							"2082190357cfd3617ccfe04f340c6247",
							"6be321bef99e758250dac034474ddbb8",
							"1a98fb08af91aca4a7df1764a2c4ddb0",
						]),
					});

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: body.hashes,
						},
						{ status: 200 }
					);
				},
				{ once: true }
			),
			http.post<never, UploadPayloadFile[]>(
				"*/pages/assets/upload",
				async ({ request }) => {
					uploadRequests.push(request);

					expect(request.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt>>"
					);
					bodies.push((await request.json()) as UploadPayloadFile[]);

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: null,
						},
						{ status: 200 }
					);
				}
			),
			http.post(
				"*/accounts/:accountId/pages/projects/foo/deployments",
				async ({ request, params }) => {
					expect(params.accountId).toEqual("some-account-id");

					const body = await request.formData();
					const manifest = JSON.parse(await toString(body.get("manifest")));
					expect(manifest).toMatchInlineSnapshot(`
				                                Object {
				                                  "/imgs/logo.png": "2082190357cfd3617ccfe04f340c6247",
				                                  "/logo.html": "d96fef225537c9f5e44a3cb27fd0b492",
				                                  "/logo.js": "6be321bef99e758250dac034474ddbb8",
				                                  "/logo.txt": "1a98fb08af91aca4a7df1764a2c4ddb0",
				                                }
			                          `);

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: {
								id: "123-456-789",
								url: "https://abcxyz.foo.pages.dev/",
							},
						},
						{ status: 200 }
					);
				},
				{ once: true }
			),
			http.get(
				"*/accounts/:accountId/pages/projects/foo/deployments/:deploymentId",
				async ({ params }) => {
					expect(params.accountId).toEqual("some-account-id");
					expect(params.deploymentId).toEqual("123-456-789");

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: {
								latest_stage: {
									name: "deploy",
									status: "success",
								},
							},
						},
						{ status: 200 }
					);
				},
				{ once: true }
			),
			http.get(
				"*/accounts/:accountId/pages/projects/foo",
				async ({ params }) => {
					getProjectRequestCount++;

					expect(params.accountId).toEqual("some-account-id");

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: {
								deployment_configs: { production: {}, preview: {} },
							},
						},
						{ status: 200 }
					);
				}
			)
		);

		chdir("public");
		await runWrangler(`pages publish . --project-name=foo`);

		expect(getProjectRequestCount).toEqual(2);

		// We have 3 buckets, so expect 3 uploads
		expect(uploadRequests.length).toBe(3);
		// One bucket should end up with 2 files
		expect(bodies.map((b) => b.length).sort()).toEqual([1, 1, 2]);
		// But we don't know the order, so flatten and test without ordering
		expect(bodies.flatMap((b) => b)).toEqual(
			expect.arrayContaining([
				{
					base64: true,
					key: "d96fef225537c9f5e44a3cb27fd0b492",
					metadata: { contentType: "text/html" },
					value: "Zm9vYmFy",
				},
				{
					base64: true,
					key: "1a98fb08af91aca4a7df1764a2c4ddb0",
					metadata: { contentType: "text/plain" },
					value: "Zm9vYmFy",
				},
				{
					base64: true,
					key: "6be321bef99e758250dac034474ddbb8",
					metadata: { contentType: "application/javascript" },
					value: "Zm9vYmFy",
				},
				{
					base64: true,
					key: "2082190357cfd3617ccfe04f340c6247",
					metadata: { contentType: "image/png" },
					value: "Zm9vYmFy",
				},
			])
		);

		expect(normalizeProgressSteps(std.out)).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			✨ Success! Uploaded 4 files (TIMINGS)

			🌎 Deploying...
			✨ Deployment complete! Take a peek over at https://abcxyz.foo.pages.dev/"
		`);
	});

	it("should not error when directory names contain periods and houses a extensionless file", async () => {
		mkdirSync(".well-known");
		// Note: same content as previous test, but since it's a different extension,
		// it hashes to a different value
		writeFileSync(".well-known/foobar", "foobar");

		mockGetUploadTokenRequest(
			"<<funfetti-auth-jwt>>",
			"some-account-id",
			"foo"
		);

		let getProjectRequestCount = 0;

		msw.use(
			http.post(
				"*/pages/assets/check-missing",
				async ({ request }) => {
					const body = (await request.json()) as {
						hashes: string[];
					};

					expect(request.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt>>"
					);
					expect(body).toMatchObject({
						hashes: ["7b764dacfd211bebd8077828a7ddefd7"],
					});

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: body.hashes,
						},
						{ status: 200 }
					);
				},
				{ once: true }
			),

			http.post(
				"*/pages/assets/upload",
				async ({ request }) => {
					expect(request.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt>>"
					);
					const body = (await request.json()) as UploadPayloadFile[];
					expect(body).toMatchObject([
						{
							key: "7b764dacfd211bebd8077828a7ddefd7",
							value: Buffer.from("foobar").toString("base64"),
							metadata: {
								contentType: "application/octet-stream",
							},
							base64: true,
						},
					]);
					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: null,
						},
						{ status: 200 }
					);
				},
				{ once: true }
			),
			http.post(
				"*/accounts/:accountId/pages/projects/foo/deployments",
				async ({ params }) => {
					expect(params.accountId).toEqual("some-account-id");

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: {
								id: "123-456-789",
								url: "https://abcxyz.foo.pages.dev/",
							},
						},
						{ status: 200 }
					);
				},
				{ once: true }
			),
			http.get(
				"*/accounts/:accountId/pages/projects/foo/deployments/:deploymentId",
				async ({ params }) => {
					expect(params.accountId).toEqual("some-account-id");
					expect(params.deploymentId).toEqual("123-456-789");

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: {
								latest_stage: {
									name: "deploy",
									status: "success",
								},
							},
						},
						{ status: 200 }
					);
				},
				{ once: true }
			),
			http.get(
				"*/accounts/:accountId/pages/projects/foo",
				async ({ params }) => {
					getProjectRequestCount++;

					expect(params.accountId).toEqual("some-account-id");

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: {
								deployment_configs: { production: {}, preview: {} },
							},
						},
						{ status: 200 }
					);
				}
			)
		);

		await runWrangler("pages deploy . --project-name=foo");

		expect(getProjectRequestCount).toEqual(2);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	// regression test for issue #3629
	it("should not error when deploying a new project with a new repo", async () => {
		vi.stubEnv("CI", "false");
		setIsTTY(true);
		await execa("git", ["init"]);
		writeFileSync("logo.png", "foobar");
		mockGetUploadTokenRequest(
			"<<funfetti-auth-jwt>>",
			"some-account-id",
			"foo"
		);

		let getProjectRequestCount = 0;
		msw.use(
			http.post(
				"*/pages/assets/check-missing",
				async ({ request }) => {
					const body = (await request.json()) as { hashes: string[] };

					expect(request.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt>>"
					);
					expect(body).toMatchObject({
						hashes: ["2082190357cfd3617ccfe04f340c6247"],
					});

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: body.hashes,
						},
						{ status: 200 }
					);
				},
				{ once: true }
			),
			http.post(
				"*/pages/assets/upload",
				async ({ request }) => {
					expect(request.headers.get("Authorization")).toMatchInlineSnapshot(
						`"Bearer <<funfetti-auth-jwt>>"`
					);
					expect(await request.json()).toMatchObject([
						{
							key: "2082190357cfd3617ccfe04f340c6247",
							value: Buffer.from("foobar").toString("base64"),
							metadata: {
								contentType: "image/png",
							},
							base64: true,
						},
					]);
					return HttpResponse.json(
						{ success: true, errors: [], messages: [], result: null },
						{ status: 200 }
					);
				},
				{ once: true }
			),
			http.post(
				"*/accounts/:accountId/pages/projects/foo/deployments",
				async ({ request, params }) => {
					expect(params.accountId).toEqual("some-account-id");
					expect(await formDataToObject(await request.formData()))
						.toMatchInlineSnapshot(`
							Array [
							  Object {
							    "name": "manifest",
							    "value": "{\\"/logo.png\\":\\"2082190357cfd3617ccfe04f340c6247\\"}",
							  },
							  Object {
							    "name": "commit_dirty",
							    "value": "true",
							  },
							]
						`);
					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: {
								id: "123-456-789",
								url: "https://abcxyz.foo.pages.dev/",
							},
						},
						{ status: 200 }
					);
				},
				{ once: true }
			),
			http.get(
				"*/accounts/:accountId/pages/projects/foo/deployments/:deploymentId",
				async ({ params }) => {
					expect(params.accountId).toEqual("some-account-id");
					expect(params.deploymentId).toEqual("123-456-789");

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: {
								id: "123-456-789",
								latest_stage: {
									name: "deploy",
									status: "success",
								},
							},
						},
						{ status: 200 }
					);
				},
				{ once: true }
			),
			http.get("*/accounts/:accountId/pages/projects", async ({ params }) => {
				getProjectRequestCount++;

				expect(params.accountId).toEqual("some-account-id");

				return HttpResponse.json(
					{
						success: true,
						errors: [],
						messages: [],
						result: [],
					},
					{ status: 200 }
				);
			}),
			http.post(
				"*/accounts/:accountId/pages/projects",
				async ({ request, params }) => {
					const body = (await request.json()) as Record<string, unknown>;

					expect(params.accountId).toEqual("some-account-id");
					expect(body).toEqual({
						name: "foo",
						production_branch: "main",
					});

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: {
								...body,
								subdomain: "foo.pages.dev",
							},
						},
						{ status: 200 }
					);
				},
				{ once: true }
			),
			http.get(
				"*/accounts/:accountId/pages/projects/foo",
				async ({ params }) => {
					getProjectRequestCount++;

					expect(params.accountId).toEqual("some-account-id");

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: {
								deployment_configs: { production: {}, preview: {} },
							},
						},
						{ status: 200 }
					);
				}
			)
		);
		mockPrompt({
			text: "Enter the name of your new project:",
			result: "foo",
		});
		mockPrompt({
			text: "Enter the production branch name:",
			result: "main",
		});
		await runWrangler("pages deploy .");

		expect(getProjectRequestCount).toBe(2);
		expect(normalizeProgressSteps(std.out)).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			✨ Successfully created the 'foo' project.
			✨ Success! Uploaded 1 files (TIMINGS)

			🌎 Deploying...
			✨ Deployment complete! Take a peek over at https://abcxyz.foo.pages.dev/"
		`);
	});

	describe("with Pages Functions", () => {
		it("should upload a Functions project", async () => {
			// set up the directory of static files to upload.
			mkdirSync("public");
			writeFileSync("public/README.md", "This is a readme");

			// set up /functions
			mkdirSync("functions");
			writeFileSync(
				"functions/hello.js",
				`
			export async function onRequest() {
				return new Response("Hello, world!");
			}
			`
			);

			mockGetUploadTokenRequest(
				"<<funfetti-auth-jwt>>",
				"some-account-id",
				"foo"
			);

			let getProjectRequestCount = 0;

			msw.use(
				http.post(
					"*/pages/assets/check-missing",
					async ({ request }) => {
						const body = (await request.json()) as {
							hashes: string[];
						};

						expect(request.headers.get("Authorization")).toBe(
							"Bearer <<funfetti-auth-jwt>>"
						);
						expect(body).toMatchObject({
							hashes: ["13a03eaf24ae98378acd36ea00f77f2f"],
						});

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: body.hashes,
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.post(
					"*/pages/assets/upload",
					async ({ request }) => {
						expect(request.headers.get("Authorization")).toBe(
							"Bearer <<funfetti-auth-jwt>>"
						);

						expect(await request.json()).toMatchObject([
							{
								key: "13a03eaf24ae98378acd36ea00f77f2f",
								value: Buffer.from("This is a readme").toString("base64"),
								metadata: {
									contentType: "text/markdown",
								},
								base64: true,
							},
						]);
						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: true,
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.post(
					`*/pages/assets/upsert-hashes`,
					async ({ request }) => {
						expect(request.headers.get("Authorization")).toBe(
							"Bearer <<funfetti-auth-jwt>>"
						);

						expect(await request.json()).toMatchObject({
							hashes: ["13a03eaf24ae98378acd36ea00f77f2f"],
						});

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: true,
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),

				http.post(
					"*/accounts/:accountId/pages/projects/foo/deployments",
					async ({ request, params }) => {
						expect(params.accountId).toEqual("some-account-id");
						const body = await request.formData();
						const manifest = JSON.parse(await toString(body.get("manifest")));

						// for Functions projects, we auto-generate a `_worker.bundle`,
						// `functions-filepath-routing-config.json`, and `_routes.json`
						// file, based on the contents of `/functions`
						const generatedWorkerBundle = await toString(
							body.get("_worker.bundle")
						);
						const generatedRoutesJSON = await toString(
							body.get("_routes.json")
						);
						const generatedFilepathRoutingConfig = await toString(
							body.get("functions-filepath-routing-config.json")
						);

						// make sure this is all we uploaded
						expect([...body.keys()]).toEqual([
							"manifest",
							"functions-filepath-routing-config.json",
							"_worker.bundle",
							"_routes.json",
						]);

						expect(manifest).toMatchInlineSnapshot(`
				Object {
				  "/README.md": "13a03eaf24ae98378acd36ea00f77f2f",
				}
			`);

						// the contents of the generated `_worker.bundle` file is pretty massive, so I don't
						// think snapshot testing makes much sense here. Plus, calling
						// `.toMatchInlineSnapshot()` without any arguments, in order to generate that
						// snapshot value, doesn't generate anything in this case (probably because the
						// file contents is too big). So for now, let's test that _worker.bundle was indeed
						// generated and that the file size is greater than zero
						expect(generatedWorkerBundle).not.toBeNull();
						expect(generatedWorkerBundle.length).toBeGreaterThan(0);

						const maybeRoutesJSONSpec = JSON.parse(generatedRoutesJSON);
						expect(isRoutesJSONSpec(maybeRoutesJSONSpec)).toBe(true);
						expect(maybeRoutesJSONSpec).toMatchObject({
							version: ROUTES_SPEC_VERSION,
							description: `Generated by wrangler@${version}`,
							include: ["/hello"],
							exclude: [],
						});

						// Make sure the routing config is valid json
						const parsedFilepathRoutingConfig = JSON.parse(
							generatedFilepathRoutingConfig
						);
						// The actual shape doesn't matter that much since this
						// is only used for display in Dash, but it's still useful for
						// tracking unexpected changes to this config.
						expect(parsedFilepathRoutingConfig).toStrictEqual({
							routes: [
								{
									routePath: "/hello",
									mountPath: "/",
									method: "",
									module: ["hello.js:onRequest"],
								},
							],
							baseURL: "/",
						});

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: {
									id: "123-456-789",
									url: "https://abcxyz.foo.pages.dev/",
								},
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.get(
					"*/accounts/:accountId/pages/projects/foo/deployments/:deploymentId",
					async ({ params }) => {
						expect(params.accountId).toEqual("some-account-id");
						expect(params.deploymentId).toEqual("123-456-789");

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: {
									latest_stage: {
										name: "deploy",
										status: "success",
									},
								},
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.get(
					"*/accounts/:accountId/pages/projects/foo",
					async ({ params }) => {
						getProjectRequestCount++;

						expect(params.accountId).toEqual("some-account-id");

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: {
									deployment_configs: { production: {}, preview: {} },
								},
							},
							{ status: 200 }
						);
					}
				)
			);

			await runWrangler("pages deploy public --project-name=foo");

			expect(getProjectRequestCount).toEqual(2);
			expect(normalizeProgressSteps(std.out)).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				✨ Compiled Worker successfully
				✨ Success! Uploaded 1 files (TIMINGS)

				✨ Uploading Functions bundle
				🌎 Deploying...
				✨ Deployment complete! Take a peek over at https://abcxyz.foo.pages.dev/"
			`);

			expect(std.err).toMatchInlineSnapshot('""');
		});

		it("should bundle Functions and resolve its external module imports", async () => {
			// set up the directory of static files to upload.
			mkdirSync("public");
			writeFileSync("public/README.md", "This is a readme");

			// set up some "external" modules
			mkdirSync("external");
			writeFileSync("external/hello.wasm", "Hello Wasm modules world!");
			writeFileSync("external/hello.txt", "Hello Text modules world!");

			// set up Functions
			mkdirSync("functions");
			writeFileSync(
				"functions/hello.js",
				`
				import wasm from "./../external/hello.wasm";
				import text from "./../external/hello.txt"
				export async function onRequest() {
					const helloModule = await WebAssembly.instantiate(wasm);
					const wasmGreeting = helloModule.exports.hello;
					return new Response(wasmGreeting + text);
				}
				`
			);

			mockGetUploadTokenRequest(
				"<<funfetti-auth-jwt>>",
				"some-account-id",
				"foo"
			);

			let getProjectRequestCount = 0;
			msw.use(
				// /pages/assets/check-missing
				http.post(
					"*/pages/assets/check-missing",
					async ({ request }) => {
						const body = (await request.json()) as {
							hashes: string[];
						};

						expect(request.headers.get("Authorization")).toBe(
							"Bearer <<funfetti-auth-jwt>>"
						);
						expect(body).toMatchObject({
							hashes: ["13a03eaf24ae98378acd36ea00f77f2f"],
						});

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: body.hashes,
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),

				// /pages/assets/upload
				http.post(
					"*/pages/assets/upload",
					async ({ request }) => {
						expect(request.headers.get("Authorization")).toBe(
							"Bearer <<funfetti-auth-jwt>>"
						);

						expect(await request.json()).toMatchObject([
							{
								key: "13a03eaf24ae98378acd36ea00f77f2f",
								value: Buffer.from("This is a readme").toString("base64"),
								metadata: {
									contentType: "text/markdown",
								},
								base64: true,
							},
						]);

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: null,
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),

				// /accounts/:accountId/pages/projects/<project-name>/deployments
				http.post(
					"*/accounts/:accountId/pages/projects/foo/deployments",
					async ({ request, params }) => {
						const body = await request.formData();
						const manifest = JSON.parse(await toString(body.get("manifest")));
						const workerBundle = body.get("_worker.bundle");

						expect(params.accountId).toEqual("some-account-id");
						// make sure this is all we uploaded
						expect([...body.keys()].sort()).toEqual(
							[
								"manifest",
								"_worker.bundle",
								"functions-filepath-routing-config.json",
								"_routes.json",
							].sort()
						);
						expect(manifest).toMatchInlineSnapshot(`
				Object {
				  "/README.md": "13a03eaf24ae98378acd36ea00f77f2f",
				}
			`);

						// some fields in workerBundle, such as the undici form boundary
						// or the file hashes, are randomly generated. Let's replace these
						// dynamic values with static ones so we can properly test the
						// contents of `workerBundle`
						// see https://jestjs.io/docs/snapshot-testing#property-matchers
						let workerBundleWithConstantData = (
							await toString(workerBundle)
						).replace(
							/------formdata-undici-0.[0-9]*/g,
							"------formdata-undici-0.test"
						);
						workerBundleWithConstantData = workerBundleWithConstantData.replace(
							/functionsWorker-0.[0-9]*.js/g,
							"functionsWorker-0.test.js"
						);
						workerBundleWithConstantData = workerBundleWithConstantData.replace(
							/[0-9a-z]*-hello.wasm/g,
							"test-hello.wasm"
						);
						workerBundleWithConstantData = workerBundleWithConstantData.replace(
							/[0-9a-z]*-hello.txt/g,
							"test-hello.txt"
						);

						// check we appended the metadata
						expect(workerBundleWithConstantData).toContain(
							`Content-Disposition: form-data; name="metadata"`
						);
						expect(workerBundleWithConstantData).toContain(
							`{"main_module":"functionsWorker-0.test.js"}`
						);

						// check we appended the compiled Worker
						expect(workerBundleWithConstantData).toContain(
							`Content-Disposition: form-data; name="functionsWorker-0.test.js"; filename="functionsWorker-0.test.js"`
						);
						expect(workerBundleWithConstantData).toContain(`
import wasm from "./test-hello.wasm";
import text from "./test-hello.txt";
async function onRequest() {
  const helloModule = await WebAssembly.instantiate(wasm);
  const wasmGreeting = helloModule.exports.hello;
  return new Response(wasmGreeting + text);
}`);

						// check we appended the wasm module
						expect(workerBundleWithConstantData).toContain(
							`Content-Disposition: form-data; name="./test-hello.wasm"; filename="./test-hello.wasm"`
						);
						expect(workerBundleWithConstantData).toContain(
							`Hello Wasm modules world!`
						);

						// check we appended the text module
						expect(workerBundleWithConstantData).toContain(
							`Content-Disposition: form-data; name="./test-hello.txt"; filename="./test-hello.txt"`
						);
						expect(workerBundleWithConstantData).toContain(
							`Hello Text modules world!`
						);

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: {
									id: "123-456-789",
									url: "https://abcxyz.foo.pages.dev/",
								},
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.get(
					"*/accounts/:accountId/pages/projects/foo/deployments/:deploymentId",
					async ({ params }) => {
						expect(params.accountId).toEqual("some-account-id");
						expect(params.deploymentId).toEqual("123-456-789");

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: {
									latest_stage: {
										name: "deploy",
										status: "success",
									},
								},
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),

				// /accounts/:accountId/pages/projects/<project-name>
				http.get(
					"*/accounts/:accountId/pages/projects/foo",
					async ({ params }) => {
						getProjectRequestCount++;

						expect(params.accountId).toEqual("some-account-id");

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: {
									deployment_configs: { production: {}, preview: {} },
								},
							},
							{ status: 200 }
						);
					}
				)
			);

			await runWrangler("pages deploy public --project-name=foo");

			expect(getProjectRequestCount).toEqual(2);
			expect(normalizeProgressSteps(std.out)).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				✨ Compiled Worker successfully
				✨ Success! Uploaded 1 files (TIMINGS)

				✨ Uploading Functions bundle
				🌎 Deploying...
				✨ Deployment complete! Take a peek over at https://abcxyz.foo.pages.dev/"
			`);

			// make sure there were no errors
			expect(std.err).toMatchInlineSnapshot('""');
		});

		it("should upload _routes.json for Functions projects, if provided", async () => {
			// set up the directory of static files to upload.
			mkdirSync("public");
			writeFileSync("public/README.md", "This is a readme");

			// set up /functions
			mkdirSync("functions");
			writeFileSync(
				"functions/hello.js",
				`
			export async function onRequest() {
				return new Response("Hello, world!");
			}
			`
			);

			writeFileSync(
				"functions/goodbye.ts",
				`
			export async function onRequest() {
				return new Response("Bye bye!");
			}
						`
			);

			// set up _routes.json
			writeFileSync(
				"public/_routes.json",
				`
			{
				"version": ${ROUTES_SPEC_VERSION},
				"description": "Custom _routes.json file",
				"include": ["/hello"],
				"exclude": []
			}
						`
			);

			mockGetUploadTokenRequest(
				"<<funfetti-auth-jwt>>",
				"some-account-id",
				"foo"
			);

			let getProjectRequestCount = 0;
			msw.use(
				http.post(
					"*/pages/assets/check-missing",
					async ({ request }) => {
						const body = (await request.json()) as {
							hashes: string[];
						};

						expect(request.headers.get("Authorization")).toBe(
							"Bearer <<funfetti-auth-jwt>>"
						);
						expect(body).toMatchObject({
							hashes: ["13a03eaf24ae98378acd36ea00f77f2f"],
						});

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: body.hashes,
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.post(
					"*/pages/assets/upload",
					async ({ request }) => {
						expect(request.headers.get("Authorization")).toBe(
							"Bearer <<funfetti-auth-jwt>>"
						);

						expect(await request.json()).toMatchObject([
							{
								key: "13a03eaf24ae98378acd36ea00f77f2f",
								value: Buffer.from("This is a readme").toString("base64"),
								metadata: {
									contentType: "text/markdown",
								},
								base64: true,
							},
						]);

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: null,
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.post(
					`*/pages/assets/upsert-hashes`,
					async ({ request }) => {
						expect(request.headers.get("Authorization")).toBe(
							"Bearer <<funfetti-auth-jwt>>"
						);

						expect(await request.json()).toMatchObject({
							hashes: ["13a03eaf24ae98378acd36ea00f77f2f"],
						});

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: true,
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.post(
					"*/accounts/:accountId/pages/projects/foo/deployments",
					async ({ request, params }) => {
						expect(params.accountId).toEqual("some-account-id");
						const body = await request.formData();
						const manifest = JSON.parse(await toString(body.get("manifest")));
						const generatedWorkerBundle = await toString(
							body.get("_worker.bundle")
						);
						const customRoutesJSON = await toString(body.get("_routes.json"));
						const generatedFilepathRoutingConfig = await toString(
							body.get("functions-filepath-routing-config.json")
						);

						// make sure this is all we uploaded
						expect([...body.keys()].sort()).toEqual(
							[
								"manifest",
								"functions-filepath-routing-config.json",
								"_worker.bundle",
								"_routes.json",
							].sort()
						);

						expect(manifest).toMatchInlineSnapshot(`
				Object {
				  "/README.md": "13a03eaf24ae98378acd36ea00f77f2f",
				}
			`);

						// file content of generated `_worker.bundle` is too massive to snapshot test
						expect(generatedWorkerBundle).not.toBeNull();
						expect(generatedWorkerBundle.length).toBeGreaterThan(0);

						const customRoutes = JSON.parse(customRoutesJSON);
						expect(customRoutes).toMatchObject({
							version: ROUTES_SPEC_VERSION,
							description: "Custom _routes.json file",
							include: ["/hello"],
							exclude: [],
						});

						// Make sure the routing config is valid json
						const parsedFilepathRoutingConfig = JSON.parse(
							generatedFilepathRoutingConfig
						);
						// The actual shape doesn't matter that much since this
						// is only used for display in Dash, but it's still useful for
						// tracking unexpected changes to this config.
						expect(parsedFilepathRoutingConfig).toStrictEqual({
							routes: [
								{
									routePath: "/goodbye",
									mountPath: "/",
									method: "",
									module: ["goodbye.ts:onRequest"],
								},
								{
									routePath: "/hello",
									mountPath: "/",
									method: "",
									module: ["hello.js:onRequest"],
								},
							],
							baseURL: "/",
						});

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: {
									id: "123-456-789",
									url: "https://abcxyz.foo.pages.dev/",
								},
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.get(
					"*/accounts/:accountId/pages/projects/foo/deployments/:deploymentId",
					async ({ params }) => {
						expect(params.accountId).toEqual("some-account-id");
						expect(params.deploymentId).toEqual("123-456-789");

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: {
									latest_stage: {
										name: "deploy",
										status: "success",
									},
								},
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.get(
					"*/accounts/:accountId/pages/projects/foo",
					async ({ params }) => {
						getProjectRequestCount++;

						expect(params.accountId).toEqual("some-account-id");

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: {
									deployment_configs: { production: {}, preview: {} },
								},
							},
							{ status: 200 }
						);
					}
				)
			);

			await runWrangler("pages deploy public --project-name=foo");

			expect(getProjectRequestCount).toEqual(2);
			expect(normalizeProgressSteps(std.out)).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				✨ Compiled Worker successfully
				✨ Success! Uploaded 1 files (TIMINGS)

				✨ Uploading Functions bundle
				✨ Uploading _routes.json
				🌎 Deploying...
				✨ Deployment complete! Take a peek over at https://abcxyz.foo.pages.dev/"
			`);

			expect(std.warn).toMatchInlineSnapshot(`""`);
			expect(std.err).toMatchInlineSnapshot('""');
		});

		it("should not deploy Functions projects that provide an invalid custom _routes.json file", async () => {
			// set up the directory of static files to upload.
			mkdirSync("public");
			writeFileSync("public/README.md", "This is a readme");

			// set up _routes.json
			writeFileSync(
				"public/_routes.json",
				`
				{
					"description": "Custom _routes.json file",
					"include": [],
					"exclude": []
				}
				`
			);

			// set up /functions
			mkdirSync("functions");
			writeFileSync(
				"functions/hello.js",
				`
				export async function onRequest() {
					return new Response("Hello, world!");
				}
				`
			);

			mockGetUploadTokenRequest(
				"<<funfetti-auth-jwt>>",
				"some-account-id",
				"foo"
			);

			let getProjectRequestCount = 0;
			msw.use(
				http.post(
					"*/pages/assets/check-missing",
					async ({ request }) => {
						const body = (await request.json()) as {
							hashes: string[];
						};

						expect(request.headers.get("Authorization")).toBe(
							"Bearer <<funfetti-auth-jwt>>"
						);
						expect(body).toMatchObject({
							hashes: ["13a03eaf24ae98378acd36ea00f77f2f"],
						});

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: body.hashes,
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.post(
					"*/pages/assets/upload",
					async ({ request }) => {
						expect(request.headers.get("Authorization")).toBe(
							"Bearer <<funfetti-auth-jwt>>"
						);

						expect(await request.json()).toMatchObject([
							{
								key: "13a03eaf24ae98378acd36ea00f77f2f",
								value: Buffer.from("This is a readme").toString("base64"),
								metadata: {
									contentType: "text/markdown",
								},
								base64: true,
							},
						]);

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: null,
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.get(
					"*/accounts/:accountId/pages/projects/foo",
					async ({ params }) => {
						getProjectRequestCount++;
						expect(params.accountId).toEqual("some-account-id");

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: {
									deployment_configs: { production: {}, preview: {} },
								},
							},
							{ status: 200 }
						);
					}
				)
			);

			await expect(runWrangler("pages deploy public --project-name=foo"))
				.rejects
				.toThrow(`Invalid _routes.json file found at: public/_routes.json
Please make sure the JSON object has the following format:
{
	version: ${ROUTES_SPEC_VERSION};
	include: string[];
	exclude: string[];
}
and that at least one include rule is provided.
		`);
			expect(getProjectRequestCount).toEqual(2);
		});

		it("should fail with the appropriate error message, if the deployment of the project failed", async () => {
			// set up the directory of static files to upload.
			mkdirSync("public");
			writeFileSync("public/README.md", "This is a readme");

			// set up /functions
			mkdirSync("functions");
			writeFileSync(
				"functions/hello.js",
				`
			const a = true;
			a();

			export async function onRequest() {
				return new Response("Hello, world!");
			}
			`
			);

			mockGetUploadTokenRequest(
				"<<funfetti-auth-jwt>>",
				"some-account-id",
				"foo"
			);

			msw.use(
				http.post(
					"*/pages/assets/check-missing",
					async ({ request }) => {
						const body = (await request.json()) as {
							hashes: string[];
						};

						expect(request.headers.get("Authorization")).toBe(
							"Bearer <<funfetti-auth-jwt>>"
						);
						expect(body).toMatchObject({
							hashes: ["13a03eaf24ae98378acd36ea00f77f2f"],
						});

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: body.hashes,
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.post(
					"*/pages/assets/upload",
					async ({ request }) => {
						expect(request.headers.get("Authorization")).toBe(
							"Bearer <<funfetti-auth-jwt>>"
						);

						expect(await request.json()).toMatchObject([
							{
								key: "13a03eaf24ae98378acd36ea00f77f2f",
								value: Buffer.from("This is a readme").toString("base64"),
								metadata: {
									contentType: "text/markdown",
								},
								base64: true,
							},
						]);
						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: true,
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.post(
					`*/pages/assets/upsert-hashes`,
					async ({ request }) => {
						expect(request.headers.get("Authorization")).toBe(
							"Bearer <<funfetti-auth-jwt>>"
						);

						expect(await request.json()).toMatchObject({
							hashes: ["13a03eaf24ae98378acd36ea00f77f2f"],
						});

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: true,
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.post(
					"*/accounts/:accountId/pages/projects/foo/deployments",
					async ({ request, params }) => {
						expect(params.accountId).toEqual("some-account-id");
						const body = await request.formData();
						const manifest = JSON.parse(await toString(body.get("manifest")));

						// make sure this is all we uploaded
						expect([...body.keys()]).toEqual([
							"manifest",
							"functions-filepath-routing-config.json",
							"_worker.bundle",
							"_routes.json",
						]);

						expect(manifest).toMatchInlineSnapshot(`
				Object {
				  "/README.md": "13a03eaf24ae98378acd36ea00f77f2f",
				}
			`);

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: {
									id: "123-456-789",
									url: "https://abcxyz.foo.pages.dev/",
								},
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.get(
					"*/accounts/:accountId/pages/projects/foo/deployments/:deploymentId",
					async ({ params }) => {
						expect(params.accountId).toEqual("some-account-id");
						expect(params.deploymentId).toEqual("123-456-789");

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: {
									latest_stage: {
										name: "deploy",
										status: "failure",
									},
								},
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.get(
					"*/accounts/:accountId/pages/projects/foo/deployments/:deploymentId/history/logs?size=10000000",
					async ({ params }) => {
						expect(params.accountId).toEqual("some-account-id");
						expect(params.deploymentId).toEqual("123-456-789");

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: {
									total: 1,
									data: [
										{
											line: "Error: Failed to publish your Function. Got error: Uncaught TypeError: a is not a function\n  at functionsWorker-0.11031665179307093.js:41:1\n",
											ts: "2024-05-13T12:12:45.606855Z",
										},
									],
								},
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.get(
					"*/accounts/:accountId/pages/projects/foo",
					async ({ params }) => {
						expect(params.accountId).toEqual("some-account-id");

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: {
									deployment_configs: { production: {}, preview: {} },
								},
							},
							{ status: 200 }
						);
					}
				)
			);

			await expect(runWrangler("pages deploy public --project-name=foo"))
				.rejects.toThrow(`Deployment failed!
	Failed to publish your Function. Got error: Uncaught TypeError: a is not a function
  at functionsWorker-0.11031665179307093.js:41:1`);
		});
	});

	describe("in Advanced Mode [_worker,js]", () => {
		it("should upload an Advanced Mode project", async () => {
			// set up the directory of static files to upload.
			mkdirSync("public");
			writeFileSync("public/README.md", "This is a readme");

			// set up _worker.js
			writeFileSync(
				"public/_worker.js",
				`
				export default {
					async fetch(request, env) {
						const url = new URL(request.url);
						console.log("SOMETHING FROM WITHIN THE WORKER");
						return url.pathname.startsWith('/api/') ? new Response('Ok') : env.ASSETS.fetch(request);
					}
				};
			`
			);

			mockGetUploadTokenRequest(
				"<<funfetti-auth-jwt>>",
				"some-account-id",
				"foo"
			);

			let getProjectRequestCount = 0;
			msw.use(
				http.post(
					"*/pages/assets/check-missing",
					async ({ request }) => {
						const body = (await request.json()) as {
							hashes: string[];
						};

						expect(request.headers.get("Authorization")).toBe(
							"Bearer <<funfetti-auth-jwt>>"
						);
						expect(body).toMatchObject({
							hashes: ["13a03eaf24ae98378acd36ea00f77f2f"],
						});

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: body.hashes,
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.post(
					"*/pages/assets/upload",
					async ({ request }) => {
						expect(request.headers.get("Authorization")).toBe(
							"Bearer <<funfetti-auth-jwt>>"
						);

						expect(await request.json()).toMatchObject([
							{
								key: "13a03eaf24ae98378acd36ea00f77f2f",
								value: Buffer.from("This is a readme").toString("base64"),
								metadata: {
									contentType: "text/markdown",
								},
								base64: true,
							},
						]);
						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: true,
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.post(
					"*/accounts/:accountId/pages/projects/foo/deployments",
					async ({ request, params }) => {
						expect(params.accountId).toEqual("some-account-id");
						const body = await request.formData();
						const manifest = JSON.parse(await toString(body.get("manifest")));
						const workerBundle = body.get("_worker.bundle");

						// make sure this is all we uploaded
						expect([...body.keys()].sort()).toEqual(
							["manifest", "_worker.bundle"].sort()
						);

						expect(manifest).toMatchInlineSnapshot(`
				Object {
				  "/README.md": "13a03eaf24ae98378acd36ea00f77f2f",
				}
			`);

						await expect(workerHasD1Shim(workerBundle)).resolves.toBeFalsy();
						expect(await toString(workerBundle)).toContain(
							`console.log("SOMETHING FROM WITHIN THE WORKER");`
						);

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: {
									id: "123-456-789",
									url: "https://abcxyz.foo.pages.dev/",
								},
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.get(
					"*/accounts/:accountId/pages/projects/foo/deployments/:deploymentId",
					async ({ params }) => {
						expect(params.accountId).toEqual("some-account-id");
						expect(params.deploymentId).toEqual("123-456-789");

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: {
									latest_stage: {
										name: "deploy",
										status: "success",
									},
								},
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.get(
					"*/accounts/:accountId/pages/projects/foo",
					async ({ params }) => {
						getProjectRequestCount++;

						expect(params.accountId).toEqual("some-account-id");

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: {
									deployment_configs: {
										production: {
											d1_databases: { MY_D1_DB: { id: "fake-db" } },
										},
										preview: {
											d1_databases: { MY_D1_DB: { id: "fake-db" } },
										},
									},
								} as Partial<Project>,
							},
							{ status: 200 }
						);
					}
				)
			);

			await runWrangler("pages deploy public --project-name=foo");

			expect(getProjectRequestCount).toEqual(2);
			expect(normalizeProgressSteps(std.out)).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				✨ Success! Uploaded 1 files (TIMINGS)

				✨ Compiled Worker successfully
				✨ Uploading Worker bundle
				🌎 Deploying...
				✨ Deployment complete! Take a peek over at https://abcxyz.foo.pages.dev/"
			`);

			expect(std.err).toMatchInlineSnapshot('""');
		});

		it("should bundle _worker.js and resolve its external module imports", async () => {
			// set up the directory of static files to upload
			mkdirSync("public");
			writeFileSync("public/README.md", "This is a readme");

			// set up hello.wasm
			mkdirSync("external");
			writeFileSync("external/hello.wasm", "Hello wasm modules");
			writeFileSync(
				"external/hello.html",
				"<html><body>Hello text modules</body></html>"
			);

			// set up _worker.js
			writeFileSync(
				"public/_worker.js",
				`
				import wasm from "./../external/hello.wasm";
				import html from "./../external/hello.html";
				export default {
					async fetch(request, env) {
						const url = new URL(request.url);
						const helloModule = await WebAssembly.instantiate(wasm);
						const wasmGreeting = helloModule.exports.hello;
						if(url.pathname.startsWith('/hello-wasm')) {
							return new Response(wasmGreeting);
						}
						if(url.pathname.startsWith('/hello-text')) {
							return new Response(html);
						}
						return env.ASSETS.fetch(request);
					}
				};
			`
			);

			mockGetUploadTokenRequest(
				"<<funfetti-auth-jwt>>",
				"some-account-id",
				"foo"
			);

			let getProjectRequestCount = 0;
			msw.use(
				// /pages/assets/check-missing
				http.post(
					"*/pages/assets/check-missing",
					async ({ request }) => {
						const body = (await request.json()) as {
							hashes: string[];
						};

						expect(request.headers.get("Authorization")).toBe(
							"Bearer <<funfetti-auth-jwt>>"
						);
						expect(body).toMatchObject({
							hashes: ["13a03eaf24ae98378acd36ea00f77f2f"],
						});

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: body.hashes,
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),

				// /pages/assets/upload
				http.post(
					"*/pages/assets/upload",
					async ({ request }) => {
						expect(request.headers.get("Authorization")).toBe(
							"Bearer <<funfetti-auth-jwt>>"
						);

						expect(await request.json()).toMatchObject([
							{
								key: "13a03eaf24ae98378acd36ea00f77f2f",
								value: Buffer.from("This is a readme").toString("base64"),
								metadata: {
									contentType: "text/markdown",
								},
								base64: true,
							},
						]);

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: null,
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),

				http.post(
					"*/accounts/:accountId/pages/projects/foo/deployments",
					async ({ request, params }) => {
						const body = await request.formData();
						const manifest = JSON.parse(await toString(body.get("manifest")));
						const workerBundle = body.get("_worker.bundle");

						expect(params.accountId).toEqual("some-account-id");
						// make sure this is all we uploaded
						expect([...body.keys()].sort()).toEqual(
							["manifest", "_worker.bundle"].sort()
						);
						expect(manifest).toMatchInlineSnapshot(`
				Object {
				  "/README.md": "13a03eaf24ae98378acd36ea00f77f2f",
				}
			`);
						// some fields in workerBundle, such as the undici form boundary
						// or the file hashes, are randomly generated. Let's replace these
						// dynamic values with static ones so we can properly test the
						// contents of `workerBundle`
						// see https://jestjs.io/docs/snapshot-testing#property-matchers
						let workerBundleWithConstantData = (
							await toString(workerBundle)
						).replace(
							/------formdata-undici-0.[0-9]*/g,
							"------formdata-undici-0.test"
						);
						workerBundleWithConstantData = workerBundleWithConstantData.replace(
							/bundledWorker-0.[0-9]*.mjs/g,
							"bundledWorker-0.test.mjs"
						);
						workerBundleWithConstantData = workerBundleWithConstantData.replace(
							/[0-9a-z]*-hello.wasm/g,
							"test-hello.wasm"
						);
						workerBundleWithConstantData = workerBundleWithConstantData.replace(
							/[0-9a-z]*-hello.html/g,
							"test-hello.html"
						);

						// we care about a couple of things here, like the presence of `metadata`,
						// `bundledWorker`, the wasm import, etc., and since `workerBundle` is
						// small enough, let's go ahead and snapshot test the whole thing
						expect(workerBundleWithConstantData).toMatchInlineSnapshot(`
							"------formdata-undici-0.test
							Content-Disposition: form-data; name=\\"metadata\\"

							{\\"main_module\\":\\"bundledWorker-0.test.mjs\\"}
							------formdata-undici-0.test
							Content-Disposition: form-data; name=\\"bundledWorker-0.test.mjs\\"; filename=\\"bundledWorker-0.test.mjs\\"
							Content-Type: application/javascript+module

							// _worker.js
							import wasm from \\"./test-hello.wasm\\";
							import html from \\"./test-hello.html\\";
							var worker_default = {
							  async fetch(request, env) {
							    const url = new URL(request.url);
							    const helloModule = await WebAssembly.instantiate(wasm);
							    const wasmGreeting = helloModule.exports.hello;
							    if (url.pathname.startsWith(\\"/hello-wasm\\")) {
							      return new Response(wasmGreeting);
							    }
							    if (url.pathname.startsWith(\\"/hello-text\\")) {
							      return new Response(html);
							    }
							    return env.ASSETS.fetch(request);
							  }
							};
							export {
							  worker_default as default
							};
							//# sourceMappingURL=bundledWorker-0.test.mjs.map

							------formdata-undici-0.test
							Content-Disposition: form-data; name=\\"./test-hello.wasm\\"; filename=\\"./test-hello.wasm\\"
							Content-Type: application/wasm

							Hello wasm modules
							------formdata-undici-0.test
							Content-Disposition: form-data; name=\\"./test-hello.html\\"; filename=\\"./test-hello.html\\"
							Content-Type: text/plain

							<html><body>Hello text modules</body></html>
							------formdata-undici-0.test--
							"
						`);

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: {
									id: "123-456-789",
									url: "https://abcxyz.foo.pages.dev/",
								},
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.get(
					"*/accounts/:accountId/pages/projects/foo/deployments/:deploymentId",
					async ({ params }) => {
						expect(params.accountId).toEqual("some-account-id");
						expect(params.deploymentId).toEqual("123-456-789");

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: {
									latest_stage: {
										name: "deploy",
										status: "success",
									},
								},
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),

				// /accounts/:accountId/pages/projects/<project-name>
				http.get(
					"*/accounts/:accountId/pages/projects/foo",
					async ({ params }) => {
						getProjectRequestCount++;

						expect(params.accountId).toEqual("some-account-id");

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: {
									deployment_configs: { production: {}, preview: {} },
								},
							},
							{ status: 200 }
						);
					}
				)
			);

			await runWrangler("pages deploy public --project-name=foo");

			expect(getProjectRequestCount).toEqual(2);
			expect(normalizeProgressSteps(std.out)).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				✨ Success! Uploaded 1 files (TIMINGS)

				✨ Compiled Worker successfully
				✨ Uploading Worker bundle
				🌎 Deploying...
				✨ Deployment complete! Take a peek over at https://abcxyz.foo.pages.dev/"
			`);

			// make sure there were no errors
			expect(std.err).toMatchInlineSnapshot('""');
		});

		it("should upload _routes.json for Advanced Mode projects, if provided", async () => {
			// set up the directory of static files to upload.
			mkdirSync("public");
			writeFileSync("public/README.md", "This is a readme");

			// set up _routes.json
			writeFileSync(
				"public/_routes.json",
				`
				{
					"version": ${ROUTES_SPEC_VERSION},
					"description": "Custom _routes.json file",
					"include": ["/api/*"],
					"exclude": []
				}
				`
			);

			// set up _worker.js
			writeFileSync(
				"public/_worker.js",
				`
				export default {
					async fetch(request, env) {
						const url = new URL(request.url);
						return url.pathname.startsWith('/api/') ? new Response('Ok') : env.ASSETS.fetch(request);
					}
				};
			`
			);

			mockGetUploadTokenRequest(
				"<<funfetti-auth-jwt>>",
				"some-account-id",
				"foo"
			);

			let getProjectRequestCount = 0;
			msw.use(
				http.post(
					"*/pages/assets/check-missing",
					async ({ request }) => {
						const body = (await request.json()) as {
							hashes: string[];
						};

						expect(request.headers.get("Authorization")).toBe(
							"Bearer <<funfetti-auth-jwt>>"
						);
						expect(body).toMatchObject({
							hashes: ["13a03eaf24ae98378acd36ea00f77f2f"],
						});

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: body.hashes,
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.post(
					"*/pages/assets/upload",
					async ({ request }) => {
						expect(request.headers.get("Authorization")).toBe(
							"Bearer <<funfetti-auth-jwt>>"
						);

						expect(await request.json()).toMatchObject([
							{
								key: "13a03eaf24ae98378acd36ea00f77f2f",
								value: Buffer.from("This is a readme").toString("base64"),
								metadata: {
									contentType: "text/markdown",
								},
								base64: true,
							},
						]);

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: null,
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.post(
					`*/pages/assets/upsert-hashes`,
					async ({ request }) => {
						expect(request.headers.get("Authorization")).toBe(
							"Bearer <<funfetti-auth-jwt>>"
						);

						expect(await request.json()).toMatchObject({
							hashes: ["13a03eaf24ae98378acd36ea00f77f2f"],
						});

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: true,
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.post(
					"*/accounts/:accountId/pages/projects/foo/deployments",
					async ({ request, params }) => {
						const body = await request.formData();

						const manifest = JSON.parse(await toString(body.get("manifest")));
						const workerBundle = body.get("_worker.bundle");
						const customRoutesJSON = await toString(body.get("_routes.json"));

						// make sure this is all we uploaded
						expect([...body.keys()]).toEqual([
							"manifest",
							"_worker.bundle",
							"_routes.json",
						]);
						expect(params.accountId).toEqual("some-account-id");
						expect(manifest).toMatchInlineSnapshot(`
				Object {
				  "/README.md": "13a03eaf24ae98378acd36ea00f77f2f",
				}
			`);

						// some fields in workerBundle, such as the undici form boundary
						// or the file hashes, are randomly generated. Let's replace these
						// dynamic values with static ones so we can properly test the
						// contents of `workerBundle`
						// see https://jestjs.io/docs/snapshot-testing#property-matchers
						let workerBundleWithConstantData = (
							await toString(workerBundle)
						).replace(
							/------formdata-undici-0.[0-9]*/g,
							"------formdata-undici-0.test"
						);
						workerBundleWithConstantData = workerBundleWithConstantData.replace(
							/bundledWorker-0.[0-9]*.mjs/g,
							"bundledWorker-0.test.mjs"
						);

						// we care about a couple of things here, like the presence of `metadata`,
						// `bundledWorker`, the wasm import, etc., and since `workerBundle` is
						// small enough, let's go ahead and snapshot test the whole thing
						expect(workerBundleWithConstantData).toMatchInlineSnapshot(`
							"------formdata-undici-0.test
							Content-Disposition: form-data; name=\\"metadata\\"

							{\\"main_module\\":\\"bundledWorker-0.test.mjs\\"}
							------formdata-undici-0.test
							Content-Disposition: form-data; name=\\"bundledWorker-0.test.mjs\\"; filename=\\"bundledWorker-0.test.mjs\\"
							Content-Type: application/javascript+module

							// _worker.js
							var worker_default = {
							  async fetch(request, env) {
							    const url = new URL(request.url);
							    return url.pathname.startsWith(\\"/api/\\") ? new Response(\\"Ok\\") : env.ASSETS.fetch(request);
							  }
							};
							export {
							  worker_default as default
							};
							//# sourceMappingURL=bundledWorker-0.test.mjs.map

							------formdata-undici-0.test--
							"
						`);

						expect(JSON.parse(customRoutesJSON)).toMatchObject({
							version: ROUTES_SPEC_VERSION,
							description: "Custom _routes.json file",
							include: ["/api/*"],
							exclude: [],
						});

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: {
									id: "123-456-789",
									url: "https://abcxyz.foo.pages.dev/",
								},
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.get(
					"*/accounts/:accountId/pages/projects/foo/deployments/:deploymentId",
					async ({ params }) => {
						expect(params.accountId).toEqual("some-account-id");
						expect(params.deploymentId).toEqual("123-456-789");

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: {
									latest_stage: {
										name: "deploy",
										status: "success",
									},
								},
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.get(
					"*/accounts/:accountId/pages/projects/foo",
					async ({ params }) => {
						getProjectRequestCount++;

						expect(params.accountId).toEqual("some-account-id");

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: {
									deployment_configs: { production: {}, preview: {} },
								},
							},
							{ status: 200 }
						);
					}
				)
			);

			await runWrangler("pages deploy public --project-name=foo");

			expect(getProjectRequestCount).toEqual(2);
			expect(normalizeProgressSteps(std.out)).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				✨ Success! Uploaded 1 files (TIMINGS)

				✨ Compiled Worker successfully
				✨ Uploading Worker bundle
				✨ Uploading _routes.json
				🌎 Deploying...
				✨ Deployment complete! Take a peek over at https://abcxyz.foo.pages.dev/"
			`);

			expect(std.warn).toMatchInlineSnapshot(`""`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should not deploy Advanced Mode projects that provide an invalid _routes.json file", async () => {
			// set up the directory of static files to upload.
			mkdirSync("public");
			writeFileSync("public/README.md", "This is a readme");

			// set up _routes.json
			writeFileSync(
				"public/_routes.json",
				`
				{
					"description": "Custom _routes.json file",
					"include": [],
					"exclude": []
				}
				`
			);

			// set up _worker.js
			writeFileSync(
				"public/_worker.js",
				`
				export default {
					async fetch(request, env) {
						const url = new URL(request.url);
						return url.pathname.startsWith('/api/') ? new Response('Ok') : env.ASSETS.fetch(request);
					}
				};
			`
			);

			mockGetUploadTokenRequest(
				"<<funfetti-auth-jwt>>",
				"some-account-id",
				"foo"
			);

			let getProjectRequestCount = 0;
			msw.use(
				http.post(
					"*/pages/assets/check-missing",
					async ({ request }) => {
						const body = (await request.json()) as {
							hashes: string[];
						};

						expect(request.headers.get("Authorization")).toBe(
							"Bearer <<funfetti-auth-jwt>>"
						);
						expect(body).toMatchObject({
							hashes: ["13a03eaf24ae98378acd36ea00f77f2f"],
						});

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: body.hashes,
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.post(
					"*/pages/assets/upload",
					async ({ request }) => {
						expect(request.headers.get("Authorization")).toBe(
							"Bearer <<funfetti-auth-jwt>>"
						);

						expect(await request.json()).toMatchObject([
							{
								key: "13a03eaf24ae98378acd36ea00f77f2f",
								value: Buffer.from("This is a readme").toString("base64"),
								metadata: {
									contentType: "text/markdown",
								},
								base64: true,
							},
						]);

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: null,
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),

				http.get(
					"*/accounts/:accountId/pages/projects/foo",
					async ({ params }) => {
						getProjectRequestCount++;

						expect(params.accountId).toEqual("some-account-id");
						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: {
									deployment_configs: { production: {}, preview: {} },
								},
							},
							{ status: 200 }
						);
					}
				)
			);

			await expect(runWrangler("pages deploy public --project-name=foo"))
				.rejects
				.toThrow(`Invalid _routes.json file found at: public/_routes.json
Please make sure the JSON object has the following format:
{
	version: 1;
	include: string[];
	exclude: string[];
}
and that at least one include rule is provided.
		`);
			expect(getProjectRequestCount).toEqual(2);
		});

		it("should ignore the entire /functions directory if _worker.js is provided", async () => {
			// set up the directory of static files to upload.
			mkdirSync("public");
			writeFileSync("public/README.md", "This is a readme");

			// set up /functions
			mkdirSync("functions");
			writeFileSync(
				"functions/hello.js",
				`
				export async function onRequest() {
					return new Response("Hello, world!");
				}
				`
			);

			// set up _worker.js
			writeFileSync(
				"public/_worker.js",
				`
				export default {
					async fetch(request, env) {
						const url = new URL(request.url);
						return url.pathname.startsWith('/api/') ? new Response('Ok') : env.ASSETS.fetch(request);
					}
				};
			`
			);

			mockGetUploadTokenRequest(
				"<<funfetti-auth-jwt>>",
				"some-account-id",
				"foo"
			);

			let getProjectRequestCount = 0;
			msw.use(
				http.post(
					"*/pages/assets/check-missing",
					async ({ request }) => {
						const body = (await request.json()) as {
							hashes: string[];
						};

						expect(request.headers.get("Authorization")).toBe(
							"Bearer <<funfetti-auth-jwt>>"
						);
						expect(body).toMatchObject({
							hashes: ["13a03eaf24ae98378acd36ea00f77f2f"],
						});

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: body.hashes,
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.post(
					"*/pages/assets/upload",
					async ({ request }) => {
						expect(request.headers.get("Authorization")).toBe(
							"Bearer <<funfetti-auth-jwt>>"
						);

						expect(await request.json()).toMatchObject([
							{
								key: "13a03eaf24ae98378acd36ea00f77f2f",
								value: Buffer.from("This is a readme").toString("base64"),
								metadata: {
									contentType: "text/markdown",
								},
								base64: true,
							},
						]);

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: null,
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),

				http.post(
					"*/accounts/:accountId/pages/projects/foo/deployments",
					async ({ request, params }) => {
						const body = await request.formData();
						const manifest = JSON.parse(await toString(body.get("manifest")));
						const customWorkerBundle = body.get("_worker.bundle");

						expect(params.accountId).toEqual("some-account-id");
						// make sure this is all we uploaded
						expect([...body.keys()].sort()).toEqual(
							["manifest", "_worker.bundle"].sort()
						);
						expect(manifest).toMatchInlineSnapshot(`
				Object {
				  "/README.md": "13a03eaf24ae98378acd36ea00f77f2f",
				}
			`);

						// some fields in workerBundle, such as the undici form boundary
						// or the file hashes, are randomly generated. Let's replace these
						// dynamic values with static ones so we can properly test the
						// contents of `workerBundle`
						// see https://jestjs.io/docs/snapshot-testing#property-matchers
						let workerBundleWithConstantData = (
							await toString(customWorkerBundle)
						).replace(
							/------formdata-undici-0.[0-9]*/g,
							"------formdata-undici-0.test"
						);
						workerBundleWithConstantData = workerBundleWithConstantData.replace(
							/bundledWorker-0.[0-9]*.mjs/g,
							"bundledWorker-0.test.mjs"
						);

						// we care about a couple of things here, like the presence of `metadata`,
						// `bundledWorker`, the wasm import, etc., and since `workerBundle` is
						// small enough, let's go ahead and snapshot test the whole thing
						expect(workerBundleWithConstantData).toMatchInlineSnapshot(`
							"------formdata-undici-0.test
							Content-Disposition: form-data; name=\\"metadata\\"

							{\\"main_module\\":\\"bundledWorker-0.test.mjs\\"}
							------formdata-undici-0.test
							Content-Disposition: form-data; name=\\"bundledWorker-0.test.mjs\\"; filename=\\"bundledWorker-0.test.mjs\\"
							Content-Type: application/javascript+module

							// _worker.js
							var worker_default = {
							  async fetch(request, env) {
							    const url = new URL(request.url);
							    return url.pathname.startsWith(\\"/api/\\") ? new Response(\\"Ok\\") : env.ASSETS.fetch(request);
							  }
							};
							export {
							  worker_default as default
							};
							//# sourceMappingURL=bundledWorker-0.test.mjs.map

							------formdata-undici-0.test--
							"
						`);

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: {
									id: "123-456-789",
									url: "https://abcxyz.foo.pages.dev/",
								},
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.get(
					"*/accounts/:accountId/pages/projects/foo/deployments/:deploymentId",
					async ({ params }) => {
						expect(params.accountId).toEqual("some-account-id");
						expect(params.deploymentId).toEqual("123-456-789");

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: {
									latest_stage: {
										name: "deploy",
										status: "success",
									},
								},
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.get(
					"*/accounts/:accountId/pages/projects/foo",
					async ({ params }) => {
						getProjectRequestCount++;
						expect(params.accountId).toEqual("some-account-id");

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: {
									deployment_configs: { production: {}, preview: {} },
								},
							},
							{ status: 200 }
						);
					}
				)
			);

			await runWrangler("pages deploy public --project-name=foo");

			expect(getProjectRequestCount).toEqual(2);
			expect(normalizeProgressSteps(std.out)).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				✨ Success! Uploaded 1 files (TIMINGS)

				✨ Compiled Worker successfully
				✨ Uploading Worker bundle
				🌎 Deploying...
				✨ Deployment complete! Take a peek over at https://abcxyz.foo.pages.dev/"
			`);

			expect(std.err).toMatchInlineSnapshot('""');
		});

		it("should error with --no-bundle and a single _worker.js file", async () => {
			// set up the directory of static files to upload.
			mkdirSync("public");
			writeFileSync("public/README.md", "This is a readme");

			// set up _worker.js
			writeFileSync(
				"public/_worker.js",
				`
				import { thing } from "some-module";

				export default {
					async fetch(request, env) {
						console.log(thing);
						const url = new URL(request.url);
						return url.pathname.startsWith('/api/') ? new Response('Ok') : env.ASSETS.fetch(request);
					}
				};
			`
			);

			mockGetUploadTokenRequest(
				"<<funfetti-auth-jwt>>",
				"some-account-id",
				"foo"
			);

			msw.use(
				http.post(
					"*/pages/assets/check-missing",
					async ({ request }) => {
						const body = (await request.json()) as {
							hashes: string[];
						};

						expect(request.headers.get("Authorization")).toBe(
							"Bearer <<funfetti-auth-jwt>>"
						);
						expect(body).toMatchObject({
							hashes: ["13a03eaf24ae98378acd36ea00f77f2f"],
						});

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: body.hashes,
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.post(
					"*/pages/assets/upload",
					async ({ request }) => {
						expect(request.headers.get("Authorization")).toBe(
							"Bearer <<funfetti-auth-jwt>>"
						);

						expect(await request.json()).toMatchObject([
							{
								key: "13a03eaf24ae98378acd36ea00f77f2f",
								value: Buffer.from("This is a readme").toString("base64"),
								metadata: {
									contentType: "text/markdown",
								},
								base64: true,
							},
						]);
						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: true,
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.post(
					"*/accounts/:accountId/pages/projects/foo/deployments",
					async ({ request, params }) => {
						expect(params.accountId).toEqual("some-account-id");
						const body = await request.formData();
						const manifest = JSON.parse(await toString(body.get("manifest")));
						const workerBundle = body.get("_worker.bundle");

						// make sure this is all we uploaded
						expect([...body.keys()].sort()).toEqual(
							["manifest", "_worker.bundle"].sort()
						);

						expect(manifest).toMatchInlineSnapshot(`
																								Object {
																									"/README.md": "13a03eaf24ae98378acd36ea00f77f2f",
																								}
																				`);

						await expect(workerHasD1Shim(workerBundle)).resolves.toBeFalsy();
						expect(await toString(workerBundle)).toContain(`some-module`);

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: {
									id: "123-456-789",
									url: "https://abcxyz.foo.pages.dev/",
								},
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.get(
					"*/accounts/:accountId/pages/projects/foo/deployments/:deploymentId",
					async ({ params }) => {
						expect(params.accountId).toEqual("some-account-id");
						expect(params.deploymentId).toEqual("123-456-789");

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: {
									latest_stage: {
										name: "deploy",
										status: "success",
									},
								},
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.get(
					"*/accounts/:accountId/pages/projects/foo",
					async ({ params }) => {
						expect(params.accountId).toEqual("some-account-id");

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: {
									deployment_configs: {
										production: {
											d1_databases: { MY_D1_DB: { id: "fake-db" } },
										},
										preview: {
											d1_databases: { MY_D1_DB: { id: "fake-db" } },
										},
									},
								} as Partial<Project>,
							},
							{ status: 200 }
						);
					}
				)
			);

			let error = "Code did not throw!";
			try {
				await runWrangler("pages deploy public --project-name=foo --no-bundle");
			} catch (e) {
				error = `${e}`;
			}
			expect(error).toContain(
				"ERROR: [plugin: block-worker-js-imports] _worker.js is not being bundled by Wrangler but it is importing from another file."
			);
		});

		it("should not error with --no-bundle and an index.js in a _worker.js/ directory", async () => {
			// set up the directory of static files to upload.
			mkdirSync("public");
			writeFileSync("public/README.md", "This is a readme");

			// set up _worker/index.js
			mkdirSync("public/_worker.js");
			writeFileSync(
				"public/_worker.js/index.js",
				`
				import { thing } from "some-module";

				export default {
					async fetch(request, env) {
						console.log(thing);
						const url = new URL(request.url);
						return url.pathname.startsWith('/api/') ? new Response('Ok') : env.ASSETS.fetch(request);
					}
				};
			`
			);

			mockGetUploadTokenRequest(
				"<<funfetti-auth-jwt>>",
				"some-account-id",
				"foo"
			);

			msw.use(
				http.post(
					"*/pages/assets/check-missing",
					async ({ request }) => {
						const body = (await request.json()) as {
							hashes: string[];
						};

						expect(request.headers.get("Authorization")).toBe(
							"Bearer <<funfetti-auth-jwt>>"
						);
						expect(body).toMatchObject({
							hashes: ["13a03eaf24ae98378acd36ea00f77f2f"],
						});

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: body.hashes,
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.post(
					"*/pages/assets/upload",
					async ({ request }) => {
						expect(request.headers.get("Authorization")).toBe(
							"Bearer <<funfetti-auth-jwt>>"
						);

						expect(await request.json()).toMatchObject([
							{
								key: "13a03eaf24ae98378acd36ea00f77f2f",
								value: Buffer.from("This is a readme").toString("base64"),
								metadata: {
									contentType: "text/markdown",
								},
								base64: true,
							},
						]);
						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: true,
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.post(
					"*/accounts/:accountId/pages/projects/foo/deployments",
					async ({ request, params }) => {
						expect(params.accountId).toEqual("some-account-id");
						const body = await request.formData();
						const manifest = JSON.parse(await toString(body.get("manifest")));
						const workerBundle = body.get("_worker.bundle");

						// make sure this is all we uploaded
						expect([...body.keys()].sort()).toEqual(
							["manifest", "_worker.bundle"].sort()
						);

						expect(manifest).toMatchInlineSnapshot(`
				Object {
				  "/README.md": "13a03eaf24ae98378acd36ea00f77f2f",
				}
			`);

						await expect(workerHasD1Shim(workerBundle)).resolves.toBeFalsy();
						expect(await toString(workerBundle)).toContain(`some-module`);

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: {
									id: "123-456-789",
									url: "https://abcxyz.foo.pages.dev/",
								},
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.get(
					"*/accounts/:accountId/pages/projects/foo/deployments/:deploymentId",
					async ({ params }) => {
						expect(params.accountId).toEqual("some-account-id");
						expect(params.deploymentId).toEqual("123-456-789");

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: {
									latest_stage: {
										name: "deploy",
										status: "success",
									},
								},
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.get(
					"*/accounts/:accountId/pages/projects/foo",
					async ({ params }) => {
						expect(params.accountId).toEqual("some-account-id");

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: {
									deployment_configs: {
										production: {
											d1_databases: { MY_D1_DB: { id: "fake-db" } },
										},
										preview: {
											d1_databases: { MY_D1_DB: { id: "fake-db" } },
										},
									},
								} as Partial<Project>,
							},
							{ status: 200 }
						);
					}
				)
			);

			await runWrangler("pages deploy public --project-name=foo --no-bundle");

			expect(normalizeProgressSteps(std.out)).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				✨ Success! Uploaded 1 files (TIMINGS)

				✨ Uploading Worker bundle
				🌎 Deploying...
				✨ Deployment complete! Take a peek over at https://abcxyz.foo.pages.dev/"
			`);

			expect(std.err).toMatchInlineSnapshot('""');
		});

		it("should fail with the appropriate logs, if the deployment of the project failed", async () => {
			// set up the directory of static files to upload.
			mkdirSync("public");
			writeFileSync("public/README.md", "This is a readme");

			// set up _worker.js
			writeFileSync(
				"public/_worker.js",
				`
				const a = true;
				a();

				export default {
					async fetch(request, env) {
						const url = new URL(request.url);
						console.log("SOMETHING FROM WITHIN THE WORKER");
						return url.pathname.startsWith('/api/') ? new Response('Ok') : env.ASSETS.fetch(request);
					}
				};
			`
			);

			mockGetUploadTokenRequest(
				"<<funfetti-auth-jwt>>",
				"some-account-id",
				"foo"
			);

			msw.use(
				http.post(
					"*/pages/assets/check-missing",
					async ({ request }) => {
						const body = (await request.json()) as {
							hashes: string[];
						};

						expect(request.headers.get("Authorization")).toBe(
							"Bearer <<funfetti-auth-jwt>>"
						);
						expect(body).toMatchObject({
							hashes: ["13a03eaf24ae98378acd36ea00f77f2f"],
						});

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: body.hashes,
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.post(
					"*/pages/assets/upload",
					async ({ request }) => {
						expect(request.headers.get("Authorization")).toBe(
							"Bearer <<funfetti-auth-jwt>>"
						);

						expect(await request.json()).toMatchObject([
							{
								key: "13a03eaf24ae98378acd36ea00f77f2f",
								value: Buffer.from("This is a readme").toString("base64"),
								metadata: {
									contentType: "text/markdown",
								},
								base64: true,
							},
						]);
						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: true,
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.post(
					"*/accounts/:accountId/pages/projects/foo/deployments",
					async ({ request, params }) => {
						expect(params.accountId).toEqual("some-account-id");
						const body = await request.formData();
						const manifest = JSON.parse(await toString(body.get("manifest")));
						const workerBundle = body.get("_worker.bundle");

						// make sure this is all we uploaded
						expect([...body.keys()].sort()).toEqual(
							["manifest", "_worker.bundle"].sort()
						);

						expect(manifest).toMatchInlineSnapshot(`
				Object {
				  "/README.md": "13a03eaf24ae98378acd36ea00f77f2f",
				}
			`);

						await expect(workerHasD1Shim(workerBundle)).resolves.toBeFalsy();
						expect(await toString(workerBundle)).toContain(
							`console.log("SOMETHING FROM WITHIN THE WORKER");`
						);

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: {
									id: "123-456-789",
									url: "https://abcxyz.foo.pages.dev/",
								},
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.get(
					"*/accounts/:accountId/pages/projects/foo/deployments/:deploymentId",
					async ({ params }) => {
						expect(params.accountId).toEqual("some-account-id");
						expect(params.deploymentId).toEqual("123-456-789");

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: {
									latest_stage: {
										name: "deploy",
										status: "failure",
									},
								},
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.get(
					"*/accounts/:accountId/pages/projects/foo/deployments/:deploymentId/history/logs?size=10000000",
					async ({ params }) => {
						expect(params.accountId).toEqual("some-account-id");
						expect(params.deploymentId).toEqual("123-456-789");

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: {
									total: 1,
									data: [
										{
											line: "Error: Failed to publish your Function. Got error: Uncaught TypeError: a is not a function\n  at functionsWorker-0.11031665179307093.js:41:1\n",
											ts: "2024-05-13T12:12:45.606855Z",
										},
									],
								},
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.get(
					"*/accounts/:accountId/pages/projects/foo",
					async ({ params }) => {
						expect(params.accountId).toEqual("some-account-id");

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: {
									deployment_configs: {
										production: {
											d1_databases: { MY_D1_DB: { id: "fake-db" } },
										},
										preview: {
											d1_databases: { MY_D1_DB: { id: "fake-db" } },
										},
									},
								} as Partial<Project>,
							},
							{ status: 200 }
						);
					}
				)
			);

			await expect(runWrangler("pages deploy public --project-name=foo"))
				.rejects.toThrow(`Deployment failed!
	Failed to publish your Function. Got error: Uncaught TypeError: a is not a function
  at functionsWorker-0.11031665179307093.js:41:1`);
		});
	});

	describe.each(["wrangler.json", "wrangler.toml"])(
		"with %s configuration",
		(configPath) => {
			it(`should support ${configPath}`, async () => {
				// set up the directory of static files to upload.
				mkdirSync("public");
				writeFileSync("public/README.md", "This is a readme");

				// set up _worker.js
				writeFileSync(
					"public/_worker.js",
					`
				export default {
					async fetch(request, env) {
						const url = new URL(request.url);
						console.log("PAGES SUPPORTS WRANGLER.TOML!!");
						return url.pathname.startsWith('/pages-toml') ? new Response('Ok') : env.ASSETS.fetch(request);
					}
				};
			`
				);

				writeWranglerConfig(
					{
						compatibility_date: "2024-01-01",
						name: "pages-is-awesome",
						pages_build_output_dir: "public",
					},
					configPath
				);

				mockGetUploadTokenRequest(
					"<<funfetti-auth-jwt>>",
					"some-account-id",
					"pages-is-awesome"
				);

				let getProjectRequestCount = 0;
				msw.use(
					http.post(
						"*/pages/assets/check-missing",
						async ({ request }) => {
							const body = (await request.json()) as {
								hashes: string[];
							};

							expect(request.headers.get("Authorization")).toBe(
								"Bearer <<funfetti-auth-jwt>>"
							);
							expect(body).toMatchObject({
								hashes: ["13a03eaf24ae98378acd36ea00f77f2f"],
							});

							return HttpResponse.json(
								{
									success: true,
									errors: [],
									messages: [],
									result: body.hashes,
								},
								{ status: 200 }
							);
						},
						{ once: true }
					),
					http.post(
						"*/pages/assets/upload",
						async ({ request }) => {
							expect(request.headers.get("Authorization")).toBe(
								"Bearer <<funfetti-auth-jwt>>"
							);

							expect(await request.json()).toMatchObject([
								{
									key: "13a03eaf24ae98378acd36ea00f77f2f",
									value: Buffer.from("This is a readme").toString("base64"),
									metadata: {
										contentType: "text/markdown",
									},
									base64: true,
								},
							]);
							return HttpResponse.json(
								{
									success: true,
									errors: [],
									messages: [],
									result: true,
								},
								{ status: 200 }
							);
						},
						{ once: true }
					),
					http.post(
						"*/accounts/:accountId/pages/projects/pages-is-awesome/deployments",
						async ({ request, params }) => {
							expect(params.accountId).toEqual("some-account-id");
							const body = await request.formData();
							const manifest = JSON.parse(await toString(body.get("manifest")));
							const workerBundle = body.get("_worker.bundle");
							const buildOutputDir = body.get("pages_build_output_dir");
							const configHash = body.get("wrangler_config_hash");

							// make sure this is all we uploaded
							expect([...body.keys()].sort()).toEqual(
								[
									"_worker.bundle",
									"manifest",
									"pages_build_output_dir",
									"wrangler_config_hash",
								].sort()
							);

							expect(manifest).toMatchObject({
								"/README.md": "13a03eaf24ae98378acd36ea00f77f2f",
							});
							expect(await toString(workerBundle)).toContain(
								`console.log("PAGES SUPPORTS WRANGLER.TOML!!");`
							);
							expect(buildOutputDir).toEqual("public");
							expect(configHash).toMatchSnapshot();

							return HttpResponse.json(
								{
									success: true,
									errors: [],
									messages: [],
									result: {
										id: "123-456-789",
										url: "https://abcxyz.pages-is-awesome.pages.dev/",
									},
								},
								{ status: 200 }
							);
						},
						{ once: true }
					),
					http.get(
						"*/accounts/:accountId/pages/projects/pages-is-awesome/deployments/:deploymentId",
						async ({ params }) => {
							expect(params.accountId).toEqual("some-account-id");
							expect(params.deploymentId).toEqual("123-456-789");

							return HttpResponse.json(
								{
									success: true,
									errors: [],
									messages: [],
									result: {
										latest_stage: {
											name: "deploy",
											status: "success",
										},
									},
								},
								{ status: 200 }
							);
						},
						{ once: true }
					),
					http.get(
						"*/accounts/:accountId/pages/projects/pages-is-awesome",
						async ({ params }) => {
							getProjectRequestCount++;

							expect(params.accountId).toEqual("some-account-id");

							return HttpResponse.json(
								{
									success: true,
									errors: [],
									messages: [],
									result: {
										deployment_configs: {
											production: {
												d1_databases: { MY_D1_DB: { id: "fake-db" } },
											},
											preview: {
												d1_databases: { MY_D1_DB: { id: "fake-db" } },
											},
										},
									} as Partial<Project>,
								},
								{ status: 200 }
							);
						}
					)
				);

				await runWrangler("pages deploy");

				expect(getProjectRequestCount).toEqual(2);
				expect(normalizeProgressSteps(std.out)).toMatchSnapshot();

				expect(std.err).toBe("");
			});

			it("should error if user attempts to specify a custom config file path", async () => {
				await expect(
					runWrangler("pages deploy --config foo.toml")
				).rejects.toThrowErrorMatchingSnapshot();
			});

			it("should warn and ignore the config file, if it doesn't specify the `pages_build_output_dir` field", async () => {
				// set up the directory of static files to upload.
				mkdirSync("public");
				writeFileSync("public/index.html", "Greetings from Pages");

				// set up /functions
				mkdirSync("functions");
				writeFileSync(
					"functions/hello-world.js",
					`
			export async function onRequest() {
				return new Response("Pages supports wrangler.toml!");
			}
			`
				);

				writeWranglerConfig(
					{ name: "pages-is-awesome", compatibility_date: "2024-01-01" },
					configPath
				);

				// `pages deploy` should fail because, even though the project name is specififed in the
				// `wrangler.toml` file, the `pages_build_output_dir` field is missing from the config,
				// so the file gets ignored
				await expect(
					runWrangler("pages deploy public")
				).rejects.toThrowErrorMatchingSnapshot();

				expect(
					std.warn.replace(/\S*\.(toml|json)/g, configPath).replace(/\s/g, "")
				).toContain(
					`
				We detected a configuration file at ${configPath} but it is missing the "pages_build_output_dir" field, required by Pages.
				If you would like to use this configuration file to deploy your project, please use "pages_build_output_dir" to specify the directory of static files to upload.
				Ignoring configuration file for now, and proceeding with project deploy.
				`.replace(/\s/g, "")
				);
			});

			it("should always deploy to the Pages project specified by the top-level `name` configuration field, regardless of the corresponding env-level configuration", async () => {
				// set up the directory of static files to upload.
				mkdirSync("public");
				writeFileSync("public/README.md", "This is a readme");

				// set up _worker.js
				writeFileSync(
					"public/_worker.js",
					`
				export default {
					async fetch(request, env) {
						const url = new URL(request.url);
						console.log("PAGES SUPPORTS WRANGLER.TOML!!");
						return url.pathname.startsWith('/pages-toml') ? new Response('Ok') : env.ASSETS.fetch(request);
					}
				};
			`
				);
				writeWranglerConfig(
					{
						compatibility_date: "2024-01-01",
						name: "pages-project",
						pages_build_output_dir: "public",
						env: {
							production: {
								name: "pages-project-production",
							},
						},
					},
					configPath
				);

				mockGetUploadTokenRequest(
					"<<funfetti-auth-jwt>>",
					"some-account-id",
					"pages-project"
				);

				let getProjectRequestCount = 0;
				msw.use(
					http.post(
						"*/pages/assets/check-missing",
						async ({ request }) => {
							const body = (await request.json()) as {
								hashes: string[];
							};

							expect(request.headers.get("Authorization")).toBe(
								"Bearer <<funfetti-auth-jwt>>"
							);
							expect(body).toMatchObject({
								hashes: ["13a03eaf24ae98378acd36ea00f77f2f"],
							});

							return HttpResponse.json(
								{
									success: true,
									errors: [],
									messages: [],
									result: body.hashes,
								},
								{ status: 200 }
							);
						},
						{ once: true }
					),
					http.post(
						"*/pages/assets/upload",
						async ({ request }) => {
							expect(request.headers.get("Authorization")).toBe(
								"Bearer <<funfetti-auth-jwt>>"
							);

							expect(await request.json()).toMatchObject([
								{
									key: "13a03eaf24ae98378acd36ea00f77f2f",
									value: Buffer.from("This is a readme").toString("base64"),
									metadata: {
										contentType: "text/markdown",
									},
									base64: true,
								},
							]);
							return HttpResponse.json(
								{
									success: true,
									errors: [],
									messages: [],
									result: true,
								},
								{ status: 200 }
							);
						},
						{ once: true }
					),
					http.post(
						"*/accounts/:accountId/pages/projects/pages-project/deployments",
						async ({ request, params }) => {
							expect(params.accountId).toEqual("some-account-id");
							const body = await request.formData();
							const manifest = JSON.parse(await toString(body.get("manifest")));
							const workerBundle = body.get("_worker.bundle");
							const branch = body.get("branch");
							const buildOutputDir = body.get("pages_build_output_dir");
							const configHash = body.get("wrangler_config_hash");

							// make sure this is all we uploaded
							expect([...body.keys()].sort()).toEqual(
								[
									"_worker.bundle",
									"branch",
									"manifest",
									"pages_build_output_dir",
									"wrangler_config_hash",
								].sort()
							);

							expect(manifest).toMatchObject({
								"/README.md": "13a03eaf24ae98378acd36ea00f77f2f",
							});

							await expect(workerHasD1Shim(workerBundle)).resolves.toBeFalsy();
							expect(await toString(workerBundle)).toContain(
								`console.log("PAGES SUPPORTS WRANGLER.TOML!!");`
							);
							expect(branch).toEqual("main");
							expect(buildOutputDir).toEqual("public");
							expect(configHash).toMatchSnapshot();

							return HttpResponse.json(
								{
									success: true,
									errors: [],
									messages: [],
									result: {
										id: "abc-def-ghi",
										url: "https://abcxyz.pages-project.pages.dev/",
									},
								},
								{ status: 200 }
							);
						},
						{ once: true }
					),
					http.get(
						"*/accounts/:accountId/pages/projects/pages-project/deployments/:deploymentId",
						async ({ params }) => {
							expect(params.accountId).toEqual("some-account-id");
							expect(params.deploymentId).toEqual("abc-def-ghi");

							return HttpResponse.json(
								{
									success: true,
									errors: [],
									messages: [],
									result: {
										latest_stage: {
											name: "deploy",
											status: "success",
										},
									},
								},
								{ status: 200 }
							);
						},
						{ once: true }
					),
					http.get(
						"*/accounts/:accountId/pages/projects/pages-project",
						async ({ params }) => {
							getProjectRequestCount++;
							expect(params.accountId).toEqual("some-account-id");

							return HttpResponse.json(
								{
									success: true,
									errors: [],
									messages: [],
									result: {
										production_branch: "main",
										deployment_configs: {
											production: {
												d1_databases: { MY_D1_DB: { id: "fake-db" } },
											},
											preview: {
												d1_databases: { MY_D1_DB: { id: "fake-db" } },
											},
										},
									} as Partial<Project>,
								},
								{ status: 200 }
							);
						}
					)
				);

				await runWrangler("pages deploy --branch main");

				expect(getProjectRequestCount).toEqual(2);
				expect(normalizeProgressSteps(std.out)).toMatchSnapshot();

				expect(std.err).toBe("");
			});
		}
	);

	const simulateServer = (
		generatedWorkerBundleCheck: (
			workerJsContent: FormDataEntryValue | null
		) => Promise<void>,
		compatibility_flags?: string[],
		aliases?: string[]
	) => {
		mockGetUploadTokenRequest(
			"<<funfetti-auth-jwt>>",
			"some-account-id",
			"foo"
		);

		msw.use(
			http.post<never, { hashes: string[] }>(
				"*/pages/assets/check-missing",
				async ({ request }) =>
					HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: (await request.json()).hashes,
						},
						{ status: 200 }
					),
				{ once: true }
			),
			http.post(
				"*/pages/assets/upload",
				async () =>
					HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: null,
						},
						{ status: 200 }
					),
				{ once: true }
			),
			http.post(
				"*/accounts/:accountId/pages/projects/foo/deployments",
				async ({ request }) => {
					const body = await request.formData();
					const generatedWorkerBundle = body.get("_worker.bundle");

					await generatedWorkerBundleCheck(generatedWorkerBundle);

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: {
								id: "123-456-789",
								url: "https://abcxyz.foo.pages.dev/",
							},
						},
						{ status: 200 }
					);
				},
				{ once: true }
			),
			http.get(
				"*/accounts/:accountId/pages/projects/foo/deployments/:deploymentId",
				async ({ params }) => {
					expect(params.accountId).toEqual("some-account-id");
					expect(params.deploymentId).toEqual("123-456-789");

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: {
								aliases,
								latest_stage: {
									name: "deploy",
									status: "success",
								},
							},
						},
						{ status: 200 }
					);
				},
				{ once: true }
			),
			// we're expecting two API calls to `/projects/<name>`, so we need
			// to mock both of them
			mockGetProjectHandler("foo", compatibility_flags),
			mockGetProjectHandler("foo", compatibility_flags)
		);
	};

	describe("_worker.js bundling", () => {
		beforeEach(() => {
			mkdirSync("public");
			writeFileSync(
				"public/_worker.js",
				`
			export default {
				async fetch(request, env) {
					return new Response('Ok');
				}
			};
			`
			);
		});

		const workerIsBundled = async (contents: FormDataEntryValue | null) =>
			(await toString(contents)).includes("worker_default as default");

		it("should bundle the _worker.js when both `--bundle` and `--no-bundle` are omitted", async () => {
			simulateServer((generatedWorkerJS) =>
				expect(workerIsBundled(generatedWorkerJS)).resolves.toBeTruthy()
			);
			await runWrangler("pages deploy public --project-name=foo");
			expect(std.out).toContain("✨ Uploading Worker bundle");
		});

		it("should not bundle the _worker.js when `--no-bundle` is set", async () => {
			simulateServer((generatedWorkerJS) =>
				expect(workerIsBundled(generatedWorkerJS)).resolves.toBeFalsy()
			);
			await runWrangler("pages deploy public --project-name=foo --no-bundle");
			expect(std.out).toContain("✨ Uploading Worker bundle");
		});

		it("should not allow 3rd party imports when not bundling", async () => {
			// Add in a 3rd party import to the bundle
			writeFileSync(
				"public/_worker.js",
				`
				import { Test } from "test-package";

				export default {
					async fetch() {
						console.log(Test);
						return new Response("Ok");
					},
				};`
			);

			simulateServer((generatedWorkerJS) =>
				expect(workerIsBundled(generatedWorkerJS)).resolves.toBeFalsy()
			);
			let error = "Code did not throw!";
			try {
				await runWrangler("pages deploy public --project-name=foo --no-bundle");
			} catch (e) {
				error = `${e}`;
			}
			expect(error).toContain(
				"ERROR: [plugin: block-worker-js-imports] _worker.js is not being bundled by Wrangler but it is importing from another file."
			);
		});

		it("should allow `cloudflare:...` imports when not bundling", async () => {
			// Add in a 3rd party import to the bundle
			writeFileSync(
				"public/_worker.js",
				`
				import { EmailMessage } from "cloudflare:email";

				export default {
					async fetch() {
						console.log("EmailMessage", EmailMessage);
						return new Response("Ok");
					},
				};`
			);

			simulateServer((generatedWorkerJS) =>
				expect(workerIsBundled(generatedWorkerJS)).resolves.toBeFalsy()
			);
			await runWrangler("pages deploy public --project-name=foo --no-bundle");
			expect(std.out).toContain("✨ Uploading Worker bundle");
		});

		it("should allow `node:...` imports when not bundling and marked with nodejs_compat", async () => {
			// Add in a node built-in import to the bundle
			writeFileSync(
				"public/_worker.js",
				`
				import { Buffer } from "node:buffer";

				export default {
					async fetch() {
						return new Response(Buffer.from("Ok", "utf8"));
					},
				};`
			);

			simulateServer(
				(generatedWorkerJS) =>
					expect(workerIsBundled(generatedWorkerJS)).resolves.toBeFalsy(),
				["nodejs_compat"]
			);
			await runWrangler("pages deploy public --project-name=foo --no-bundle");
			expect(std.out).toContain("✨ Uploading Worker bundle");
		});

		it("should not allow `node:...` imports when not bundling and not marked nodejs_compat", async () => {
			// Add in a node built-in import to the bundle
			writeFileSync(
				"public/_worker.js",
				`
				import { Buffer } from "node:buffer";

				export default {
					async fetch() {
						return new Response(Buffer.from("Ok", "utf8"));
					},
				};`
			);

			simulateServer((generatedWorkerJS) =>
				expect(workerIsBundled(generatedWorkerJS)).resolves.toBeFalsy()
			);
			let error = "Code did not throw!";
			try {
				await runWrangler("pages deploy public --project-name=foo --no-bundle");
			} catch (e) {
				error = `${e}`;
			}
			expect(error).toContain(
				"ERROR: [plugin: block-worker-js-imports] _worker.js is not being bundled by Wrangler but it is importing from another file."
			);
		});

		it("should not bundle the _worker.js when `--bundle` is set to false", async () => {
			simulateServer((generatedWorkerJS) =>
				expect(workerIsBundled(generatedWorkerJS)).resolves.toBeFalsy()
			);
			await runWrangler(
				"pages deploy public --project-name=foo --bundle=false"
			);
			expect(std.out).toContain("✨ Uploading Worker bundle");
		});

		it("should bundle the _worker.js when the `--no-bundle` is set to false", async () => {
			simulateServer((generatedWorkerJS) =>
				expect(workerIsBundled(generatedWorkerJS)).resolves.toBeTruthy()
			);
			await runWrangler(
				"pages deploy public --no-bundle=false --project-name=foo"
			);
			expect(std.out).toContain("✨ Uploading Worker bundle");
		});

		it("should bundle the _worker.js when the `--bundle` is set to true", async () => {
			simulateServer((generatedWorkerJS) =>
				expect(workerIsBundled(generatedWorkerJS)).resolves.toBeTruthy()
			);
			await runWrangler("pages deploy public --bundle=true --project-name=foo");
			expect(std.out).toContain("✨ Uploading Worker bundle");
		});
	});

	describe("_worker.js directory bundling", () => {
		const workerIsBundled = async (contents: FormDataEntryValue | null) =>
			(await toString(contents)).includes("worker_default as default");

		["wrangler.json", "wrangler.toml"].forEach((configPath) => {
			it(
				"should not bundle the _worker.js when `no_bundle = true` in Wrangler config: " +
					configPath,
				async () => {
					mkdirSync("public/_worker.js", { recursive: true });
					writeFileSync(
						"public/_worker.js/index.js",
						`
					export default {
						async fetch(request, env) {
							return new Response('Ok');
						}
					};
					`
					);

					const config = {
						name: "foo",
						no_bundle: true,
						pages_build_output_dir: "public",
					};
					writeFileSync(
						`${configPath}`,
						configPath === "wrangler.json"
							? JSON.stringify(config)
							: TOML.stringify(config)
					);

					simulateServer((generatedWorkerJS) =>
						expect(workerIsBundled(generatedWorkerJS)).resolves.toBeFalsy()
					);

					await runWrangler("pages deploy");

					expect(std.out).toContain("✨ Uploading Worker bundle");
				}
			);
		});
	});

	describe("source maps", () => {
		const bundleString = (entry: FormDataEntryValue | null) =>
			toString(entry).then((str) =>
				str
					.replace(/formdata-undici-0.[0-9]*/g, "formdata-undici-0.test")
					.replace(/bundledWorker-0.[0-9]*.mjs/g, "bundledWorker-0.test.mjs")
					.replace(/functionsWorker-0.[0-9]*.js/g, "functionsWorker-0.test.js")
			);

		beforeEach(() => {
			mkdirSync("dist");
			writeFileSync(
				"wrangler.toml",
				dedent`
					name = "foo"
					pages_build_output_dir = "dist"
					compatibility_date = "2024-01-01"
					upload_source_maps = true
				`
			);
		});

		it("should upload sourcemaps for functions directory projects", async () => {
			mkdirSync("functions");
			writeFileSync(
				"functions/[[path]].ts",
				dedent`
					export function onRequestGet() {
						return new Response("")
					};
				`
			);

			simulateServer(async (entry) => {
				const contents = await bundleString(entry);
				// Ensure we get a sourcemap containing our functions file
				expect(contents).toContain(
					'Content-Disposition: form-data; name="functionsWorker-0.test.js.map"'
				);
				expect(contents).toContain(
					`"sources":["${encodeURIComponent("[[path]].ts")}"`
				);
			});

			await runWrangler("pages deploy");
		});

		it("should upload sourcemaps for _worker.js file projects", async () => {
			writeFileSync(
				"dist/_worker.js",
				dedent`
					export default {
						async fetch() {
							return new Response("foo");
						}
					}
				`
			);

			simulateServer(async (entry) => {
				const contents = await bundleString(entry);
				// Ensure we get a sourcemap containing our _worker.js file
				expect(contents).toContain(
					'Content-Disposition: form-data; name="bundledWorker-0.test.mjs.map"'
				);
				expect(contents).toContain('"sources":["_worker.js"');
			});

			await runWrangler("pages deploy");
		});

		it("should upload sourcemaps for _worker.js directory projects", async () => {
			mkdirSync("dist/_worker.js");
			mkdirSync("dist/_worker.js/chunks");
			writeFileSync(
				"dist/_worker.js/index.js",
				`export { handlers as default } from "./chunks/runtime.mjs";`
			);

			writeFileSync(
				"dist/_worker.js/chunks/runtime.mjs",
				dedent`
					export const handlers = {};
					//# sourceMappingURL=runtime.mjs.map
				`
			);
			writeFileSync(
				"dist/_worker.js/chunks/runtime.mjs.map",
				JSON.stringify({
					version: 3,
					file: "runtime.mjs",
					sources: [],
					sourcesContent: null,
					names: [],
					mappings: "",
				})
			);

			simulateServer(async (entry) => {
				const contents = await bundleString(entry);

				// Ensure we get a sourcemap containing our main worker file
				expect(contents).toContain(
					'Content-Disposition: form-data; name="bundledWorker-0.test.mjs.map"'
				);
				expect(contents).toContain('"sources":["dist/_worker.js/index.js"');

				// Ensure our runtime file that wrangler doesn't bundle into the main output still
				// get uploaded alongside their sourcemaps
				expect(contents).toContain(
					'Content-Disposition: form-data; name="chunks/runtime.mjs"; filename="chunks/runtime.mjs"'
				);
				expect(contents).toContain(
					'Content-Disposition: form-data; name="chunks/runtime.mjs.map"; filename="chunks/runtime.mjs.map"'
				);
			});

			await runWrangler("pages deploy");
		});
	});

	describe("deployment aliases", () => {
		it("should support outputting an alias url", async () => {
			// set up the directory of static files to upload.
			mkdirSync("public");
			writeFileSync("public/README.md", "This is a readme");

			simulateServer(async () => {}, [], ["https://staging.foo.pages.dev"]);

			await runWrangler("pages deploy public --project-name=foo");

			expect(normalizeProgressSteps(std.out)).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				✨ Success! Uploaded 1 files (TIMINGS)

				🌎 Deploying...
				✨ Deployment complete! Take a peek over at https://abcxyz.foo.pages.dev/
				✨ Deployment alias URL: https://staging.foo.pages.dev"
			`);

			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("ignores custom domains", async () => {
			// set up the directory of static files to upload.
			mkdirSync("public");
			writeFileSync("public/README.md", "This is a readme");

			simulateServer(async () => {}, [], ["https://example.com"]);

			await runWrangler("pages deploy public --project-name=foo");

			expect(normalizeProgressSteps(std.out)).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				✨ Success! Uploaded 1 files (TIMINGS)

				🌎 Deploying...
				✨ Deployment complete! Take a peek over at https://abcxyz.foo.pages.dev/"
			`);

			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("continues to work fine if no aliases", async () => {
			// set up the directory of static files to upload.
			mkdirSync("public");
			writeFileSync("public/README.md", "This is a readme");

			simulateServer(async () => {}, [], []);

			await runWrangler("pages deploy public --project-name=foo");

			expect(normalizeProgressSteps(std.out)).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				✨ Success! Uploaded 1 files (TIMINGS)

				🌎 Deploying...
				✨ Deployment complete! Take a peek over at https://abcxyz.foo.pages.dev/"
			`);

			expect(std.err).toMatchInlineSnapshot(`""`);
		});
	});

	describe("deploys with custom commit information", () => {
		it("should accept and send --commit-hash parameter", async () => {
			mkdirSync("public");
			writeFileSync("public/README.md", "# Test project");

			mockGetUploadTokenRequest(
				"<<funfetti-auth-jwt>>",
				"some-account-id",
				"foo"
			);

			let deploymentFormData: Record<string, unknown> | null = null;

			msw.use(
				http.post(
					"*/pages/assets/check-missing",
					async () => {
						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: [],
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.post("*/pages/assets/upload", async () => {
					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: null,
						},
						{ status: 200 }
					);
				}),
				http.get("*/accounts/:accountId/pages/projects/foo", async () => {
					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: { deployment_configs: { production: {}, preview: {} } },
						},
						{ status: 200 }
					);
				}),
				http.post(
					"*/accounts/:accountId/pages/projects/foo/deployments",
					async ({ request }) => {
						const formData = await request.formData();
						const formDataObj: Record<string, unknown> = {};
						for (const [key, value] of formData.entries()) {
							formDataObj[key] = value;
						}
						deploymentFormData = formDataObj;

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: {
									id: "123-456-789",
									url: "https://abcxyz.foo.pages.dev/",
								},
							},
							{ status: 200 }
						);
					},
					{ once: true }
				),
				http.get(
					"*/accounts/:accountId/pages/projects/foo/deployments/:deploymentId",
					async () => {
						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: {
									id: "123-456-789",
									latest_stage: {
										name: "deploy",
										status: "success",
									},
								},
							},
							{ status: 200 }
						);
					}
				)
			);

			await runWrangler(
				"pages deploy public --project-name=foo --commit-hash=abc123def456 --commit-message='Test commit'"
			);

			// Verify the commit_hash was sent in the deployment request
			expect(deploymentFormData).not.toBeNull();
			expect(deploymentFormData).toHaveProperty("commit_hash", "abc123def456");
			expect(deploymentFormData).toHaveProperty(
				"commit_message",
				"Test commit"
			);
		});
	});

	describe("deploys using redirected configs", () => {
		let fooProjectDetailsChecked = false;

		beforeEach(() => {
			fooProjectDetailsChecked = false;
			mkdirSync("public");
			mkdirSync("dist");
			mkdirSync(".wrangler/deploy", { recursive: true });
			writeFileSync(
				".wrangler/deploy/config.json",
				JSON.stringify({ configPath: "../../dist/wrangler.json" })
			);
			writeFileSync(
				"dist/wrangler.json",
				JSON.stringify({
					compatibility_date: "2025-01-01",
					name: "foo",
					pages_build_output_dir: "../public",
				})
			);

			simulateServer(async () => {});

			msw.use(
				http.get(
					"*/accounts/:accountId/pages/projects/foo",
					async ({ params }) => {
						expect(params.accountId).toEqual("some-account-id");

						fooProjectDetailsChecked = true;

						return HttpResponse.json(
							{
								success: true,
								errors: [],
								messages: [],
								result: {
									production_branch: "main",
									deployment_configs: {
										production: {},
										preview: {},
									},
								} as Partial<Project>,
							},
							{ status: 200 }
						);
					}
				)
			);
		});

		afterEach(() => {
			expect(fooProjectDetailsChecked).toBe(true);
		});

		const expectedInfo = dedent`
			Using redirected Wrangler configuration.
			 - Configuration being used: "dist/wrangler.json"
			 - Original user's configuration: "<no user config found>"
			 - Deploy configuration file: ".wrangler/deploy/config.json"
		`;

		it("should work without a branch specified (i.e. defaulting to the production environment)", async () => {
			await runWrangler("pages deploy");
			expect(std.info).toContain(expectedInfo);
		});

		it("should work with the main branch (i.e. the production environment)", async () => {
			await runWrangler("pages deploy --branch main");
			expect(std.info).toContain(expectedInfo);
		});

		it("should work with any branch (i.e. the preview environment)", async () => {
			await runWrangler("pages deploy --branch my-branch");
			expect(std.info).toContain(expectedInfo);
		});
	});
});

function mockGetProjectHandler(
	projectName: string,
	compatibility_flags: string[] | undefined
) {
	return http.get(
		`*/accounts/:accountId/pages/projects/${projectName}`,
		async () =>
			HttpResponse.json(
				{
					success: true,
					errors: [],
					messages: [],
					result: {
						deployment_configs: {
							production: { compatibility_flags },
							preview: { compatibility_flags },
						},
					},
				},
				{ status: 200 }
			),
		{ once: true }
	);
}
