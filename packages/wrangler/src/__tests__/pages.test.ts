/* eslint-disable no-shadow */
import { Blob } from "node:buffer";
import { mkdirSync, writeFileSync } from "node:fs";
import { chdir } from "node:process";
import { MockedRequest, rest } from "msw";
import { FormData } from "undici";
import { ROUTES_SPEC_VERSION } from "../pages/constants";
import { isRoutesJSONSpec } from "../pages/functions/routes-validation";
import { version } from "./../../package.json";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { msw } from "./helpers/msw";
import { FileReaderSync } from "./helpers/msw/read-file-sync";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type { Deployment, Project, UploadPayloadFile } from "../pages/types";
import type { RestRequest } from "msw";

function mockGetToken(jwt: string) {
	msw.use(
		rest.get(
			"*/accounts/:accountId/pages/projects/foo/upload-token",
			(req, res, ctx) => {
				expect(req.params.accountId).toEqual("some-account-id");

				return res(
					ctx.status(200),
					ctx.json({ success: true, errors: [], messages: [], result: { jwt } })
				);
			}
		)
	);
}

describe("pages", () => {
	runInTempDir();
	const std = mockConsoleMethods();
	function endEventLoop() {
		return new Promise((resolve) => setImmediate(resolve));
	}

	beforeEach(() => {
		// @ts-expect-error we're using a very simple setTimeout mock here
		jest.spyOn(global, "setTimeout").mockImplementation((fn, _period) => {
			setImmediate(fn);
		});
	});
	afterEach(async () => {
		// Force a tick to ensure that all promises resolve
		await endEventLoop();
		// Reset MSW after tick to ensure that all requests have been handled
		msw.resetHandlers();
		msw.restoreHandlers();
	});

	it("should should display a list of available subcommands, for pages with no subcommand", async () => {
		await runWrangler("pages");
		await endEventLoop();

		expect(std.out).toMatchInlineSnapshot(`
		"wrangler pages

		⚡️ Configure Cloudflare Pages

		Commands:
		  wrangler pages dev [directory] [-- command..]  🧑‍💻 Develop your full-stack Pages application locally
		  wrangler pages project                         ⚡️ Interact with your Pages projects
		  wrangler pages deployment                      🚀 Interact with the deployments of a project
		  wrangler pages publish [directory]             🆙 Publish a directory of static assets as a Pages deployment

		Flags:
		  -c, --config   Path to .toml configuration file  [string]
		  -e, --env      Environment to use for operations and .env files  [string]
		  -h, --help     Show help  [boolean]
		  -v, --version  Show version number  [boolean]

		🚧 'wrangler pages <command>' is a beta command. Please report any issues to https://github.com/cloudflare/wrangler2/issues/new/choose"
	`);
	});

	describe("beta message for subcommands", () => {
		it("should display for pages:dev", async () => {
			await expect(
				runWrangler("pages dev")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`"Must specify a directory of static assets to serve or a command to run or a proxy port."`
			);

			expect(std.out).toMatchInlineSnapshot(`
			        "🚧 'wrangler pages <command>' is a beta command. Please report any issues to https://github.com/cloudflare/wrangler2/issues/new/choose

			        [32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/wrangler2/issues/new/choose[0m"
		      `);
		});

		it("should display for pages:functions:build", async () => {
			await expect(runWrangler("pages functions build")).rejects.toThrowError();

			expect(std.out).toMatchInlineSnapshot(`
			        "🚧 'wrangler pages <command>' is a beta command. Please report any issues to https://github.com/cloudflare/wrangler2/issues/new/choose

			        [32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/wrangler2/issues/new/choose[0m"
		      `);
		});

		it("should display for pages:functions:optimize-routes", async () => {
			await expect(
				runWrangler(
					'pages functions optimize-routes --routes-path="/build/_routes.json" --output-routes-path="/build/_optimized-routes.json"'
				)
			).rejects.toThrowError();

			expect(std.out).toMatchInlineSnapshot(`
			        "🚧 'wrangler pages <command>' is a beta command. Please report any issues to https://github.com/cloudflare/wrangler2/issues/new/choose

			        [32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/wrangler2/issues/new/choose[0m"
		      `);
		});
	});

	describe("project list", () => {
		mockAccountId();
		mockApiToken();

		function mockListRequest(projects: unknown[]) {
			const requests = { count: 0 };
			msw.use(
				rest.get(
					"*/accounts/:accountId/pages/projects",
					async (req, res, ctx) => {
						requests.count++;
						const pageSize = Number(req.url.searchParams.get("per_page"));
						const page = Number(req.url.searchParams.get("page"));
						const expectedPageSize = 10;
						const expectedPage = requests.count;
						expect(req.params.accountId).toEqual("some-account-id");
						expect(pageSize).toEqual(expectedPageSize);
						expect(page).toEqual(expectedPage);
						expect(await req.text()).toEqual("");

						return res(
							ctx.status(200),
							ctx.json({
								success: true,
								errors: [],
								messages: [],
								result: projects.slice((page - 1) * pageSize, page * pageSize),
							})
						);
					}
				)
			);
			return requests;
		}

		it("should make request to list projects", async () => {
			const projects: Project[] = [
				{
					name: "dogs",
					subdomain: "docs.pages.dev",
					domains: ["dogs.pages.dev"],
					source: {
						type: "github",
					},
					latest_deployment: {
						modified_on: "2021-11-17T14:52:26.133835Z",
					},
					created_on: "2021-11-17T14:52:26.133835Z",
					production_branch: "main",
				},
				{
					name: "cats",
					subdomain: "cats.pages.dev",
					domains: ["cats.pages.dev", "kitten.com"],
					latest_deployment: {
						modified_on: "2021-11-17T14:52:26.133835Z",
					},
					created_on: "2021-11-17T14:52:26.133835Z",
					production_branch: "main",
				},
			];

			const requests = mockListRequest(projects);
			await runWrangler("pages project list");

			expect(requests.count).toBe(1);
		});

		it("should make multiple requests for paginated results", async () => {
			const projects: Project[] = [];
			for (let i = 0; i < 15; i++) {
				projects.push({
					name: "dogs" + i,
					subdomain: i + "dogs.pages.dev",
					domains: [i + "dogs.pages.dev"],
					source: {
						type: "github",
					},
					latest_deployment: {
						modified_on: "2021-11-17T14:52:26.133835Z",
					},
					created_on: "2021-11-17T14:52:26.133835Z",
					production_branch: "main",
				});
			}
			const requests = mockListRequest(projects);
			await runWrangler("pages project list");
			expect(requests.count).toEqual(2);
		});
	});

	describe("project create", () => {
		mockAccountId();
		mockApiToken();

		it("should create a project with a production branch", async () => {
			msw.use(
				rest.post(
					"*/accounts/:accountId/pages/projects",
					async (req, res, ctx) => {
						const body = await req.json();

						expect(req.params.accountId).toEqual("some-account-id");
						expect(body).toEqual({
							name: "a-new-project",
							production_branch: "main",
						});

						return res.once(
							ctx.status(200),
							ctx.json({
								success: true,
								errors: [],
								messages: [],
								result: {
									name: "a-new-project",
									subdomain: "a-new-project.pages.dev",
									production_branch: "main",
								},
							})
						);
					}
				)
			);
			await runWrangler(
				"pages project create a-new-project --production-branch=main"
			);
			expect(std.out).toMatchInlineSnapshot(`
			        "✨ Successfully created the 'a-new-project' project. It will be available at https://a-new-project.pages.dev/ once you create your first deployment.
			        To deploy a folder of assets, run 'wrangler pages publish [directory]'."
		      `);
		});
	});

	describe("deployment list", () => {
		mockAccountId();
		mockApiToken();

		function mockListRequest(deployments: unknown[]) {
			const requests = { count: 0 };
			msw.use(
				rest.get(
					"*/accounts/:accountId/pages/projects/:project/deployments",
					(req, res, ctx) => {
						requests.count++;

						expect(req.params.project).toEqual("images");
						expect(req.params.accountId).toEqual("some-account-id");

						return res.once(
							ctx.status(200),
							ctx.json({
								success: true,
								errors: [],
								messages: [],
								result: deployments,
							})
						);
					}
				)
			);
			return requests;
		}

		it("should make request to list deployments", async () => {
			const deployments: Deployment[] = [
				{
					id: "87bbc8fe-16be-45cd-81e0-63d722e82cdf",
					url: "https://87bbc8fe.images.pages.dev",
					environment: "preview",
					created_on: "2021-11-17T14:52:26.133835Z",
					latest_stage: {
						ended_on: "2021-11-17T14:52:26.133835Z",
						status: "success",
					},
					deployment_trigger: {
						metadata: {
							branch: "main",
							commit_hash: "c7649364c4cb32ad4f65b530b9424e8be5bec9d6",
						},
					},
					project_name: "images",
				},
			];

			const requests = mockListRequest(deployments);
			await runWrangler("pages deployment list --project-name=images");

			expect(requests.count).toBe(1);
		});
	});

	describe("deployment create", () => {
		let actualProcessEnvCI: string | undefined;

		mockAccountId();
		mockApiToken();
		runInTempDir();

		//TODO Abstract MSW handlers that repeat to this level - JACOB
		beforeEach(() => {
			actualProcessEnvCI = process.env.CI;
			process.env.CI = "true";
		});

		afterEach(() => {
			process.env.CI = actualProcessEnvCI;
		});

		it("should be aliased with 'wrangler pages publish'", async () => {
			await runWrangler("pages publish --help");
			await endEventLoop();

			expect(std.out).toMatchInlineSnapshot(`
			"wrangler pages publish [directory]

			🆙 Publish a directory of static assets as a Pages deployment

			Positionals:
			  directory  The directory of static files to upload  [string]

			Flags:
			  -e, --env      Environment to use for operations and .env files  [string]
			  -h, --help     Show help  [boolean]
			  -v, --version  Show version number  [boolean]

			Options:
			      --project-name    The name of the project you want to deploy to  [string]
			      --branch          The name of the branch you want to deploy to  [string]
			      --commit-hash     The SHA to attach to this deployment  [string]
			      --commit-message  The commit message to attach to this deployment  [string]
			      --commit-dirty    Whether or not the workspace should be considered dirty for this deployment  [boolean]
			      --skip-caching    Skip asset caching which speeds up builds  [boolean]
			      --no-bundle       Whether to run bundling on \`_worker.js\` before deploying  [boolean] [default: true]

			🚧 'wrangler pages <command>' is a beta command. Please report any issues to https://github.com/cloudflare/wrangler2/issues/new/choose"
		`);
		});

		it("should upload a directory of files", async () => {
			writeFileSync("logo.png", "foobar");
			mockGetToken("<<funfetti-auth-jwt>>");

			msw.use(
				rest.post("*/pages/assets/check-missing", async (req, res, ctx) => {
					const body = await req.json();

					expect(req.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt>>"
					);
					expect(body).toMatchObject({
						hashes: ["2082190357cfd3617ccfe04f340c6247"],
					});

					return res.once(
						ctx.status(200),
						ctx.json({
							success: true,
							errors: [],
							messages: [],
							result: body.hashes,
						})
					);
				}),
				rest.post("*/pages/assets/upload", async (req, res, ctx) => {
					expect(req.headers.get("Authorization")).toMatchInlineSnapshot(
						`"Bearer <<funfetti-auth-jwt>>"`
					);
					expect(await req.json()).toMatchObject([
						{
							key: "2082190357cfd3617ccfe04f340c6247",
							value: Buffer.from("foobar").toString("base64"),
							metadata: {
								contentType: "image/png",
							},
							base64: true,
						},
					]);
					return res.once(
						ctx.status(200),
						ctx.json({ success: true, errors: [], messages: [], result: null })
					);
				}),
				rest.post(
					"*/accounts/:accountId/pages/projects/foo/deployments",
					async (req, res, ctx) => {
						expect(req.params.accountId).toEqual("some-account-id");
						expect(await (req as RestRequestWithFormData).formData())
							.toMatchInlineSnapshot(`
				FormData {
				  Symbol(state): Array [
				    Object {
				      "name": "manifest",
				      "value": "{\\"/logo.png\\":\\"2082190357cfd3617ccfe04f340c6247\\"}",
				    },
				  ],
				}
			`);
						return res.once(
							ctx.status(200),
							ctx.json({
								success: true,
								errors: [],
								messages: [],
								result: {
									url: "https://abcxyz.foo.pages.dev/",
								},
							})
						);
					}
				),
				rest.get(
					"*/accounts/:accountId/pages/projects/foo",
					async (req, res, ctx) => {
						expect(req.params.accountId).toEqual("some-account-id");

						return res.once(
							ctx.status(200),
							ctx.json({
								success: true,
								errors: [],
								messages: [],
								result: { deployment_configs: { production: {}, preview: {} } },
							})
						);
					}
				)
			);

			await runWrangler("pages publish . --project-name=foo");

			expect(std.out).toMatchInlineSnapshot(`
			  "✨ Success! Uploaded 1 files (TIMINGS)

			  ✨ Deployment complete! Take a peek over at https://abcxyz.foo.pages.dev/"
			`);
		});

		it("should retry uploads", async () => {
			writeFileSync("logo.txt", "foobar");

			mockGetToken("<<funfetti-auth-jwt>>");

			// Accumulate multiple requests then assert afterwards
			const requests: RestRequest[] = [];
			msw.use(
				rest.post("*/pages/assets/check-missing", async (req, res, ctx) => {
					const body = await req.json();

					expect(req.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt>>"
					);
					expect(body).toMatchObject({
						hashes: ["1a98fb08af91aca4a7df1764a2c4ddb0"],
					});

					return res.once(
						ctx.status(200),
						ctx.json({
							success: true,
							errors: [],
							messages: [],
							result: body.hashes,
						})
					);
				}),
				rest.post("*/pages/assets/upload", async (req, res, ctx) => {
					requests.push(req);
					expect(req.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt>>"
					);
					expect(await req.json()).toMatchObject([
						{
							key: "1a98fb08af91aca4a7df1764a2c4ddb0",
							value: Buffer.from("foobar").toString("base64"),
							metadata: {
								contentType: "text/plain",
							},
							base64: true,
						},
					]);

					if (requests.length < 2) {
						return res(
							ctx.status(200),
							ctx.json({
								success: false,
								errors: [
									{
										code: 800000,
										message: "Something exploded, please retry",
									},
								],
								messages: [],
								result: null,
							})
						);
					} else {
						return res(
							ctx.status(200),
							ctx.json({
								success: true,
								errors: [],
								messages: [],
								result: null,
							})
						);
					}
				}),
				rest.post(
					"*/accounts/:accountId/pages/projects/foo/deployments",
					async (req, res, ctx) => {
						expect(req.params.accountId).toEqual("some-account-id");
						expect(await (req as RestRequestWithFormData).formData())
							.toMatchInlineSnapshot(`
				FormData {
				  Symbol(state): Array [
				    Object {
				      "name": "manifest",
				      "value": "{\\"/logo.txt\\":\\"1a98fb08af91aca4a7df1764a2c4ddb0\\"}",
				    },
				  ],
				}
			`);

						return res.once(
							ctx.status(200),
							ctx.json({
								success: true,
								errors: [],
								messages: [],
								result: { url: "https://abcxyz.foo.pages.dev/" },
							})
						);
					}
				),
				rest.get(
					"*/accounts/:accountId/pages/projects/foo",
					async (req, res, ctx) => {
						expect(req.params.accountId).toEqual("some-account-id");

						return res.once(
							ctx.status(200),
							ctx.json({
								success: true,
								errors: [],
								messages: [],
								result: { deployment_configs: { production: {}, preview: {} } },
							})
						);
					}
				)
			);

			await runWrangler("pages publish . --project-name=foo");

			expect(std.out).toMatchInlineSnapshot(`
			        "✨ Success! Uploaded 1 files (TIMINGS)

			        ✨ Deployment complete! Take a peek over at https://abcxyz.foo.pages.dev/"
		      `);
		});

		it("should refetch a JWT if it expires while uploading", async () => {
			writeFileSync("logo.txt", "foobar");
			mockGetToken("<<funfetti-auth-jwt>>");

			const requests: RestRequest[] = [];
			msw.use(
				rest.post("*/pages/assets/check-missing", async (req, res, ctx) => {
					const body = (await req.json()) as { hashes: string[] };

					expect(req.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt>>"
					);
					expect(body).toMatchObject({
						hashes: ["1a98fb08af91aca4a7df1764a2c4ddb0"],
					});

					return res.once(
						ctx.status(200),
						ctx.json({
							success: true,
							errors: [],
							messages: [],
							result: body.hashes,
						})
					);
				}),
				rest.post("*/pages/assets/upload", async (req, res, ctx) => {
					requests.push(req);
					expect(await req.json()).toMatchObject([
						{
							key: "1a98fb08af91aca4a7df1764a2c4ddb0",
							value: Buffer.from("foobar").toString("base64"),
							metadata: {
								contentType: "text/plain",
							},
							base64: true,
						},
					]);
					// Fail just the first request
					if (requests.length < 2) {
						mockGetToken("<<funfetti-auth-jwt2>>");
						return res(
							ctx.status(200),
							ctx.json({
								success: false,
								errors: [
									{
										code: 8000013,
										message: "Authorization failed",
									},
								],
								messages: [],
								result: null,
							})
						);
					} else {
						return res(
							ctx.status(200),
							ctx.json({
								success: true,
								errors: [],
								messages: [],
								result: null,
							})
						);
					}
				}),
				rest.post(
					"*/accounts/:accountId/pages/projects/foo/deployments",
					async (req, res, ctx) => {
						expect(req.params.accountId).toEqual("some-account-id");
						expect(await (req as RestRequestWithFormData).formData())
							.toMatchInlineSnapshot(`
				FormData {
				  Symbol(state): Array [
				    Object {
				      "name": "manifest",
				      "value": "{\\"/logo.txt\\":\\"1a98fb08af91aca4a7df1764a2c4ddb0\\"}",
				    },
				  ],
				}
			`);

						return res.once(
							ctx.status(200),
							ctx.json({
								success: true,
								errors: [],
								messages: [],
								result: { url: "https://abcxyz.foo.pages.dev/" },
							})
						);
					}
				),
				rest.get(
					"*/accounts/:accountId/pages/projects/foo",
					async (req, res, ctx) => {
						expect(req.params.accountId).toEqual("some-account-id");

						return res.once(
							ctx.status(200),
							ctx.json({
								success: true,
								errors: [],
								messages: [],
								result: { deployment_configs: { production: {}, preview: {} } },
							})
						);
					}
				)
			);

			await runWrangler("pages publish . --project-name=foo");

			expect(requests[0].headers.get("Authorization")).toBe(
				"Bearer <<funfetti-auth-jwt>>"
			);

			expect(requests[1].headers.get("Authorization")).toBe(
				"Bearer <<funfetti-auth-jwt2>>"
			);

			expect(std.out).toMatchInlineSnapshot(`
			        "✨ Success! Uploaded 1 files (TIMINGS)

			        ✨ Deployment complete! Take a peek over at https://abcxyz.foo.pages.dev/"
		      `);
		});

		it("should try to use multiple buckets (up to the max concurrency)", async () => {
			writeFileSync("logo.txt", "foobar");
			writeFileSync("logo.png", "foobar");
			writeFileSync("logo.html", "foobar");
			writeFileSync("logo.js", "foobar");

			mockGetToken("<<funfetti-auth-jwt>>");

			// Accumulate multiple requests then assert afterwards
			const requests: RestRequest[] = [];
			const bodies: UploadPayloadFile[][] = [];
			msw.use(
				rest.post("*/pages/assets/check-missing", async (req, res, ctx) => {
					const body = (await req.json()) as {
						hashes: string[];
					};

					expect(req.headers.get("Authorization")).toBe(
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

					return res.once(
						ctx.status(200),
						ctx.json({
							success: true,
							errors: [],
							messages: [],
							result: body.hashes,
						})
					);
				}),
				rest.post("*/pages/assets/upload", async (req, res, ctx) => {
					requests.push(req);

					expect(req.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt>>"
					);
					bodies.push((await req.json()) as UploadPayloadFile[]);

					return res(
						ctx.status(200),
						ctx.json({
							success: true,
							errors: [],
							messages: [],
							result: null,
						})
					);
				}),
				rest.post(
					"*/accounts/:accountId/pages/projects/foo/deployments",
					async (req, res, ctx) => {
						expect(req.params.accountId).toEqual("some-account-id");

						const body = await (req as RestRequestWithFormData).formData();
						const manifest = JSON.parse(body.get("manifest") as string);

						expect(manifest).toMatchInlineSnapshot(`
						                      Object {
						                        "/logo.html": "d96fef225537c9f5e44a3cb27fd0b492",
						                        "/logo.js": "6be321bef99e758250dac034474ddbb8",
						                        "/logo.png": "2082190357cfd3617ccfe04f340c6247",
						                        "/logo.txt": "1a98fb08af91aca4a7df1764a2c4ddb0",
						                      }
						                `);

						return res.once(
							ctx.status(200),
							ctx.json({
								success: true,
								errors: [],
								messages: [],
								result: {
									url: "https://abcxyz.foo.pages.dev/",
								},
							})
						);
					}
				),
				rest.get(
					"*/accounts/:accountId/pages/projects/foo",
					async (req, res, ctx) => {
						expect(req.params.accountId).toEqual("some-account-id");

						return res.once(
							ctx.status(200),
							ctx.json({
								success: true,
								errors: [],
								messages: [],
								result: {
									deployment_configs: { production: {}, preview: {} },
								},
							})
						);
					}
				)
			);

			await runWrangler("pages publish . --project-name=foo");

			// We have 3 buckets, so expect 3 uploads
			expect(requests.length).toBe(3);

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

			expect(std.out).toMatchInlineSnapshot(`
			        "✨ Success! Uploaded 4 files (TIMINGS)

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

			mockGetToken("<<funfetti-auth-jwt>>");

			// Accumulate multiple requests then assert afterwards
			const requests: RestRequest[] = [];
			const bodies: UploadPayloadFile[][] = [];
			msw.use(
				rest.post("*/pages/assets/check-missing", async (req, res, ctx) => {
					const body = (await req.json()) as {
						hashes: string[];
					};

					expect(req.headers.get("Authorization")).toBe(
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

					return res.once(
						ctx.status(200),
						ctx.json({
							success: true,
							errors: [],
							messages: [],
							result: body.hashes,
						})
					);
				}),
				rest.post("*/pages/assets/upload", async (req, res, ctx) => {
					requests.push(req);

					expect(req.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt>>"
					);
					bodies.push((await req.json()) as UploadPayloadFile[]);

					return res(
						ctx.status(200),
						ctx.json({
							success: true,
							errors: [],
							messages: [],
							result: null,
						})
					);
				}),
				rest.post(
					"*/accounts/:accountId/pages/projects/foo/deployments",
					async (req, res, ctx) => {
						expect(req.params.accountId).toEqual("some-account-id");
						const body = await (req as RestRequestWithFormData).formData();
						const manifest = JSON.parse(body.get("manifest") as string);
						expect(manifest).toMatchInlineSnapshot(`
						                      Object {
						                        "/imgs/logo.png": "2082190357cfd3617ccfe04f340c6247",
						                        "/logo.html": "d96fef225537c9f5e44a3cb27fd0b492",
						                        "/logo.js": "6be321bef99e758250dac034474ddbb8",
						                        "/logo.txt": "1a98fb08af91aca4a7df1764a2c4ddb0",
						                      }
						                `);

						return res.once(
							ctx.status(200),
							ctx.json({
								success: true,
								errors: [],
								messages: [],
								result: { url: "https://abcxyz.foo.pages.dev/" },
							})
						);
					}
				),
				rest.get(
					"*/accounts/:accountId/pages/projects/foo",
					async (req, res, ctx) => {
						expect(req.params.accountId).toEqual("some-account-id");

						return res.once(
							ctx.status(200),
							ctx.json({
								success: true,
								errors: [],
								messages: [],
								result: {
									deployment_configs: { production: {}, preview: {} },
								},
							})
						);
					}
				)
			);

			await runWrangler(`pages publish public --project-name=foo`);

			// We have 3 buckets, so expect 3 uploads
			expect(requests.length).toBe(3);
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

			expect(std.out).toMatchInlineSnapshot(`
			          "✨ Success! Uploaded 4 files (TIMINGS)

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

			mockGetToken("<<funfetti-auth-jwt>>");

			// Accumulate multiple requests then assert afterwards
			const requests: RestRequest[] = [];
			const bodies: UploadPayloadFile[][] = [];
			msw.use(
				rest.post("*/pages/assets/check-missing", async (req, res, ctx) => {
					const body = (await req.json()) as {
						hashes: string[];
					};

					expect(req.headers.get("Authorization")).toBe(
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

					return res.once(
						ctx.status(200),
						ctx.json({
							success: true,
							errors: [],
							messages: [],
							result: body.hashes,
						})
					);
				}),
				rest.post("*/pages/assets/upload", async (req, res, ctx) => {
					requests.push(req);

					expect(req.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt>>"
					);
					bodies.push((await req.json()) as UploadPayloadFile[]);

					return res(
						ctx.status(200),
						ctx.json({
							success: true,
							errors: [],
							messages: [],
							result: null,
						})
					);
				}),
				rest.post(
					"*/accounts/:accountId/pages/projects/foo/deployments",
					async (req, res, ctx) => {
						expect(req.params.accountId).toEqual("some-account-id");

						const body = await (req as RestRequestWithFormData).formData();
						const manifest = JSON.parse(body.get("manifest") as string);
						expect(manifest).toMatchInlineSnapshot(`
						                      Object {
						                        "/imgs/logo.png": "2082190357cfd3617ccfe04f340c6247",
						                        "/logo.html": "d96fef225537c9f5e44a3cb27fd0b492",
						                        "/logo.js": "6be321bef99e758250dac034474ddbb8",
						                        "/logo.txt": "1a98fb08af91aca4a7df1764a2c4ddb0",
						                      }
						                `);

						return res.once(
							ctx.status(200),
							ctx.json({
								success: true,
								errors: [],
								messages: [],
								result: { url: "https://abcxyz.foo.pages.dev/" },
							})
						);
					}
				),
				rest.get(
					"*/accounts/:accountId/pages/projects/foo",
					async (req, res, ctx) => {
						expect(req.params.accountId).toEqual("some-account-id");

						return res.once(
							ctx.status(200),
							ctx.json({
								success: true,
								errors: [],
								messages: [],
								result: {
									deployment_configs: { production: {}, preview: {} },
								},
							})
						);
					}
				)
			);

			chdir("public");
			await runWrangler(`pages publish . --project-name=foo`);
			// We have 3 buckets, so expect 3 uploads
			expect(requests.length).toBe(3);
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

			expect(std.out).toMatchInlineSnapshot(`
			          "✨ Success! Uploaded 4 files (TIMINGS)

			          ✨ Deployment complete! Take a peek over at https://abcxyz.foo.pages.dev/"
		        `);
		});

		it("should not error when directory names contain periods and houses a extensionless file", async () => {
			mkdirSync(".well-known");
			// Note: same content as previous test, but since it's a different extension,
			// it hashes to a different value
			writeFileSync(".well-known/foobar", "foobar");

			mockGetToken("<<funfetti-auth-jwt>>");

			msw.use(
				rest.post("*/pages/assets/check-missing", async (req, res, ctx) => {
					const body = (await req.json()) as {
						hashes: string[];
					};

					expect(req.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt>>"
					);
					expect(body).toMatchObject({
						hashes: ["7b764dacfd211bebd8077828a7ddefd7"],
					});

					return res.once(
						ctx.status(200),
						ctx.json({
							success: true,
							errors: [],
							messages: [],
							result: body.hashes,
						})
					);
				}),

				rest.post("*/pages/assets/upload", async (req, res, ctx) => {
					expect(req.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt>>"
					);
					const body = (await req.json()) as UploadPayloadFile[];
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
					return res.once(
						ctx.status(200),
						ctx.json({
							success: true,
							errors: [],
							messages: [],
							result: null,
						})
					);
				}),
				rest.post(
					"*/accounts/:accountId/pages/projects/foo/deployments",
					async (req, res, ctx) => {
						expect(req.params.accountId).toEqual("some-account-id");

						return res.once(
							ctx.status(200),
							ctx.json({
								success: true,
								errors: [],
								messages: [],
								result: { url: "https://abcxyz.foo.pages.dev/" },
							})
						);
					}
				),
				rest.get(
					"*/accounts/:accountId/pages/projects/foo",
					async (req, res, ctx) => {
						expect(req.params.accountId).toEqual("some-account-id");

						return res.once(
							ctx.status(200),
							ctx.json({
								success: true,
								errors: [],
								messages: [],
								result: {
									deployment_configs: { production: {}, preview: {} },
								},
							})
						);
					}
				)
			);

			await runWrangler("pages publish . --project-name=foo");

			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should throw an error if user attempts to use config with pages", async () => {
			await expect(
				runWrangler("pages dev --config foo.toml")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`"Pages does not support wrangler.toml"`
			);
			await expect(
				runWrangler("pages publish --config foo.toml")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`"Pages does not support wrangler.toml"`
			);
		});

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

			mockGetToken("<<funfetti-auth-jwt>>");

			msw.use(
				rest.post("*/pages/assets/check-missing", async (req, res, ctx) => {
					const body = (await req.json()) as {
						hashes: string[];
					};

					expect(req.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt>>"
					);
					expect(body).toMatchObject({
						hashes: ["13a03eaf24ae98378acd36ea00f77f2f"],
					});

					return res.once(
						ctx.status(200),
						ctx.json({
							success: true,
							errors: [],
							messages: [],
							result: body.hashes,
						})
					);
				}),
				rest.post("*/pages/assets/upload", async (req, res, ctx) => {
					expect(req.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt>>"
					);

					expect(await req.json()).toMatchObject([
						{
							key: "13a03eaf24ae98378acd36ea00f77f2f",
							value: Buffer.from("This is a readme").toString("base64"),
							metadata: {
								contentType: "text/markdown",
							},
							base64: true,
						},
					]);
					return res.once(
						ctx.status(200),
						ctx.json({
							success: true,
							errors: [],
							messages: [],
							result: true,
						})
					);
				}),
				rest.post(`*/pages/assets/upsert-hashes`, async (req, res, ctx) => {
					expect(req.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt>>"
					);

					expect(await req.json()).toMatchObject({
						hashes: ["13a03eaf24ae98378acd36ea00f77f2f"],
					});

					return res.once(
						ctx.status(200),
						ctx.json({
							success: true,
							errors: [],
							messages: [],
							result: true,
						})
					);
				}),

				rest.post(
					"*/accounts/:accountId/pages/projects/foo/deployments",
					async (req, res, ctx) => {
						expect(req.params.accountId).toEqual("some-account-id");
						const body = await (req as RestRequestWithFormData).formData();
						const manifest = JSON.parse(body.get("manifest") as string);

						// for Functions projects, we auto-generate a `_worker.js`,
						// `functions-filepath-routing-config.json`, and `_routes.json`
						// file, based on the contents of `/functions`
						const generatedWorkerJS = body.get("_worker.js") as string;
						const generatedRoutesJSON = body.get("_routes.json") as string;
						const generatedFilepathRoutingConfig = body.get(
							"functions-filepath-routing-config.json"
						) as string;

						// make sure this is all we uploaded
						expect([...body.keys()]).toEqual([
							"manifest",
							"functions-filepath-routing-config.json",
							"_worker.js",
							"_routes.json",
						]);

						expect(manifest).toMatchInlineSnapshot(`
						                        Object {
						                          "/README.md": "13a03eaf24ae98378acd36ea00f77f2f",
						                        }
						                  `);

						// the contents of the generated `_worker.js` file is pretty massive, so I don't
						// think snapshot testing makes much sense here. Plus, calling
						// `.toMatchInlineSnapshot()` without any arguments, in order to generate that
						// snapshot value, doesn't generate anything in this case (probably because the
						// file contents is too big). So for now, let's test that _worker.js was indeed
						// generated and that the file size is greater than zero
						expect(generatedWorkerJS).not.toBeNull();
						expect(generatedWorkerJS.length).toBeGreaterThan(0);

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

						return res.once(
							ctx.status(200),
							ctx.json({
								success: true,
								errors: [],
								messages: [],
								result: {
									url: "https://abcxyz.foo.pages.dev/",
								},
							})
						);
					}
				),
				rest.get(
					"*/accounts/:accountId/pages/projects/foo",
					async (req, res, ctx) => {
						expect(req.params.accountId).toEqual("some-account-id");

						return res.once(
							ctx.status(200),
							ctx.json({
								success: true,
								errors: [],
								messages: [],
								result: {
									deployment_configs: { production: {}, preview: {} },
								},
							})
						);
					}
				)
			);

			await runWrangler("pages publish public --project-name=foo");

			expect(std.out).toMatchInlineSnapshot(`
			"✨ Compiled Worker successfully
			✨ Success! Uploaded 1 files (TIMINGS)

			✨ Uploading Functions
			✨ Deployment complete! Take a peek over at https://abcxyz.foo.pages.dev/"
			`);

			expect(std.err).toMatchInlineSnapshot('""');
		});

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
						return url.pathname.startsWith('/api/') ? new Response('Ok') : env.ASSETS.fetch(request);
					}
				};
			`
			);

			mockGetToken("<<funfetti-auth-jwt>>");

			msw.use(
				rest.post("*/pages/assets/check-missing", async (req, res, ctx) => {
					const body = (await req.json()) as {
						hashes: string[];
					};

					expect(req.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt>>"
					);
					expect(body).toMatchObject({
						hashes: ["13a03eaf24ae98378acd36ea00f77f2f"],
					});

					return res.once(
						ctx.status(200),
						ctx.json({
							success: true,
							errors: [],
							messages: [],
							result: body.hashes,
						})
					);
				}),
				rest.post("*/pages/assets/upload", async (req, res, ctx) => {
					expect(req.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt>>"
					);

					expect(await req.json()).toMatchObject([
						{
							key: "13a03eaf24ae98378acd36ea00f77f2f",
							value: Buffer.from("This is a readme").toString("base64"),
							metadata: {
								contentType: "text/markdown",
							},
							base64: true,
						},
					]);
					return res.once(
						ctx.status(200),
						ctx.json({
							success: true,
							errors: [],
							messages: [],
							result: true,
						})
					);
				}),
				rest.post(
					"*/accounts/:accountId/pages/projects/foo/deployments",
					async (req, res, ctx) => {
						expect(req.params.accountId).toEqual("some-account-id");
						const body = await (req as RestRequestWithFormData).formData();
						const manifest = JSON.parse(body.get("manifest") as string);
						const customWorkerJS = body.get("_worker.js");

						// make sure this is all we uploaded
						expect([...body.keys()].sort()).toEqual(
							["manifest", "_worker.js"].sort()
						);

						expect(manifest).toMatchInlineSnapshot(`
							                          Object {
							                            "/README.md": "13a03eaf24ae98378acd36ea00f77f2f",
							                          }
						                      `);

						expect(customWorkerJS).toMatchInlineSnapshot(`
							"
											export default {
												async fetch(request, env) {
													const url = new URL(request.url);
													return url.pathname.startsWith('/api/') ? new Response('Ok') : env.ASSETS.fetch(request);
												}
											};
										"
						`);
						return res.once(
							ctx.status(200),
							ctx.json({
								success: true,
								errors: [],
								messages: [],
								result: {
									url: "https://abcxyz.foo.pages.dev/",
								},
							})
						);
					}
				),
				rest.get(
					"*/accounts/:accountId/pages/projects/foo",
					async (req, res, ctx) => {
						expect(req.params.accountId).toEqual("some-account-id");

						return res.once(
							ctx.status(200),
							ctx.json({
								success: true,
								errors: [],
								messages: [],
								result: {
									deployment_configs: { production: {}, preview: {} },
								},
							})
						);
					}
				)
			);

			await runWrangler("pages publish public --project-name=foo");

			expect(std.out).toMatchInlineSnapshot(`
			"✨ Success! Uploaded 1 files (TIMINGS)

			✨ Compiled Worker successfully
			✨ Uploading _worker.js
			✨ Deployment complete! Take a peek over at https://abcxyz.foo.pages.dev/"
		`);

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

			mockGetToken("<<funfetti-auth-jwt>>");
			msw.use(
				rest.post("*/pages/assets/check-missing", async (req, res, ctx) => {
					const body = (await req.json()) as {
						hashes: string[];
					};

					expect(req.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt>>"
					);
					expect(body).toMatchObject({
						hashes: ["13a03eaf24ae98378acd36ea00f77f2f"],
					});

					return res.once(
						ctx.status(200),
						ctx.json({
							success: true,
							errors: [],
							messages: [],
							result: body.hashes,
						})
					);
				}),
				rest.post("*/pages/assets/upload", async (req, res, ctx) => {
					expect(req.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt>>"
					);

					expect(await req.json()).toMatchObject([
						{
							key: "13a03eaf24ae98378acd36ea00f77f2f",
							value: Buffer.from("This is a readme").toString("base64"),
							metadata: {
								contentType: "text/markdown",
							},
							base64: true,
						},
					]);

					return res.once(
						ctx.status(200),
						ctx.json({
							success: true,
							errors: [],
							messages: [],
							result: null,
						})
					);
				}),
				rest.post(`*/pages/assets/upsert-hashes`, async (req, res, ctx) => {
					expect(req.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt>>"
					);

					expect(await req.json()).toMatchObject({
						hashes: ["13a03eaf24ae98378acd36ea00f77f2f"],
					});

					return res.once(
						ctx.status(200),
						ctx.json({
							success: true,
							errors: [],
							messages: [],
							result: true,
						})
					);
				}),
				rest.post(
					"*/accounts/:accountId/pages/projects/foo/deployments",
					async (req, res, ctx) => {
						expect(req.params.accountId).toEqual("some-account-id");
						const body = await (req as RestRequestWithFormData).formData();
						const manifest = JSON.parse(body.get("manifest") as string);
						const generatedWorkerJS = body.get("_worker.js") as string;
						const customRoutesJSON = body.get("_routes.json") as string;
						const generatedFilepathRoutingConfig = body.get(
							"functions-filepath-routing-config.json"
						) as string;

						// make sure this is all we uploaded
						expect([...body.keys()].sort()).toEqual(
							[
								"manifest",
								"functions-filepath-routing-config.json",
								"_worker.js",
								"_routes.json",
							].sort()
						);

						expect(manifest).toMatchInlineSnapshot(`
						                      Object {
						                        "/README.md": "13a03eaf24ae98378acd36ea00f77f2f",
						                      }
						                `);

						// file content of generated `_worker.js` is too massive to snapshot test
						expect(generatedWorkerJS).not.toBeNull();
						expect(generatedWorkerJS.length).toBeGreaterThan(0);

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

						return res.once(
							ctx.status(200),
							ctx.json({
								success: true,
								errors: [],
								messages: [],
								result: {
									url: "https://abcxyz.foo.pages.dev/",
								},
							})
						);
					}
				),
				rest.get(
					"*/accounts/:accountId/pages/projects/foo",
					async (req, res, ctx) => {
						expect(req.params.accountId).toEqual("some-account-id");

						return res.once(
							ctx.status(200),
							ctx.json({
								success: true,
								errors: [],
								messages: [],
								result: {
									deployment_configs: { production: {}, preview: {} },
								},
							})
						);
					}
				)
			);

			await runWrangler("pages publish public --project-name=foo");

			expect(std.out).toMatchInlineSnapshot(`
			"✨ Compiled Worker successfully
			✨ Success! Uploaded 1 files (TIMINGS)

			✨ Uploading Functions
			✨ Uploading _routes.json
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

			mockGetToken("<<funfetti-auth-jwt>>");
			msw.use(
				rest.post("*/pages/assets/check-missing", async (req, res, ctx) => {
					const body = (await req.json()) as {
						hashes: string[];
					};

					expect(req.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt>>"
					);
					expect(body).toMatchObject({
						hashes: ["13a03eaf24ae98378acd36ea00f77f2f"],
					});

					return res.once(
						ctx.status(200),
						ctx.json({
							success: true,
							errors: [],
							messages: [],
							result: body.hashes,
						})
					);
				}),
				rest.post("*/pages/assets/upload", async (req, res, ctx) => {
					expect(req.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt>>"
					);

					expect(await req.json()).toMatchObject([
						{
							key: "13a03eaf24ae98378acd36ea00f77f2f",
							value: Buffer.from("This is a readme").toString("base64"),
							metadata: {
								contentType: "text/markdown",
							},
							base64: true,
						},
					]);

					return res.once(
						ctx.status(200),
						ctx.json({
							success: true,
							errors: [],
							messages: [],
							result: null,
						})
					);
				}),
				rest.get(
					"*/accounts/:accountId/pages/projects/foo",
					async (req, res, ctx) => {
						expect(req.params.accountId).toEqual("some-account-id");

						return res.once(
							ctx.status(200),
							ctx.json({
								success: true,
								errors: [],
								messages: [],
								result: {
									deployment_configs: { production: {}, preview: {} },
								},
							})
						);
					}
				)
			);

			await expect(runWrangler("pages publish public --project-name=foo"))
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

			mockGetToken("<<funfetti-auth-jwt>>");

			msw.use(
				rest.post("*/pages/assets/check-missing", async (req, res, ctx) => {
					const body = (await req.json()) as {
						hashes: string[];
					};

					expect(req.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt>>"
					);
					expect(body).toMatchObject({
						hashes: ["13a03eaf24ae98378acd36ea00f77f2f"],
					});

					return res.once(
						ctx.status(200),
						ctx.json({
							success: true,
							errors: [],
							messages: [],
							result: body.hashes,
						})
					);
				}),
				rest.post("*/pages/assets/upload", async (req, res, ctx) => {
					expect(req.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt>>"
					);

					expect(await req.json()).toMatchObject([
						{
							key: "13a03eaf24ae98378acd36ea00f77f2f",
							value: Buffer.from("This is a readme").toString("base64"),
							metadata: {
								contentType: "text/markdown",
							},
							base64: true,
						},
					]);

					return res.once(
						ctx.status(200),
						ctx.json({
							success: true,
							errors: [],
							messages: [],
							result: null,
						})
					);
				}),
				rest.post(`*/pages/assets/upsert-hashes`, async (req, res, ctx) => {
					expect(req.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt>>"
					);

					expect(await req.json()).toMatchObject({
						hashes: ["13a03eaf24ae98378acd36ea00f77f2f"],
					});

					return res.once(
						ctx.status(200),
						ctx.json({
							success: true,
							errors: [],
							messages: [],
							result: true,
						})
					);
				}),
				rest.post(
					"*/accounts/:accountId/pages/projects/foo/deployments",
					async (req, res, ctx) => {
						const body = await (req as RestRequestWithFormData).formData();

						const manifest = JSON.parse(body.get("manifest") as string);
						const customWorkerJS = body.get("_worker.js") as string;
						const customRoutesJSON = body.get("_routes.json") as string;

						// make sure this is all we uploaded
						expect([...body.keys()]).toEqual([
							"manifest",
							"_worker.js",
							"_routes.json",
						]);
						expect(req.params.accountId).toEqual("some-account-id");
						expect(manifest).toMatchInlineSnapshot(`
							Object {
							  "/README.md": "13a03eaf24ae98378acd36ea00f77f2f",
							}
						`);

						expect(customWorkerJS).toMatchInlineSnapshot(`
							"
											export default {
												async fetch(request, env) {
													const url = new URL(request.url);
													return url.pathname.startsWith('/api/') ? new Response('Ok') : env.ASSETS.fetch(request);
												}
											};
										"
						`);

						expect(JSON.parse(customRoutesJSON)).toMatchObject({
							version: ROUTES_SPEC_VERSION,
							description: "Custom _routes.json file",
							include: ["/api/*"],
							exclude: [],
						});

						return res.once(
							ctx.status(200),
							ctx.json({
								success: true,
								errors: [],
								messages: [],
								result: {
									url: "https://abcxyz.foo.pages.dev/",
								},
							})
						);
					}
				),
				rest.get(
					"*/accounts/:accountId/pages/projects/foo",
					async (req, res, ctx) => {
						expect(req.params.accountId).toEqual("some-account-id");

						return res.once(
							ctx.status(200),
							ctx.json({
								success: true,
								errors: [],
								messages: [],
								result: {
									deployment_configs: { production: {}, preview: {} },
								},
							})
						);
					}
				)
			);

			await runWrangler("pages publish public --project-name=foo");

			expect(std.out).toMatchInlineSnapshot(`
			"✨ Success! Uploaded 1 files (TIMINGS)

			✨ Compiled Worker successfully
			✨ Uploading _worker.js
			✨ Uploading _routes.json
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

			mockGetToken("<<funfetti-auth-jwt>>");

			msw.use(
				rest.post("*/pages/assets/check-missing", async (req, res, ctx) => {
					const body = (await req.json()) as {
						hashes: string[];
					};

					expect(req.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt>>"
					);
					expect(body).toMatchObject({
						hashes: ["13a03eaf24ae98378acd36ea00f77f2f"],
					});

					return res.once(
						ctx.status(200),
						ctx.json({
							success: true,
							errors: [],
							messages: [],
							result: body.hashes,
						})
					);
				}),
				rest.post("*/pages/assets/upload", async (req, res, ctx) => {
					expect(req.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt>>"
					);

					expect(await req.json()).toMatchObject([
						{
							key: "13a03eaf24ae98378acd36ea00f77f2f",
							value: Buffer.from("This is a readme").toString("base64"),
							metadata: {
								contentType: "text/markdown",
							},
							base64: true,
						},
					]);

					return res.once(
						ctx.status(200),
						ctx.json({
							success: true,
							errors: [],
							messages: [],
							result: null,
						})
					);
				}),

				rest.get(
					"*/accounts/:accountId/pages/projects/foo",
					async (req, res, ctx) => {
						expect(req.params.accountId).toEqual("some-account-id");
						return res.once(
							ctx.status(200),
							ctx.json({
								success: true,
								errors: [],
								messages: [],
								result: {
									deployment_configs: { production: {}, preview: {} },
								},
							})
						);
					}
				)
			);

			await expect(runWrangler("pages publish public --project-name=foo"))
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

			mockGetToken("<<funfetti-auth-jwt>>");

			msw.use(
				rest.post("*/pages/assets/check-missing", async (req, res, ctx) => {
					const body = (await req.json()) as {
						hashes: string[];
					};

					expect(req.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt>>"
					);
					expect(body).toMatchObject({
						hashes: ["13a03eaf24ae98378acd36ea00f77f2f"],
					});

					return res.once(
						ctx.status(200),
						ctx.json({
							success: true,
							errors: [],
							messages: [],
							result: body.hashes,
						})
					);
				}),
				rest.post("*/pages/assets/upload", async (req, res, ctx) => {
					expect(req.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt>>"
					);

					expect(await req.json()).toMatchObject([
						{
							key: "13a03eaf24ae98378acd36ea00f77f2f",
							value: Buffer.from("This is a readme").toString("base64"),
							metadata: {
								contentType: "text/markdown",
							},
							base64: true,
						},
					]);

					return res.once(
						ctx.status(200),
						ctx.json({
							success: true,
							errors: [],
							messages: [],
							result: null,
						})
					);
				}),

				rest.post(
					"*/accounts/:accountId/pages/projects/foo/deployments",
					async (req, res, ctx) => {
						const body = await (req as RestRequestWithFormData).formData();
						const manifest = JSON.parse(body.get("manifest") as string);
						const customWorkerJS = body.get("_worker.js");

						expect(req.params.accountId).toEqual("some-account-id");
						// make sure this is all we uploaded
						expect([...body.keys()].sort()).toEqual(
							["manifest", "_worker.js"].sort()
						);
						expect(manifest).toMatchInlineSnapshot(`
							                          Object {
							                            "/README.md": "13a03eaf24ae98378acd36ea00f77f2f",
							                          }
						                      `);
						expect(customWorkerJS).toMatchInlineSnapshot(`
							"
											export default {
												async fetch(request, env) {
													const url = new URL(request.url);
													return url.pathname.startsWith('/api/') ? new Response('Ok') : env.ASSETS.fetch(request);
												}
											};
										"
						`);

						return res.once(
							ctx.status(200),
							ctx.json({
								success: true,
								errors: [],
								messages: [],
								result: {
									url: "https://abcxyz.foo.pages.dev/",
								},
							})
						);
					}
				),
				rest.get(
					"*/accounts/:accountId/pages/projects/foo",
					async (req, res, ctx) => {
						expect(req.params.accountId).toEqual("some-account-id");

						return res.once(
							ctx.status(200),
							ctx.json({
								success: true,
								errors: [],
								messages: [],
								result: {
									deployment_configs: { production: {}, preview: {} },
								},
							})
						);
					}
				)
			);

			await runWrangler("pages publish public --project-name=foo");

			expect(std.out).toMatchInlineSnapshot(`
			"✨ Success! Uploaded 1 files (TIMINGS)

			✨ Compiled Worker successfully
			✨ Uploading _worker.js
			✨ Deployment complete! Take a peek over at https://abcxyz.foo.pages.dev/"
		`);

			expect(std.err).toMatchInlineSnapshot('""');
		});
	});

	describe("project upload", () => {
		const ENV_COPY = process.env;

		mockAccountId();
		mockApiToken();
		runInTempDir();

		beforeEach(() => {
			process.env.CI = "true";
			process.env.CF_PAGES_UPLOAD_JWT = "<<funfetti-auth-jwt>>";
		});

		afterEach(() => {
			process.env = ENV_COPY;
		});

		it("should upload a directory of files with a provided JWT", async () => {
			writeFileSync("logo.png", "foobar");

			msw.use(
				rest.post("*/pages/assets/check-missing", async (req, res, ctx) => {
					const body = (await req.json()) as {
						hashes: string[];
					};

					expect(req.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt>>"
					);
					expect(body).toMatchObject({
						hashes: ["2082190357cfd3617ccfe04f340c6247"],
					});

					return res.once(
						ctx.status(200),
						ctx.json({
							success: true,
							errors: [],
							messages: [],
							result: body.hashes,
						})
					);
				}),
				rest.post("*/pages/assets/upload", async (req, res, ctx) => {
					expect(req.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt>>"
					);

					expect(await req.json()).toMatchObject([
						{
							base64: true,
							key: "2082190357cfd3617ccfe04f340c6247",
							metadata: {
								contentType: "image/png",
							},
							value: "Zm9vYmFy",
						},
					]);

					return res(
						ctx.status(200),
						ctx.json({
							success: true,
							errors: [],
							messages: [],
							result: null,
						})
					);
				})
			);

			await runWrangler("pages project upload .");

			expect(std.out).toMatchInlineSnapshot(`
			        "✨ Success! Uploaded 1 files (TIMINGS)

			        ✨ Upload complete!"
		      `);
		});

		it("should avoid uploading some files", async () => {
			mkdirSync("some_dir/node_modules", { recursive: true });
			mkdirSync("some_dir/functions", { recursive: true });

			writeFileSync("logo.png", "foobar");
			writeFileSync("some_dir/functions/foo.js", "func");
			writeFileSync("some_dir/_headers", "headersfile");

			writeFileSync("_headers", "headersfile");
			writeFileSync("_redirects", "redirectsfile");
			writeFileSync("_worker.js", "workerfile");
			writeFileSync("_routes.json", "routesfile");
			mkdirSync(".git");
			writeFileSync(".git/foo", "gitfile");
			writeFileSync("some_dir/node_modules/some_package", "nodefile");
			mkdirSync("functions");
			writeFileSync("functions/foo.js", "func");

			// Accumulate multiple requests then assert afterwards
			const requests: RestRequest[] = [];
			msw.use(
				rest.post("*/pages/assets/check-missing", async (req, res, ctx) => {
					const body = (await req.json()) as {
						hashes: string[];
					};

					expect(req.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt>>"
					);
					expect(body).toMatchObject({
						hashes: [
							"2082190357cfd3617ccfe04f340c6247",
							"95dedb64e6d4940fc2e0f11f711cc2f4",
							"09a79777abda8ccc8bdd51dd3ff8e9e9",
						],
					});

					return res.once(
						ctx.status(200),
						ctx.json({
							success: true,
							errors: [],
							messages: [],
							result: body.hashes,
						})
					);
				}),
				rest.post("*/pages/assets/upload", (req, res, ctx) => {
					requests.push(req);

					return res(
						ctx.status(200),
						ctx.json({
							success: true,
							errors: [],
							messages: [],
							result: null,
						})
					);
				})
			);

			await runWrangler("pages project upload .");

			expect(requests.length).toBe(3);

			const resolvedRequests = await Promise.all(
				requests.map(async (req) => await req.json<UploadPayloadFile>())
			);

			const sortedRequests = resolvedRequests.sort((a, b) => {
				const aKey = a.key as string;
				const bKey = b.key as string;

				return aKey?.localeCompare(bKey);
			});

			for (const req of requests) {
				expect(req.headers.get("Authorization")).toBe(
					"Bearer <<funfetti-auth-jwt>>"
				);
			}

			expect(sortedRequests[0]).toMatchObject([
				{
					base64: true,
					key: "95dedb64e6d4940fc2e0f11f711cc2f4",
					metadata: {
						contentType: "application/octet-stream",
					},
					value: "aGVhZGVyc2ZpbGU=",
				},
			]);

			expect(sortedRequests[1]).toMatchObject([
				{
					base64: true,
					key: "2082190357cfd3617ccfe04f340c6247",
					metadata: {
						contentType: "image/png",
					},
					value: "Zm9vYmFy",
				},
			]);

			expect(sortedRequests[2]).toMatchObject([
				{
					base64: true,
					key: "09a79777abda8ccc8bdd51dd3ff8e9e9",
					metadata: {
						contentType: "application/javascript",
					},
					value: "ZnVuYw==",
				},
			]);

			expect(std.out).toMatchInlineSnapshot(`
			        "✨ Success! Uploaded 3 files (TIMINGS)

			        ✨ Upload complete!"
		      `);
		});

		it("should retry uploads", async () => {
			writeFileSync("logo.txt", "foobar");

			// Accumulate multiple requests then assert afterwards
			const requests: RestRequest[] = [];
			msw.use(
				rest.post("*/pages/assets/check-missing", async (req, res, ctx) => {
					const body = (await req.json()) as { hashes: string[] };

					expect(req.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt>>"
					);
					expect(body).toMatchObject({
						hashes: ["1a98fb08af91aca4a7df1764a2c4ddb0"],
					});

					return res.once(
						ctx.status(200),
						ctx.json({
							success: true,
							errors: [],
							messages: [],
							result: body.hashes,
						})
					);
				}),
				rest.post("*/pages/assets/upload", async (req, res, ctx) => {
					requests.push(req);

					if (requests.length < 2) {
						return res(
							ctx.status(200),
							ctx.json({
								success: false,
								errors: [
									{
										code: 800000,
										message: "Something exploded, please retry",
									},
								],
								messages: [],
								result: null,
							})
						);
					} else {
						return res(
							ctx.status(200),
							ctx.json({
								success: true,
								errors: [],
								messages: [],
								result: null,
							})
						);
					}
				})
			);

			await runWrangler("pages project upload .");

			// Assert two identical requests
			expect(requests.length).toBe(2);
			for (const init of requests) {
				expect(init.headers.get("Authorization")).toBe(
					"Bearer <<funfetti-auth-jwt>>"
				);

				const body = (await init.json()) as UploadPayloadFile[];
				expect(body).toMatchObject([
					{
						key: "1a98fb08af91aca4a7df1764a2c4ddb0",
						value: Buffer.from("foobar").toString("base64"),
						metadata: {
							contentType: "text/plain",
						},
						base64: true,
					},
				]);
			}

			expect(std.out).toMatchInlineSnapshot(`
			        "✨ Success! Uploaded 1 files (TIMINGS)

			        ✨ Upload complete!"
		      `);
		});

		it("should try to use multiple buckets (up to the max concurrency)", async () => {
			writeFileSync("logo.txt", "foobar");
			writeFileSync("logo.png", "foobar");
			writeFileSync("logo.html", "foobar");
			writeFileSync("logo.js", "foobar");

			mockGetToken("<<funfetti-auth-jwt>>");

			// Accumulate multiple requests then assert afterwards
			const requests: RestRequest[] = [];
			msw.use(
				rest.post("*/pages/assets/check-missing", async (req, res, ctx) => {
					const body = (await req.json()) as { hashes: string[] };

					expect(req.headers.get("Authorization")).toBe(
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

					return res.once(
						ctx.status(200),
						ctx.json({
							success: true,
							errors: [],
							messages: [],
							result: body.hashes,
						})
					);
				}),
				rest.post("*/pages/assets/upload", async (req, res, ctx) => {
					requests.push(req);

					expect(req.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt>>"
					);

					return res(
						ctx.status(200),
						ctx.json({
							success: true,
							errors: [],
							messages: [],
							result: null,
						})
					);
				})
			);

			await runWrangler("pages project upload .");

			// We have 3 buckets, so expect 3 uploads
			expect(requests.length).toBe(3);
			const bodies: UploadPayloadFile[][] = [];
			for (const init of requests) {
				bodies.push((await init.json()) as UploadPayloadFile[]);
			}
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

			expect(std.out).toMatchInlineSnapshot(`
			        "✨ Success! Uploaded 4 files (TIMINGS)

			        ✨ Upload complete!"
		      `);
		});

		it("should not error when directory names contain periods and houses a extensionless file", async () => {
			mkdirSync(".well-known");
			// Note: same content as previous test, but since it's a different extension,
			// it hashes to a different value
			writeFileSync(".well-known/foobar", "foobar");

			mockGetToken("<<funfetti-auth-jwt>>");

			msw.use(
				rest.post(
					"*/pages/assets/check-missing",

					async (req, res, ctx) => {
						const body = (await req.json()) as { hashes: string[] };

						expect(req.headers.get("Authorization")).toBe(
							"Bearer <<funfetti-auth-jwt>>"
						);
						expect(body).toMatchObject({
							hashes: ["7b764dacfd211bebd8077828a7ddefd7"],
						});

						return res.once(
							ctx.status(200),
							ctx.json({
								success: true,
								errors: [],
								messages: [],
								result: body.hashes,
							})
						);
					}
				),
				rest.post("*/pages/assets/upload", async (req, res, ctx) => {
					expect(req.headers.get("Authorization")).toBe(
						"Bearer <<funfetti-auth-jwt>>"
					);
					const body = (await req.json()) as UploadPayloadFile[];
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

					return res.once(
						ctx.status(200),
						ctx.json({
							success: true,
							errors: [],
							messages: [],
							result: null,
						})
					);
				})
			);

			await runWrangler("pages project upload .");

			expect(std.err).toMatchInlineSnapshot(`""`);
		});
	});
});

function mockFormDataToString(this: FormData) {
	const entries = [];
	for (const [key, value] of this.entries()) {
		if (value instanceof Blob) {
			const reader = new FileReaderSync();
			reader.readAsText(value);
			const result = reader.result;
			entries.push([key, result]);
		} else {
			entries.push([key, value]);
		}
	}
	return JSON.stringify({
		__formdata: entries,
	});
}

async function mockFormDataFromString(this: MockedRequest): Promise<FormData> {
	const { __formdata } = await this.json();
	expect(__formdata).toBeInstanceOf(Array);

	const form = new FormData();
	for (const [key, value] of __formdata) {
		form.set(key, value);
	}
	return form;
}

// The following two functions workaround the fact that MSW does not yet support FormData in requests.
// We use the fact that MSW relies upon `node-fetch` internally, which will call `toString()` on the FormData object,
// rather than passing it through or serializing it as a proper FormData object.
// The hack is to serialize FormData to a JSON string by overriding `FormData.toString()`.
// And then to deserialize back to a FormData object by monkey-patching a `formData()` helper onto `MockedRequest`.
FormData.prototype.toString = mockFormDataToString;
export interface RestRequestWithFormData extends MockedRequest, RestRequest {
	formData(): Promise<FormData>;
}
(MockedRequest.prototype as RestRequestWithFormData).formData =
	mockFormDataFromString;
