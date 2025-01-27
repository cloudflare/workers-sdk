import { http, HttpResponse } from "msw";
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
			  wrangler pipelines create <pipeline>  Create a new pipeline
			  wrangler pipelines list               List current pipelines
			  wrangler pipelines show <pipeline>    Show a pipeline configuration
			  wrangler pipelines update <pipeline>  Update a pipeline
			  wrangler pipelines delete <pipeline>  Delete a pipeline

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

				Create a new pipeline

				POSITIONALS
				  pipeline  The name of the new pipeline  [string] [required]

				GLOBAL FLAGS
				  -c, --config   Path to Wrangler configuration file  [string]
				  -e, --env      Environment to use for operations, and for selecting .env and .dev.vars files  [string]
				  -h, --help     Show help  [boolean]
				  -v, --version  Show version number  [boolean]

				OPTIONS
				      --secret-access-key  The R2 service token Access Key to write data  [string]
				      --access-key-id      The R2 service token Secret Key to write data  [string]
				      --batch-max-mb       The approximate maximum size (in megabytes) for each batch before flushing (range: 1 - 100)  [number]
				      --batch-max-rows     The approximate maximum number of rows in a batch before flushing (range: 100 - 1000000)  [number]
				      --batch-max-seconds  The approximate maximum age (in seconds) of a batch before flushing (range: 1 - 300)  [number]
				      --transform          The worker and entrypoint of the PipelineTransform implementation in the format \\"worker.entrypoint\\"
				                           Default: No transformation worker  [string]
				      --compression        Sets the compression format of output files
				                           Default: gzip  [string] [choices: \\"none\\", \\"gzip\\", \\"deflate\\"]
				      --prefix             Optional base path to store files in the destination bucket
				                           Default: (none)  [string]
				      --filepath           The path to store partitioned files in the destination bucket
				                           Default: event_date=\${date}/hr=\${hr}  [string]
				      --filename           The name of each unique file in the bucket. Must contain \\"\${slug}\\". File extension is optional
				                           Default: \${slug}\${extension}  [string]
				      --binding            Enable Worker binding to this pipeline  [boolean] [default: true]
				      --http               Enable HTTPS endpoint to send data to this pipeline  [boolean] [default: true]
				      --authentication     Require authentication (Cloudflare API Token) to send data to the HTTPS endpoint  [boolean] [default: false]
				      --r2                 Destination R2 bucket name  [string] [required]"
			`);
		});

		it("should create a pipeline with explicit credentials", async () => {
			const requests = mockCreateRequest("my-pipeline");
			await runWrangler(
				"pipelines create my-pipeline --r2 test-bucket --access-key-id my-key --secret-access-key my-secret"
			);
			expect(requests.count).toEqual(1);
		});

		it("should fail a missing bucket", async () => {
			const requests = mockCreateR2TokenFailure("bad-bucket");
			await expect(
				runWrangler("pipelines create bad-pipeline --r2 bad-bucket")
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
				"pipelines create my-pipeline --authentication --r2 test-bucket --access-key-id my-key --secret-access-key my-secret"
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
				"pipelines create my-pipeline --http=false --r2 test-bucket --access-key-id my-key --secret-access-key my-secret"
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
				"Retrieving config for pipeline \\"foo\\".
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
				"Retrieving config for pipeline \\"bad-pipeline\\".
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
				"pipelines update my-pipeline --r2 new-bucket --access-key-id service-token-id --secret-access-key my-secret-access-key"
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
				"pipelines update my-pipeline --r2 new-bucket --access-key-id new-key --secret-access-key new-secret"
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
				"pipelines update my-pipeline --binding=false --http --authentication"
			);

			expect(updateReq.count).toEqual(1);
			expect(updateReq.body?.source.length).toEqual(1);
			expect(updateReq.body?.source[0].type).toEqual("http");
			expect((updateReq.body?.source[0] as HttpSource).authentication).toEqual(
				true
			);
		});

		it("should fail a missing pipeline", async () => {
			const requests = mockShowRequest("bad-pipeline", null, 404, {
				code: 1000,
				message: "Pipeline does not exist",
			});
			await expect(
				runWrangler(
					"pipelines update bad-pipeline --r2 new-bucket --access-key-id new-key --secret-access-key new-secret"
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
