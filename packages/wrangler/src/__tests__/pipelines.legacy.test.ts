import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { normalizeOutput } from "../../e2e/helpers/normalize";
import { __testSkipDelays } from "../pipelines";
import { endEventLoop } from "./helpers/end-event-loop";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { mockConfirm } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import { msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type {
	HttpSource,
	Pipeline,
	PipelineEntry,
} from "../pipelines/legacy-client";

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
			  wrangler pipelines setup              Interactive setup for a complete pipeline [open-beta]
			  wrangler pipelines create <pipeline>  Create a new pipeline [open-beta]
			  wrangler pipelines list               List all pipelines [open-beta]
			  wrangler pipelines get <pipeline>     Get details about a specific pipeline [open-beta]
			  wrangler pipelines update <pipeline>  Update a pipeline (legacy pipelines only) [open-beta]
			  wrangler pipelines delete <pipeline>  Delete a pipeline [open-beta]
			  wrangler pipelines streams            Manage streams for pipelines [open-beta]
			  wrangler pipelines sinks              Manage sinks for pipelines [open-beta]

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
		it("should fail to create a legacy pipeline", async () => {
			await expect(
				runWrangler("pipelines create legacy-pipeline --legacy")
			).rejects.toThrowError();

			expect(normalizeOutput(std.err)).toMatchInlineSnapshot(`
				"X [ERROR] Creating legacy pipelines is not supported. Please use the v1 Pipelines API without the --legacy flag."
			`);
			expect(std.out).toMatchInlineSnapshot(`""`);
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
		await runWrangler("pipelines list --legacy");

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
			await runWrangler("pipelines get foo --legacy");

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
			await runWrangler("pipelines get foo --format=json --legacy");

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
				runWrangler("pipelines get bad-pipeline --legacy")
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

			await runWrangler(
				"pipelines update my-pipeline --compression gzip --legacy"
			);
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
				"pipelines update my-pipeline --r2-bucket new-bucket --r2-access-key-id service-token-id --r2-secret-access-key my-secret-access-key --legacy"
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
				"pipelines update my-pipeline --r2-bucket new-bucket --r2-access-key-id new-key --r2-secret-access-key new-secret --legacy"
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
				"pipelines update my-pipeline --source http --require-http-auth --legacy"
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
				"pipelines update my-pipeline --cors-origins http://localhost:8787 --legacy"
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
				"pipelines update my-pipeline --cors-origins http://localhost:8787 --legacy"
			);

			expect(updateReq.count).toEqual(1);
			expect(updateReq.body?.source.length).toEqual(2);
			expect(updateReq.body?.source[1].type).toEqual("http");
			expect((updateReq.body?.source[1] as HttpSource).cors?.origins).toEqual([
				"http://localhost:8787",
			]);

			mockGetRequest(pipeline.name, pipeline);
			const secondUpdateReq = mockUpdateRequest(update.name, update);
			await runWrangler(
				"pipelines update my-pipeline --cors-origins none --legacy"
			);
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
					"pipelines update bad-pipeline --r2-bucket new-bucket --r2-access-key-id new-key --r2-secret-access-key new-secret --legacy"
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
		const { setIsTTY } = useMockIsTTY();
		it("should delete pipeline", async () => {
			const requests = mockDeleteRequest("foo");

			setIsTTY(true);
			mockConfirm({
				text: "Are you sure you want to delete the pipeline 'foo'?",
				result: true,
			});
			await runWrangler("pipelines delete foo --legacy");

			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.out).toMatchInlineSnapshot(`
				"✨ Successfully deleted pipeline 'foo'."
			`);
			expect(requests.count).toEqual(1);
		});

		it("should fail a missing pipeline", async () => {
			const requests = mockDeleteRequest("bad-pipeline", 404, {
				code: 1000,
				message: "Pipeline does not exist",
			});
			setIsTTY(true);
			mockConfirm({
				text: "Are you sure you want to delete the pipeline 'bad-pipeline'?",
				result: true,
			});

			await expect(
				runWrangler("pipelines delete bad-pipeline --legacy")
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
});
