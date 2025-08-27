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
				cors: {
					origins: ["*"],
				},
			},
		],
		transforms: [],
		destination: {
			type: "r2",
			format: "json",
			batch: {
				max_bytes: 100000000,
				max_duration_s: 300,
				max_rows: 100000,
			},
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

					// API will set defaults if not provided
					if (!pipeline.destination.batch.max_rows) {
						pipeline.destination.batch.max_rows = 10_000_000;
					}
					if (!pipeline.destination.batch.max_bytes) {
						pipeline.destination.batch.max_bytes = 100_000_000;
					}
					if (!pipeline.destination.batch.max_duration_s) {
						pipeline.destination.batch.max_duration_s = 300;
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

	function mockGetRequest(
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

			🚰 Manage Cloudflare Pipelines [open-beta]

			COMMANDS
			  wrangler pipelines create <pipeline>  Create a new pipeline [open-beta]
			  wrangler pipelines list               List all pipelines [open-beta]
			  wrangler pipelines get <pipeline>     Get a pipeline's configuration [open-beta]
			  wrangler pipelines update <pipeline>  Update a pipeline [open-beta]
			  wrangler pipelines delete <pipeline>  Delete a pipeline [open-beta]

			GLOBAL FLAGS
			  -c, --config    Path to Wrangler configuration file  [string]
			      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help      Show help  [boolean]
			  -v, --version   Show version number  [boolean]"
		`);
	});

	describe("create", () => {
		it("should show usage details", async () => {
			await runWrangler("pipelines create -h");
			await endEventLoop();

			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.out).toMatchInlineSnapshot(`
				"wrangler pipelines create <pipeline>

				Create a new pipeline [open-beta]

				Source settings
				      --source             Space separated list of allowed sources. Options are 'http' or 'worker'  [array] [default: [\\"http\\",\\"worker\\"]]
				      --require-http-auth  Require Cloudflare API Token for HTTPS endpoint authentication  [boolean] [default: false]
				      --cors-origins       CORS origin allowlist for HTTP endpoint (use * for any origin). Defaults to an empty array  [array]

				Batch hints
				      --batch-max-mb       Maximum batch size in megabytes before flushing. Defaults to 100 MB if unset. Minimum: 1, Maximum: 100  [number]
				      --batch-max-rows     Maximum number of rows per batch before flushing. Defaults to 10,000,000 if unset. Minimum: 100, Maximum: 10,000,000  [number]
				      --batch-max-seconds  Maximum age of batch in seconds before flushing. Defaults to 300 if unset. Minimum: 1, Maximum: 300  [number]

				Destination settings
				      --r2-bucket             Destination R2 bucket name  [string] [required]
				      --r2-access-key-id      R2 service Access Key ID for authentication. Leave empty for OAuth confirmation.  [string]
				      --r2-secret-access-key  R2 service Secret Access Key for authentication. Leave empty for OAuth confirmation.  [string]
				      --r2-prefix             Prefix for storing files in the destination bucket. Default is no prefix  [string] [default: \\"\\"]
				      --compression           Compression format for output files  [string] [choices: \\"none\\", \\"gzip\\", \\"deflate\\"] [default: \\"gzip\\"]

				Pipeline settings
				      --shard-count  Number of shards for the pipeline. More shards handle higher request volume; fewer shards produce larger output files. Defaults to 2 if unset. Minimum: 1, Maximum: 15  [number]

				POSITIONALS
				  pipeline  The name of the new pipeline  [string] [required]

				GLOBAL FLAGS
				  -c, --config    Path to Wrangler configuration file  [string]
				      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
				  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
				      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
				  -h, --help      Show help  [boolean]
				  -v, --version   Show version number  [boolean]"
			`);
		});

		it("should create a pipeline with explicit credentials", async () => {
			const requests = mockCreateRequest("my-pipeline");
			await runWrangler(
				"pipelines create my-pipeline --r2-bucket test-bucket --r2-access-key-id my-key --r2-secret-access-key my-secret"
			);
			expect(requests.count).toEqual(1);
			expect(std.out).toMatchInlineSnapshot(`
				"🌀 Creating pipeline named \\"my-pipeline\\"
				✅ Successfully created pipeline \\"my-pipeline\\" with ID 0001

				Id:    0001
				Name:  my-pipeline
				Sources:
				  HTTP:
				    Endpoint:        foo
				    Authentication:  off
				    Format:          JSON
				  Worker:
				    Format:  JSON
				Destination:
				  Type:         R2
				  Bucket:       test-bucket
				  Format:       newline-delimited JSON
				  Compression:  GZIP
				  Batch hints:
				    Max bytes:     100 MB
				    Max duration:  300 seconds
				    Max records:   10,000,000

				🎉 You can now send data to your pipeline!
				To access your new Pipeline in your Worker, add the following snippet to your configuration file:
				{
				  \\"pipelines\\": [
				    {
				      \\"pipeline\\": \\"my-pipeline\\",
				      \\"binding\\": \\"PIPELINE\\"
				    }
				  ]
				}

				Send data to your pipeline's HTTP endpoint:

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
			expect(requests.body?.source[0].type).toEqual("http");
			expect((requests.body?.source[0] as HttpSource).authentication).toEqual(
				true
			);
		});

		it("should create a pipeline without http", async () => {
			const requests = mockCreateRequest("my-pipeline");
			await runWrangler(
				"pipelines create my-pipeline --source worker --r2-bucket test-bucket --r2-access-key-id my-key --r2-secret-access-key my-secret"
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
			"┌─┬─┬─┐
			│ name │ id │ endpoint │
			├─┼─┼─┤
			│ foo │ 0001 │ https://0001.pipelines.cloudflarestorage.com │
			└─┴─┴─┘"
		`);
		expect(requests.count).toEqual(1);
	});

	describe("get", () => {
		it("should get pipeline pretty", async () => {
			const requests = mockGetRequest("foo", samplePipeline);
			await runWrangler("pipelines get foo");

			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.out).toMatchInlineSnapshot(`
				"Id:    0001
				Name:  my-pipeline
				Sources:
				  HTTP:
				    Endpoint:        https://0001.pipelines.cloudflarestorage.com
				    Authentication:  off
				    CORS Origins:    *
				    Format:          JSON
				  Worker:
				    Format:  JSON
				Destination:
				  Type:         R2
				  Bucket:       bucket
				  Format:       newline-delimited JSON
				  Compression:  NONE
				  Batch hints:
				    Max bytes:     100 MB
				    Max duration:  300 seconds
				    Max records:   100,000
				"
			`);
			expect(requests.count).toEqual(1);
		});

		it("should get pipeline json", async () => {
			const requests = mockGetRequest("foo", samplePipeline);
			await runWrangler("pipelines get foo --format=json");

			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.out).toMatchInlineSnapshot(`
				"{
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
				      \\"authentication\\": false,
				      \\"cors\\": {
				        \\"origins\\": [
				          \\"*\\"
				        ]
				      }
				    }
				  ],
				  \\"transforms\\": [],
				  \\"destination\\": {
				    \\"type\\": \\"r2\\",
				    \\"format\\": \\"json\\",
				    \\"batch\\": {
				      \\"max_bytes\\": 100000000,
				      \\"max_duration_s\\": 300,
				      \\"max_rows\\": 100000
				    },
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
			const requests = mockGetRequest("bad-pipeline", null, 404, {
				code: 1000,
				message: "Pipeline does not exist",
			});
			await expect(
				runWrangler("pipelines get bad-pipeline")
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

	describe("update", () => {
		it("should update a pipeline", async () => {
			const pipeline: Pipeline = samplePipeline;
			mockGetRequest(pipeline.name, pipeline);

			const update = JSON.parse(JSON.stringify(pipeline));
			update.destination.compression.type = "gzip";
			const updateReq = mockUpdateRequest(update.name, update);

			await runWrangler("pipelines update my-pipeline --compression gzip");
			expect(updateReq.count).toEqual(1);
		});

		it("should update a pipeline with new bucket", async () => {
			const pipeline: Pipeline = samplePipeline;
			mockGetRequest(pipeline.name, pipeline);

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
			mockGetRequest(pipeline.name, pipeline);

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
			mockGetRequest(pipeline.name, pipeline);

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
				"pipelines update my-pipeline --source http --require-http-auth"
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
			mockGetRequest(pipeline.name, pipeline);

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
				"pipelines update my-pipeline --cors-origins http://localhost:8787"
			);

			expect(updateReq.count).toEqual(1);
			expect(updateReq.body?.source.length).toEqual(2);
			expect(updateReq.body?.source[1].type).toEqual("http");
			expect((updateReq.body?.source[1] as HttpSource).cors?.origins).toEqual([
				"http://localhost:8787",
			]);
		});

		it("should update remove cors headers", async () => {
			const pipeline: Pipeline = samplePipeline;
			mockGetRequest(pipeline.name, pipeline);

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
				"pipelines update my-pipeline --cors-origins http://localhost:8787"
			);

			expect(updateReq.count).toEqual(1);
			expect(updateReq.body?.source.length).toEqual(2);
			expect(updateReq.body?.source[1].type).toEqual("http");
			expect((updateReq.body?.source[1] as HttpSource).cors?.origins).toEqual([
				"http://localhost:8787",
			]);

			mockGetRequest(pipeline.name, pipeline);
			const secondUpdateReq = mockUpdateRequest(update.name, update);
			await runWrangler("pipelines update my-pipeline --cors-origins none");
			expect(secondUpdateReq.count).toEqual(1);
			expect(secondUpdateReq.body?.source.length).toEqual(2);
			expect(secondUpdateReq.body?.source[1].type).toEqual("http");
			expect(
				(secondUpdateReq.body?.source[1] as HttpSource).cors?.origins
			).toEqual([]);
		});

		it("should fail a missing pipeline", async () => {
			const requests = mockGetRequest("bad-pipeline", null, 404, {
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

		it("should remove transformations", async () => {
			const pipeline: Pipeline = samplePipeline;
			mockGetRequest(pipeline.name, pipeline);

			const update = JSON.parse(JSON.stringify(pipeline));
			update.transforms = [
				{
					script: "hello",
					entrypoint: "MyTransform",
				},
			];
			const updateReq = mockUpdateRequest(update.name, update);

			await runWrangler("pipelines update my-pipeline --transform-worker none");

			expect(updateReq.count).toEqual(1);
			expect(updateReq.body?.transforms.length).toEqual(0);
		});
	});

	describe("delete", () => {
		it("should delete pipeline", async () => {
			const requests = mockDeleteRequest("foo");
			await runWrangler("pipelines delete foo");

			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.out).toMatchInlineSnapshot(`
				"Deleting pipeline foo.
				Deleted pipeline foo."
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
				"Deleting pipeline bad-pipeline.
				X [ERROR] A request to the Cloudflare API (/accounts/some-account-id/pipelines/bad-pipeline) failed.
				  Pipeline does not exist [code: 1000]
				  If you think this is a bug, please open an issue at:
				  https://github.com/cloudflare/workers-sdk/issues/new/choose"
			`);
			expect(requests.count).toEqual(1);
		});
	});
});
