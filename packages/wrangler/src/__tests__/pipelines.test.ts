import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { normalizeOutput } from "../../e2e/helpers/normalize";
import { __testSkipDelays } from "../pipelines";
import { endEventLoop } from "./helpers/end-event-loop";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type { HttpSource, Pipeline, PipelineEntry } from "../pipelines/client";

describe("pipelines", () => {
	const std = mockConsoleMethods();
	mockAccountId();
	mockApiToken();
	runInTempDir();

	const samplePipeline = {
		id: "0001",
		version: 1,
		name: "my-pipeline",
		metadata: {},
		source: [
			{
				type: "binding",
				format: "json",
			},
			{
				type: "http",
				format: "json",
				authentication: false,
			},
		],
		transforms: [],
		destination: {
			type: "r2",
			format: "json",
			batch: {},
			compression: {
				type: "none",
			},
			path: {
				bucket: "bucket",
			},
		},
		endpoint: "https://0001.pipelines.cloudflarestorage.com",
	} satisfies Pipeline;

	function mockCreateR2TokenFailure(bucket: string) {
		const requests = { count: 0 };
		msw.use(
			http.get(
				"*/accounts/:accountId/r2/buckets/:bucket",
				async ({ params }) => {
					expect(params.accountId).toEqual("some-account-id");
					expect(params.bucket).toEqual(bucket);
					requests.count++;
					return HttpResponse.json(
						{
							success: false,
							errors: [
								{
									code: 10006,
									message: "The specified bucket does not exist.",
								},
							],
							messages: [],
							result: null,
						},
						{ status: 404 }
					);
				},
				{ once: true }
			)
		);
		return requests;
	}

	function mockCreateRequest(
		name: string,
		status: number = 200,
		error?: object
	) {
		const requests: { count: number; body: Pipeline | null } = {
			count: 0,
			body: null,
		};
		msw.use(
			http.post(
				"*/accounts/:accountId/pipelines",
				async ({ request, params }) => {
					expect(params.accountId).toEqual("some-account-id");
					const config = (await request.json()) as Pipeline;
					expect(config.name).toEqual(name);
					requests.body = config;
					requests.count++;
					const pipeline: Pipeline = {
						...config,
						id: "0001",
						name: name,
						endpoint: "foo",
					};
					return HttpResponse.json(
						{
							success: !error,
							errors: error ? [error] : [],
							messages: [],
							result: pipeline,
						},
						{ status }
					);
				},
				{ once: true }
			)
		);
		return requests;
	}

	function mockListRequest(entries: PipelineEntry[]) {
		const requests = { count: 0 };
		msw.use(
			http.get(
				"*/accounts/:accountId/pipelines",
				async ({ params }) => {
					requests.count++;
					expect(params.accountId).toEqual("some-account-id");

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: entries,
						},
						{ status: 200 }
					);
				},
				{ once: true }
			)
		);
		return requests;
	}

	function mockShowRequest(
		name: string,
		pipeline: Pipeline | null,
		status: number = 200,
		error?: object
	) {
		const requests = { count: 0 };
		msw.use(
			http.get(
				"*/accounts/:accountId/pipelines/:name",
				async ({ params }) => {
					requests.count++;
					expect(params.accountId).toEqual("some-account-id");
					expect(params.name).toEqual(name);

					return HttpResponse.json(
						{
							success: !error,
							errors: error ? [error] : [],
							messages: [],
							result: pipeline,
						},
						{ status }
					);
				},
				{ once: true }
			)
		);
		return requests;
	}

	function mockUpdateRequest(
		name: string,
		pipeline: Pipeline | null,
		status: number = 200,
		error?: object
	) {
		const requests: { count: number; body: Pipeline | null } = {
			count: 0,
			body: null,
		};
		msw.use(
			http.put(
				"*/accounts/:accountId/pipelines/:name",
				async ({ params, request }) => {
					requests.count++;
					requests.body = (await request.json()) as Pipeline;
					expect(params.accountId).toEqual("some-account-id");
					expect(params.name).toEqual(name);

					// update strips creds, so enforce this
					if (pipeline?.destination) {
						pipeline.destination.credentials = undefined;
					}

					return HttpResponse.json(
						{
							success: !error,
							errors: error ? [error] : [],
							messages: [],
							result: pipeline,
						},
						{ status }
					);
				},
				{ once: true }
			)
		);
		return requests;
	}

	function mockDeleteRequest(
		name: string,
		status: number = 200,
		error?: object
	) {
		const requests = { count: 0 };
		msw.use(
			http.delete(
				"*/accounts/:accountId/pipelines/:name",
				async ({ params }) => {
					requests.count++;
					expect(params.accountId).toEqual("some-account-id");
					expect(params.name).toEqual(name);

					return HttpResponse.json(
						{
							success: !error,
							errors: error ? [error] : [],
							messages: [],
							result: null,
						},
						{ status }
					);
				},
				{ once: true }
			)
		);
		return requests;
	}

	beforeAll(() => {
		__testSkipDelays();
	});

	it("shows usage details", async () => {
		await runWrangler("pipelines");
		await endEventLoop();

		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler pipelines

			COMMANDS
			  wrangler pipelines create <pipeline>  Create a new Pipeline
			  wrangler pipelines list               List current Pipelines
			  wrangler pipelines show <pipeline>    Show a Pipeline configuration
			  wrangler pipelines update <pipeline>  Update a Pipeline
			  wrangler pipelines delete <pipeline>  Delete a Pipeline

			GLOBAL FLAGS
			  -c, --config   Path to Wrangler configuration file  [string]
			  -e, --env      Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			  -h, --help     Show help  [boolean]
			  -v, --version  Show version number  [boolean]"
		`);
	});

	describe("create", () => {
		it("should show usage details", async () => {
			await runWrangler("pipelines create -h");
			await endEventLoop();

			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.out).toMatchInlineSnapshot(`
				"wrangler pipelines create <pipeline>

				Create a new Pipeline

				POSITIONALS
				  pipeline  The name of the new pipeline  [string] [required]

				Source settings
				      --enable-worker-binding  Send data from a Worker to a Pipeline using a Binding  [boolean] [default: true]
				      --enable-http            Generate an endpoint to ingest data via HTTP  [boolean] [default: true]
				      --require-http-auth      Require Cloudflare API Token for HTTPS endpoint authentication  [boolean] [default: false]
				      --cors-origins           CORS origin allowlist for HTTP endpoint (use * for any origin)  [array]

				Batch hints
				      --batch-max-mb       Maximum batch size in megabytes before flushing  [number]
				      --batch-max-rows     Maximum number of rows per batch before flushing  [number]
				      --batch-max-seconds  Maximum age of batch in seconds before flushing  [number]

				Transformations
				      --transform-worker  Pipeline transform Worker and entrypoint (<worker>.<entrypoint>)  [string]

				Destination settings
				      --r2-bucket             Destination R2 bucket name  [string] [required]
				      --r2-access-key-id      R2 service Access Key ID for authentication. Leave empty for OAuth confirmation.  [string]
				      --r2-secret-access-key  R2 service Secret Access Key for authentication. Leave empty for OAuth confirmation.  [string]
				      --r2-prefix             Prefix for storing files in the destination bucket  [string] [default: \\"\\"]
				      --compression           Compression format for output files  [string] [choices: \\"none\\", \\"gzip\\", \\"deflate\\"] [default: \\"gzip\\"]
				      --file-template         Template for individual file names (must include \${slug})  [string]
				      --partition-template    Path template for partitioned files in the bucket. If not specified, the default will be used  [string]

				GLOBAL FLAGS
				  -c, --config   Path to Wrangler configuration file  [string]
				  -e, --env      Environment to use for operations, and for selecting .env and .dev.vars files  [string]
				  -h, --help     Show help  [boolean]
				  -v, --version  Show version number  [boolean]"
			`);
		});

		it("should create a pipeline with explicit credentials", async () => {
			const requests = mockCreateRequest("my-pipeline");
			await runWrangler(
				"pipelines create my-pipeline --r2-bucket test-bucket --r2-access-key-id my-key --r2-secret-access-key my-secret"
			);
			expect(requests.count).toEqual(1);
			expect(std.out).toMatchInlineSnapshot(`
				"🌀 Creating Pipeline named \\"my-pipeline\\"
				✅ Successfully created Pipeline \\"my-pipeline\\" with id 0001
				🎉 You can now send data to your Pipeline!

				To start interacting with this Pipeline from a Worker, open your Worker’s config file and add the following binding configuration:

				{
				  \\"pipelines\\": [
				    {
				      \\"pipeline\\": \\"my-pipeline\\",
				      \\"binding\\": \\"PIPELINE\\"
				    }
				  ]
				}

				Send data to your Pipeline's HTTP endpoint:

					curl \\"foo\\" -d '[{\\"foo\\": \\"bar\\"}]'
				"
			`);
		});

		it("should fail a missing bucket", async () => {
			const requests = mockCreateR2TokenFailure("bad-bucket");
			await expect(
				runWrangler("pipelines create bad-pipeline --r2-bucket bad-bucket")
			).rejects.toThrowError();

			await endEventLoop();

			expect(normalizeOutput(std.err)).toMatchInlineSnapshot(`
				"X [ERROR] The R2 bucket [bad-bucket] doesn't exist"
			`);
			expect(std.out).toMatchInlineSnapshot(`""`);
			expect(requests.count).toEqual(1);
		});

		it("should create a pipeline with auth", async () => {
			const requests = mockCreateRequest("my-pipeline");
			await runWrangler(
				"pipelines create my-pipeline --require-http-auth --r2-bucket test-bucket --r2-access-key-id my-key --r2-secret-access-key my-secret"
			);
			expect(requests.count).toEqual(1);

			// contain http source and include auth
			expect(requests.body?.source[1].type).toEqual("http");
			expect((requests.body?.source[1] as HttpSource).authentication).toEqual(
				true
			);
		});

		it("should create a pipeline without http", async () => {
			const requests = mockCreateRequest("my-pipeline");
			await runWrangler(
				"pipelines create my-pipeline --enable-http=false --r2-bucket test-bucket --r2-access-key-id my-key --r2-secret-access-key my-secret"
			);
			expect(requests.count).toEqual(1);

			// only contains binding source
			expect(requests.body?.source.length).toEqual(1);
			expect(requests.body?.source[0].type).toEqual("binding");
		});
	});

	it("list - should list pipelines", async () => {
		const requests = mockListRequest([
			{
				name: "foo",
				id: "0001",
				endpoint: "https://0001.pipelines.cloudflarestorage.com",
			},
		]);
		await runWrangler("pipelines list");

		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"┌──────┬──────┬──────────────────────────────────────────────┐
			│ name │ id   │ endpoint                                     │
			├──────┼──────┼──────────────────────────────────────────────┤
			│ foo  │ 0001 │ https://0001.pipelines.cloudflarestorage.com │
			└──────┴──────┴──────────────────────────────────────────────┘"
		`);
		expect(requests.count).toEqual(1);
	});

	describe("show", () => {
		it("should show pipeline", async () => {
			const requests = mockShowRequest("foo", samplePipeline);
			await runWrangler("pipelines show foo");

			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.out).toMatchInlineSnapshot(`
				"Retrieving config for Pipeline \\"foo\\".
				{
				  \\"id\\": \\"0001\\",
				  \\"version\\": 1,
				  \\"name\\": \\"my-pipeline\\",
				  \\"metadata\\": {},
				  \\"source\\": [
				    {
				      \\"type\\": \\"binding\\",
				      \\"format\\": \\"json\\"
				    },
				    {
				      \\"type\\": \\"http\\",
				      \\"format\\": \\"json\\",
				      \\"authentication\\": false
				    }
				  ],
				  \\"transforms\\": [],
				  \\"destination\\": {
				    \\"type\\": \\"r2\\",
				    \\"format\\": \\"json\\",
				    \\"batch\\": {},
				    \\"compression\\": {
				      \\"type\\": \\"none\\"
				    },
				    \\"path\\": {
				      \\"bucket\\": \\"bucket\\"
				    }
				  },
				  \\"endpoint\\": \\"https://0001.pipelines.cloudflarestorage.com\\"
				}"
			`);
			expect(requests.count).toEqual(1);
		});

		it("should fail on missing pipeline", async () => {
			const requests = mockShowRequest("bad-pipeline", null, 404, {
				code: 1000,
				message: "Pipeline does not exist",
			});
			await expect(
				runWrangler("pipelines show bad-pipeline")
			).rejects.toThrowError();

			await endEventLoop();

			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(normalizeOutput(std.out)).toMatchInlineSnapshot(`
				"Retrieving config for Pipeline \\"bad-pipeline\\".
				X [ERROR] A request to the Cloudflare API (/accounts/some-account-id/pipelines/bad-pipeline) failed.
				  Pipeline does not exist [code: 1000]
				  If you think this is a bug, please open an issue at:
				  https://github.com/cloudflare/workers-sdk/issues/new/choose"
			`);
			expect(requests.count).toEqual(1);
		});
	});

	describe("update", () => {
		it("should update a pipeline", async () => {
			const pipeline: Pipeline = samplePipeline;
			mockShowRequest(pipeline.name, pipeline);

			const update = JSON.parse(JSON.stringify(pipeline));
			update.destination.compression.type = "gzip";
			const updateReq = mockUpdateRequest(update.name, update);

			await runWrangler("pipelines update my-pipeline --compression gzip");
			expect(updateReq.count).toEqual(1);
		});

		it("should update a pipeline with new bucket", async () => {
			const pipeline: Pipeline = samplePipeline;
			mockShowRequest(pipeline.name, pipeline);

			const update = JSON.parse(JSON.stringify(pipeline));
			update.destination.path.bucket = "new_bucket";
			update.destination.credentials = {
				endpoint: "https://some-account-id.r2.cloudflarestorage.com",
				access_key_id: "service-token-id",
				secret_access_key: "my-secret-access-key",
			};
			const updateReq = mockUpdateRequest(update.name, update);

			await runWrangler(
				"pipelines update my-pipeline --r2-bucket new-bucket --r2-access-key-id service-token-id --r2-secret-access-key my-secret-access-key"
			);

			expect(updateReq.count).toEqual(1);
		});

		it("should update a pipeline with new credential", async () => {
			const pipeline: Pipeline = samplePipeline;
			mockShowRequest(pipeline.name, pipeline);

			const update = JSON.parse(JSON.stringify(pipeline));
			update.destination.path.bucket = "new-bucket";
			update.destination.credentials = {
				endpoint: "https://some-account-id.r2.cloudflarestorage.com",
				access_key_id: "new-key",
				secret_access_key: "new-secret",
			};
			const updateReq = mockUpdateRequest(update.name, update);

			await runWrangler(
				"pipelines update my-pipeline --r2-bucket new-bucket --r2-access-key-id new-key --r2-secret-access-key new-secret"
			);

			expect(updateReq.count).toEqual(1);
		});

		it("should update a pipeline with source changes http auth", async () => {
			const pipeline: Pipeline = samplePipeline;
			mockShowRequest(pipeline.name, pipeline);

			const update = JSON.parse(JSON.stringify(pipeline));
			update.source = [
				{
					type: "http",
					format: "json",
					authenticated: true,
				},
			];
			const updateReq = mockUpdateRequest(update.name, update);

			await runWrangler(
				"pipelines update my-pipeline --enable-worker-binding=false --enable-http --require-http-auth"
			);

			expect(updateReq.count).toEqual(1);
			expect(updateReq.body?.source.length).toEqual(1);
			expect(updateReq.body?.source[0].type).toEqual("http");
			expect((updateReq.body?.source[0] as HttpSource).authentication).toEqual(
				true
			);
		});

		it("should update a pipeline cors headers", async () => {
			const pipeline: Pipeline = samplePipeline;
			mockShowRequest(pipeline.name, pipeline);

			const update = JSON.parse(JSON.stringify(pipeline));
			update.source = [
				{
					type: "http",
					format: "json",
					authenticated: true,
				},
			];
			const updateReq = mockUpdateRequest(update.name, update);

			await runWrangler(
				"pipelines update my-pipeline --enable-worker-binding=false --enable-http --cors-origins http://localhost:8787"
			);

			expect(updateReq.count).toEqual(1);
			expect(updateReq.body?.source.length).toEqual(1);
			expect(updateReq.body?.source[0].type).toEqual("http");
			expect((updateReq.body?.source[0] as HttpSource).cors?.origins).toEqual([
				"http://localhost:8787",
			]);
		});

		it("should fail a missing pipeline", async () => {
			const requests = mockShowRequest("bad-pipeline", null, 404, {
				code: 1000,
				message: "Pipeline does not exist",
			});
			await expect(
				runWrangler(
					"pipelines update bad-pipeline --r2-bucket new-bucket --r2-access-key-id new-key --r2-secret-access-key new-secret"
				)
			).rejects.toThrowError();

			await endEventLoop();

			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(normalizeOutput(std.out)).toMatchInlineSnapshot(`
				"X [ERROR] A request to the Cloudflare API (/accounts/some-account-id/pipelines/bad-pipeline) failed.
				  Pipeline does not exist [code: 1000]
				  If you think this is a bug, please open an issue at:
				  https://github.com/cloudflare/workers-sdk/issues/new/choose"
			`);
			expect(requests.count).toEqual(1);
		});
	});

	describe("delete", () => {
		it("should delete pipeline", async () => {
			const requests = mockDeleteRequest("foo");
			await runWrangler("pipelines delete foo");

			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.out).toMatchInlineSnapshot(`
				"Deleting Pipeline foo.
				Deleted Pipeline foo."
			`);
			expect(requests.count).toEqual(1);
		});

		it("should fail a missing pipeline", async () => {
			const requests = mockDeleteRequest("bad-pipeline", 404, {
				code: 1000,
				message: "Pipeline does not exist",
			});
			await expect(
				runWrangler("pipelines delete bad-pipeline")
			).rejects.toThrowError();

			await endEventLoop();

			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(normalizeOutput(std.out)).toMatchInlineSnapshot(`
				"Deleting Pipeline bad-pipeline.
				X [ERROR] A request to the Cloudflare API (/accounts/some-account-id/pipelines/bad-pipeline) failed.
				  Pipeline does not exist [code: 1000]
				  If you think this is a bug, please open an issue at:
				  https://github.com/cloudflare/workers-sdk/issues/new/choose"
			`);
			expect(requests.count).toEqual(1);
		});
	});
});
