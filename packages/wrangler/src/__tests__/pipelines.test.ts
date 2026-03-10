import { writeFileSync } from "node:fs";
import { http, HttpResponse } from "msw";
/* eslint-disable workers-sdk/no-vitest-import-expect -- large file >500 lines */
import { describe, expect, it } from "vitest";
/* eslint-enable workers-sdk/no-vitest-import-expect */
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { mockConfirm } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import { msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type { Pipeline, SchemaField, Sink, Stream } from "../pipelines/types";

describe("wrangler pipelines", () => {
	const std = mockConsoleMethods();
	mockAccountId();
	mockApiToken();
	runInTempDir();

	const accountId = "some-account-id";

	function mockValidateSqlRequest(sql: string, isValid = true) {
		const requests = { count: 0 };
		msw.use(
			http.post(
				`*/accounts/${accountId}/pipelines/v1/validate_sql`,
				async ({ request }) => {
					requests.count++;
					const body = (await request.json()) as { sql: string };
					expect(body.sql).toBe(sql);

					if (!isValid) {
						const error = {
							notes: [{ text: "Invalid SQL syntax near 'INVALID'" }],
						};
						throw error;
					}

					return HttpResponse.json({
						success: true,
						errors: [],
						messages: [],
						result: {
							tables: {
								test_stream: { type: "stream" },
								test_sink: { type: "sink" },
							},
						},
					});
				},
				{ once: true }
			)
		);
		return requests;
	}

	function mockCreatePipelineRequest(expectedRequest: {
		name: string;
		sql: string;
	}) {
		const requests = { count: 0 };
		msw.use(
			http.post(
				`*/accounts/${accountId}/pipelines/v1/pipelines`,
				async ({ request }) => {
					requests.count++;
					const body = (await request.json()) as { name: string; sql: string };
					expect(body.name).toBe(expectedRequest.name);
					expect(body.sql).toBe(expectedRequest.sql);
					return HttpResponse.json({
						success: true,
						errors: [],
						messages: [],
						result: {
							id: "pipeline_123",
							name: expectedRequest.name,
							sql: expectedRequest.sql,
							status: "active",
							created_at: "2024-01-01T00:00:00Z",
							modified_at: "2024-01-01T00:00:00Z",
							tables: [
								{
									id: "stream_456",
									name: "test_stream",
									type: "stream",
									version: 1,
									latest: 1,
									href: "/accounts/some-account-id/pipelines/v1/streams/stream_456",
								},
								{
									id: "sink_789",
									name: "test_sink",
									type: "sink",
									version: 1,
									latest: 1,
									href: "/accounts/some-account-id/pipelines/v1/sinks/sink_789",
								},
							],
						},
					});
				},
				{ once: true }
			)
		);
		return requests;
	}

	function mockGetPipelineRequest(pipelineId: string, pipeline: Pipeline) {
		const requests = { count: 0 };
		msw.use(
			http.get(
				`*/accounts/${accountId}/pipelines/v1/pipelines/${pipelineId}`,
				() => {
					requests.count++;
					return HttpResponse.json({
						success: true,
						errors: [],
						messages: [],
						result: pipeline,
					});
				},
				{ once: true }
			)
		);
		return requests;
	}

	function mockGetStreamRequest(streamId: string, stream: Stream) {
		const requests = { count: 0 };
		msw.use(
			http.get(
				`*/accounts/${accountId}/pipelines/v1/streams/${streamId}`,
				() => {
					requests.count++;
					return HttpResponse.json({
						success: true,
						errors: [],
						messages: [],
						result: stream,
					});
				},
				{ once: true }
			)
		);
		return requests;
	}

	function mockListPipelinesRequest(pipelines: Pipeline[]) {
		const requests = { count: 0 };
		msw.use(
			http.get(
				`*/accounts/${accountId}/pipelines/v1/pipelines`,
				({ request }) => {
					requests.count++;
					const url = new URL(request.url);
					const page = Number(url.searchParams.get("page") || 1);
					const perPage = Number(url.searchParams.get("per_page") || 20);

					return HttpResponse.json({
						success: true,
						errors: [],
						messages: [],
						result: pipelines,
						result_info: {
							page,
							per_page: perPage,
							count: pipelines.length,
							total_count: pipelines.length,
						},
					});
				},
				{ once: true }
			)
		);
		return requests;
	}

	function mockDeletePipelineRequest(pipelineId: string) {
		const requests = { count: 0 };
		msw.use(
			http.delete(
				`*/accounts/${accountId}/pipelines/v1/pipelines/${pipelineId}`,
				() => {
					requests.count++;
					return HttpResponse.json({
						success: true,
						errors: [],
						messages: [],
						result: null,
					});
				},
				{ once: true }
			)
		);
		return requests;
	}

	describe("pipelines create", () => {
		it("should error when neither --sql nor --sql-file is provided", async () => {
			await expect(
				runWrangler("pipelines create my_pipeline")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Either --sql or --sql-file must be provided]`
			);
		});

		it("should create pipeline with inline SQL", async () => {
			const sql = "INSERT INTO test_sink SELECT * FROM test_stream;";
			const validateRequest = mockValidateSqlRequest(sql);
			const createRequest = mockCreatePipelineRequest({
				name: "my_pipeline",
				sql,
			});
			const getPipelineRequest = mockGetPipelineRequest("pipeline_123", {
				id: "pipeline_123",
				name: "my_pipeline",
				sql,
				status: "active",
				created_at: "2024-01-01T00:00:00Z",
				modified_at: "2024-01-01T00:00:00Z",
				tables: [
					{
						id: "stream_456",
						name: "test_stream",
						type: "stream",
						version: 1,
						latest: 1,
						href: "/accounts/some-account-id/pipelines/v1/streams/stream_456",
					},
					{
						id: "sink_789",
						name: "test_sink",
						type: "sink",
						version: 1,
						latest: 1,
						href: "/accounts/some-account-id/pipelines/v1/sinks/sink_789",
					},
				],
			});
			const getStreamRequest = mockGetStreamRequest("stream_456", {
				id: "stream_456",
				name: "test_stream",
				version: 1,
				endpoint: "https://pipelines.cloudflare.com/stream_456",
				format: { type: "json", unstructured: true },
				schema: null,
				http: {
					enabled: true,
					authentication: false,
				},
				worker_binding: { enabled: true },
				created_at: "2024-01-01T00:00:00Z",
				modified_at: "2024-01-01T00:00:00Z",
			});

			await runWrangler(`pipelines create my_pipeline --sql "${sql}"`);

			expect(validateRequest.count).toBe(1);
			expect(createRequest.count).toBe(1);
			expect(getPipelineRequest.count).toBe(1);
			expect(getStreamRequest.count).toBe(1);

			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.out).toContain("🌀 Validating SQL...");
			expect(std.out).toContain(
				"✅ SQL validated successfully. References tables: test_stream, test_sink"
			);
			expect(std.out).toContain("🌀 Creating pipeline 'my_pipeline'...");
			expect(std.out).toContain(
				"✨ Successfully created pipeline 'my_pipeline' with id 'pipeline_123'."
			);
			expect(std.out).toContain("Then send events:");
			expect(std.out).toContain("Or via HTTP:");
		});

		it("should create pipeline from SQL file", async () => {
			const sql = "INSERT INTO test_sink SELECT * FROM test_stream;";
			const sqlFile = "pipeline.sql";
			writeFileSync(sqlFile, sql);

			const validateRequest = mockValidateSqlRequest(sql);
			const createRequest = mockCreatePipelineRequest({
				name: "my_pipeline",
				sql,
			});
			const getPipelineRequest = mockGetPipelineRequest("pipeline_123", {
				id: "pipeline_123",
				name: "my_pipeline",
				sql,
				status: "active",
				created_at: "2024-01-01T00:00:00Z",
				modified_at: "2024-01-01T00:00:00Z",
				tables: [
					{
						id: "stream_456",
						name: "test_stream",
						type: "stream",
						version: 1,
						latest: 1,
						href: "/accounts/some-account-id/pipelines/v1/streams/stream_456",
					},
					{
						id: "sink_789",
						name: "test_sink",
						type: "sink",
						version: 1,
						latest: 1,
						href: "/accounts/some-account-id/pipelines/v1/sinks/sink_789",
					},
				],
			});
			const getStreamRequest = mockGetStreamRequest("stream_456", {
				id: "stream_456",
				name: "test_stream",
				version: 1,
				endpoint: "https://pipelines.cloudflare.com/stream_456",
				format: { type: "json", unstructured: true },
				schema: null,
				http: {
					enabled: true,
					authentication: false,
				},
				worker_binding: { enabled: true },
				created_at: "2024-01-01T00:00:00Z",
				modified_at: "2024-01-01T00:00:00Z",
			});

			await runWrangler(`pipelines create my_pipeline --sql-file ${sqlFile}`);

			expect(validateRequest.count).toBe(1);
			expect(createRequest.count).toBe(1);
			expect(getPipelineRequest.count).toBe(1);
			expect(getStreamRequest.count).toBe(1);

			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.out).toContain("🌀 Validating SQL...");
			expect(std.out).toContain("✅ SQL validated successfully.");
			expect(std.out).toContain(
				"✨ Successfully created pipeline 'my_pipeline' with id 'pipeline_123'."
			);
		});

		it("should error when SQL validation fails", async () => {
			const sql = "INVALID SQL QUERY";
			const validateRequest = mockValidateSqlRequest(sql, false);

			await expect(
				runWrangler(`pipelines create my_pipeline --sql "${sql}"`)
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: SQL validation failed: Invalid SQL syntax near 'INVALID']`
			);

			expect(validateRequest.count).toBe(1);
		});

		it("should show wrangler version message on authentication error", async () => {
			const sql = "INSERT INTO test_sink SELECT * FROM test_stream;";
			const validateRequest = mockValidateSqlRequest(sql);

			// Mock create returns auth error (code 10000)
			msw.use(
				http.post(
					`*/accounts/${accountId}/pipelines/v1/pipelines`,
					() => {
						return HttpResponse.json(
							{
								success: false,
								errors: [{ code: 10000, message: "Authentication error" }],
								messages: [],
								result: null,
							},
							{ status: 403 }
						);
					},
					{ once: true }
				)
			);

			await expect(
				runWrangler(`pipelines create my_pipeline --sql "${sql}"`)
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`
				[Error: Your account does not have access to the new Pipelines API. To use the legacy Pipelines API, please run:

				npx wrangler@4.36.0 pipelines create my_pipeline

				This will use an older version of Wrangler that supports the legacy API.]
			`
			);

			expect(validateRequest.count).toBe(1);
		});
	});

	describe("pipelines list", () => {
		it("should list pipelines", async () => {
			const mockPipelines: Pipeline[] = [
				{
					id: "pipeline_1",
					name: "pipeline_one",
					sql: "INSERT INTO sink1 SELECT * FROM stream1;",
					status: "active",
					created_at: "2024-01-01T00:00:00Z",
					modified_at: "2024-01-01T00:00:00Z",
				},
				{
					id: "pipeline_2",
					name: "pipeline_two",
					sql: "INSERT INTO sink2 SELECT * FROM stream2;",
					status: "active",
					created_at: "2024-01-02T00:00:00Z",
					modified_at: "2024-01-02T00:00:00Z",
				},
			];

			const listRequest = mockListPipelinesRequest(mockPipelines);

			await runWrangler("pipelines list");

			expect(listRequest.count).toBe(1);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				┌─┬─┬─┬─┐
				│ Name │ ID │ Created │ Modified │
				├─┼─┼─┼─┤
				│ pipeline_one │ pipeline_1 │ 1/1/2024 │ 1/1/2024 │
				├─┼─┼─┼─┤
				│ pipeline_two │ pipeline_2 │ 1/2/2024 │ 1/2/2024 │
				└─┴─┴─┴─┘"
			`);
		});

		it("should handle empty pipelines list", async () => {
			const listRequest = mockListPipelinesRequest([]);

			await runWrangler("pipelines list");

			expect(listRequest.count).toBe(1);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				No pipelines found."
			`);
		});

		it("should merge new and legacy pipelines with Type column for legacy", async () => {
			const mockNewPipelines: Pipeline[] = [
				{
					id: "pipeline_1",
					name: "new_pipeline",
					sql: "INSERT INTO sink1 SELECT * FROM stream1;",
					status: "active",
					created_at: "2024-01-01T00:00:00Z",
					modified_at: "2024-01-01T00:00:00Z",
				},
			];

			msw.use(
				http.get(
					`*/accounts/${accountId}/pipelines/v1/pipelines`,
					() => {
						return HttpResponse.json({
							success: true,
							errors: [],
							messages: [],
							result: mockNewPipelines,
							result_info: {
								page: 1,
								per_page: 20,
								count: mockNewPipelines.length,
								total_count: mockNewPipelines.length,
							},
						});
					},
					{ once: true }
				)
			);

			const mockLegacyPipelines = [
				{
					id: "legacy_123",
					name: "legacy_pipeline",
					endpoint: "https://pipelines.cloudflare.com/legacy",
				},
			];

			msw.use(
				http.get(
					`*/accounts/${accountId}/pipelines`,
					() => {
						return HttpResponse.json({
							success: true,
							errors: [],
							messages: [],
							result: mockLegacyPipelines,
						});
					},
					{ once: true }
				)
			);

			await runWrangler("pipelines list");

			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1m🚧 \`wrangler pipelines list\` is an open beta command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose[0m


				[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1m⚠️  You have legacy pipelines. Consider creating new pipelines by running 'wrangler pipelines setup'.[0m

				"
			`);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				┌─┬─┬─┬─┬─┐
				│ Name │ ID │ Created │ Modified │ Type │
				├─┼─┼─┼─┼─┤
				│ new_pipeline │ pipeline_1 │ 1/1/2024 │ 1/1/2024 │ │
				├─┼─┼─┼─┼─┤
				│ legacy_pipeline │ legacy_123 │ N/A │ N/A │ Legacy │
				└─┴─┴─┴─┴─┘"
			`);
		});

		it('supports valid json output with "--json" flag', async () => {
			const mockPipelines: Pipeline[] = [
				{
					id: "pipeline_1",
					name: "pipeline_one",
					sql: "INSERT INTO sink1 SELECT * FROM stream1;",
					status: "active",
					created_at: "2024-01-01T00:00:00Z",
					modified_at: "2024-01-01T00:00:00Z",
				},
				{
					id: "pipeline_2",
					name: "pipeline_two",
					sql: "INSERT INTO sink2 SELECT * FROM stream2;",
					status: "active",
					created_at: "2024-01-02T00:00:00Z",
					modified_at: "2024-01-02T00:00:00Z",
				},
			];

			mockListPipelinesRequest(mockPipelines);

			await runWrangler("pipelines list --json");

			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(JSON.parse(std.out)).toMatchInlineSnapshot(`
				[
				  {
				    "created_at": "2024-01-01T00:00:00Z",
				    "id": "pipeline_1",
				    "modified_at": "2024-01-01T00:00:00Z",
				    "name": "pipeline_one",
				    "sql": "INSERT INTO sink1 SELECT * FROM stream1;",
				    "status": "active",
				  },
				  {
				    "created_at": "2024-01-02T00:00:00Z",
				    "id": "pipeline_2",
				    "modified_at": "2024-01-02T00:00:00Z",
				    "name": "pipeline_two",
				    "sql": "INSERT INTO sink2 SELECT * FROM stream2;",
				    "status": "active",
				  },
				]
			`);
		});
	});

	describe("pipelines get", () => {
		it("should error when no pipeline ID provided", async () => {
			await expect(
				runWrangler("pipelines get")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Not enough non-option arguments: got 0, need at least 1]`
			);
		});

		it("should get pipeline details", async () => {
			const mockPipeline: Pipeline = {
				id: "pipeline_123",
				name: "my_pipeline",
				sql: "INSERT INTO test_sink SELECT * FROM test_stream;",
				status: "active",
				created_at: "2024-01-01T00:00:00Z",
				modified_at: "2024-01-01T00:00:00Z",
				tables: [
					{
						id: "stream_456",
						name: "test_stream",
						type: "stream",
						version: 1,
						latest: 1,
						href: "/accounts/some-account-id/pipelines/v1/streams/stream_456",
					},
					{
						id: "sink_789",
						name: "test_sink",
						type: "sink",
						version: 1,
						latest: 1,
						href: "/accounts/some-account-id/pipelines/v1/sinks/sink_789",
					},
				],
			};

			const getRequest = mockGetPipelineRequest("pipeline_123", mockPipeline);

			await runWrangler("pipelines get pipeline_123");

			expect(getRequest.count).toBe(1);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				General:
				  ID:           pipeline_123
				  Name:         my_pipeline
				  Created At:   1/1/2024, 12:00:00 AM
				  Modified At:  1/1/2024, 12:00:00 AM

				Pipeline SQL:
				INSERT INTO test_sink SELECT * FROM test_stream;

				Connected Streams:
				┌─┬─┐
				│ Name │ ID │
				├─┼─┤
				│ test_stream │ stream_456 │
				└─┴─┘

				Connected Sinks:
				┌─┬─┐
				│ Name │ ID │
				├─┼─┤
				│ test_sink │ sink_789 │
				└─┴─┘"
			`);
		});

		it("should fall back to legacy API when pipeline not found in new API", async () => {
			msw.use(
				http.get(
					`*/accounts/${accountId}/pipelines/v1/pipelines/my-legacy-pipeline`,
					() => {
						return HttpResponse.json(
							{
								success: false,
								errors: [{ code: 1000, message: "Pipeline not found" }],
								messages: [],
								result: null,
							},
							{ status: 404 }
						);
					},
					{ once: true }
				)
			);

			const mockLegacyPipeline = {
				id: "legacy_123",
				name: "my-legacy-pipeline",
				endpoint: "https://pipelines.cloudflare.com/legacy",
				source: [{ type: "http", format: "json" }],
				destination: {
					type: "r2",
					format: "json",
					path: { bucket: "my-bucket", prefix: "data/" },
					batch: {
						max_duration_s: 300,
						max_bytes: 100000000,
						max_rows: 10000000,
					},
					compression: { type: "gzip" },
				},
				transforms: [],
				metadata: { shards: 2 },
			};

			msw.use(
				http.get(
					`*/accounts/${accountId}/pipelines/my-legacy-pipeline`,
					() => {
						return HttpResponse.json({
							success: true,
							errors: [],
							messages: [],
							result: mockLegacyPipeline,
						});
					},
					{ once: true }
				)
			);

			await runWrangler("pipelines get my-legacy-pipeline");

			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1m🚧 \`wrangler pipelines get\` is an open beta command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose[0m


				[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1m⚠️  This is a legacy pipeline. Consider creating a new pipeline by running 'wrangler pipelines setup'.[0m

				"
			`);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Id:    legacy_123
				Name:  my-legacy-pipeline
				Sources:
				  HTTP:
				    Endpoint:        https://pipelines.cloudflare.com/legacy
				    Authentication:  off
				    Format:          JSON
				Destination:
				  Type:         R2
				  Bucket:       my-bucket
				  Format:       newline-delimited JSON
				  Prefix:       data/
				  Compression:  GZIP
				  Batch hints:
				    Max bytes:     100 MB
				    Max duration:  300 seconds
				    Max records:   10,000,000
				"
			`);
		});

		it('supports valid json output with "--json" flag', async () => {
			const mockPipeline: Pipeline = {
				id: "pipeline_123",
				name: "my_pipeline",
				sql: "INSERT INTO test_sink SELECT * FROM test_stream;",
				status: "active",
				created_at: "2024-01-01T00:00:00Z",
				modified_at: "2024-01-01T00:00:00Z",
				tables: [
					{
						id: "stream_456",
						name: "test_stream",
						type: "stream",
						version: 1,
						latest: 1,
						href: "/accounts/some-account-id/pipelines/v1/streams/stream_456",
					},
					{
						id: "sink_789",
						name: "test_sink",
						type: "sink",
						version: 1,
						latest: 1,
						href: "/accounts/some-account-id/pipelines/v1/sinks/sink_789",
					},
				],
			};

			mockGetPipelineRequest("pipeline_123", mockPipeline);
			await runWrangler("pipelines get pipeline_123 --json");

			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(JSON.parse(std.out)).toMatchInlineSnapshot(`
				{
				  "created_at": "2024-01-01T00:00:00Z",
				  "id": "pipeline_123",
				  "modified_at": "2024-01-01T00:00:00Z",
				  "name": "my_pipeline",
				  "sql": "INSERT INTO test_sink SELECT * FROM test_stream;",
				  "status": "active",
				  "tables": [
				    {
				      "href": "/accounts/some-account-id/pipelines/v1/streams/stream_456",
				      "id": "stream_456",
				      "latest": 1,
				      "name": "test_stream",
				      "type": "stream",
				      "version": 1,
				    },
				    {
				      "href": "/accounts/some-account-id/pipelines/v1/sinks/sink_789",
				      "id": "sink_789",
				      "latest": 1,
				      "name": "test_sink",
				      "type": "sink",
				      "version": 1,
				    },
				  ],
				}
			`);
		});
	});

	describe("pipelines delete", () => {
		const { setIsTTY } = useMockIsTTY();
		it("should error when no pipeline ID provided", async () => {
			await expect(
				runWrangler("pipelines delete")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Not enough non-option arguments: got 0, need at least 1]`
			);
		});

		it("should prompt for confirmation before delete", async () => {
			const mockPipeline: Pipeline = {
				id: "pipeline_123",
				name: "my_pipeline",
				sql: "INSERT INTO test_sink SELECT * FROM test_stream;",
				status: "active",
				created_at: "2024-01-01T00:00:00Z",
				modified_at: "2024-01-01T00:00:00Z",
			};

			const getRequest = mockGetPipelineRequest("pipeline_123", mockPipeline);
			const deleteRequest = mockDeletePipelineRequest("pipeline_123");

			setIsTTY(true);
			mockConfirm({
				text: "Are you sure you want to delete the pipeline 'my_pipeline' (pipeline_123)?",
				result: true,
			});

			await runWrangler("pipelines delete pipeline_123");

			expect(getRequest.count).toBe(1);
			expect(deleteRequest.count).toBe(1);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				✨ Successfully deleted pipeline 'my_pipeline' with id 'pipeline_123'."
			`);
		});

		it("should fall back to legacy API when deleting pipeline not in new API", async () => {
			msw.use(
				http.get(
					`*/accounts/${accountId}/pipelines/v1/pipelines/my-legacy-pipeline`,
					() => {
						return HttpResponse.json(
							{
								success: false,
								errors: [{ code: 1000, message: "Pipeline not found" }],
								messages: [],
								result: null,
							},
							{ status: 404 }
						);
					},
					{ once: true }
				)
			);

			msw.use(
				http.get(
					`*/accounts/${accountId}/pipelines/my-legacy-pipeline`,
					() => {
						return HttpResponse.json({
							success: true,
							errors: [],
							messages: [],
							result: {
								id: "legacy_123",
								name: "my-legacy-pipeline",
								endpoint: "https://pipelines.cloudflare.com/legacy",
							},
						});
					},
					{ once: true }
				)
			);

			msw.use(
				http.delete(
					`*/accounts/${accountId}/pipelines/my-legacy-pipeline`,
					() => {
						return HttpResponse.json({
							success: true,
							errors: [],
							messages: [],
							result: null,
						});
					},
					{ once: true }
				)
			);

			setIsTTY(true);
			mockConfirm({
				text: "Are you sure you want to delete the legacy pipeline 'my-legacy-pipeline'?",
				result: true,
			});

			await runWrangler("pipelines delete my-legacy-pipeline");

			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				✨ Successfully deleted legacy pipeline 'my-legacy-pipeline'."
			`);
		});
	});

	describe("pipelines update", () => {
		it("should error when trying to update V1 pipeline", async () => {
			const mockPipeline: Pipeline = {
				id: "pipeline_123",
				name: "my_pipeline",
				sql: "INSERT INTO test_sink SELECT * FROM test_stream;",
				status: "active",
				created_at: "2024-01-01T00:00:00Z",
				modified_at: "2024-01-01T00:00:00Z",
			};

			msw.use(
				http.get(
					`*/accounts/${accountId}/pipelines/v1/pipelines/pipeline_123`,
					() => {
						return HttpResponse.json({
							success: true,
							errors: [],
							messages: [],
							result: mockPipeline,
						});
					},
					{ once: true }
				)
			);

			await expect(
				runWrangler("pipelines update pipeline_123 --batch-max-mb 50")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Pipelines created with the V1 API cannot be updated. To modify your pipeline, delete and recreate it with your new SQL.]`
			);
		});

		it("should update legacy pipeline with warning", async () => {
			msw.use(
				http.get(
					`*/accounts/${accountId}/pipelines/v1/pipelines/my-legacy-pipeline`,
					() => {
						return HttpResponse.json(
							{
								success: false,
								errors: [{ code: 1000, message: "Pipeline not found" }],
								messages: [],
								result: null,
							},
							{ status: 404 }
						);
					},
					{ once: true }
				)
			);

			const mockLegacyPipeline = {
				id: "legacy_123",
				name: "my-legacy-pipeline",
				endpoint: "https://pipelines.cloudflare.com/legacy",
				source: [{ type: "http", format: "json" }],
				destination: {
					type: "r2",
					format: "json",
					path: { bucket: "my-bucket", prefix: "data/" },
					batch: {
						max_duration_s: 300,
						max_bytes: 100000000,
						max_rows: 10000000,
					},
					compression: { type: "gzip" },
				},
				transforms: [],
				metadata: { shards: 2 },
			};

			msw.use(
				http.get(
					`*/accounts/${accountId}/pipelines/my-legacy-pipeline`,
					() => {
						return HttpResponse.json({
							success: true,
							errors: [],
							messages: [],
							result: mockLegacyPipeline,
						});
					},
					{ once: true }
				)
			);

			msw.use(
				http.put(
					`*/accounts/${accountId}/pipelines/my-legacy-pipeline`,
					() => {
						return HttpResponse.json({
							success: true,
							errors: [],
							messages: [],
							result: {
								...mockLegacyPipeline,
								destination: {
									...mockLegacyPipeline.destination,
									batch: {
										...mockLegacyPipeline.destination.batch,
										max_bytes: 50000000,
									},
								},
							},
						});
					},
					{ once: true }
				)
			);

			await runWrangler(
				"pipelines update my-legacy-pipeline --batch-max-mb 50"
			);

			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1m🚧 \`wrangler pipelines update\` is an open beta command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose[0m


				[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1m⚠️  Updating legacy pipeline. Consider recreating with 'wrangler pipelines setup'.[0m

				"
			`);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				🌀 Updating pipeline "my-legacy-pipeline"
				✨ Successfully updated pipeline "my-legacy-pipeline" with ID legacy_123
				"
			`);
		});
	});

	describe("pipelines streams create", () => {
		const { setIsTTY } = useMockIsTTY();
		function mockCreateStreamRequest(expectedRequest: {
			name: string;
			hasSchema?: boolean;
		}) {
			const requests = { count: 0 };
			msw.use(
				http.post(
					`*/accounts/${accountId}/pipelines/v1/streams`,
					async ({ request }) => {
						requests.count++;
						const body = (await request.json()) as {
							name: string;
							schema?: { fields: SchemaField[] };
						};
						expect(body.name).toBe(expectedRequest.name);

						const schema = expectedRequest.hasSchema
							? {
									fields: [
										{ name: "id", type: "string", required: true },
										{
											name: "timestamp",
											type: "timestamp",
											required: true,
											unit: "millisecond",
										},
									],
								}
							: null;

						const format = expectedRequest.hasSchema
							? { type: "json" }
							: { type: "json", unstructured: true };

						return HttpResponse.json({
							success: true,
							errors: [],
							messages: [],
							result: {
								id: "stream_123",
								name: expectedRequest.name,
								version: 1,
								endpoint: `https://pipelines.cloudflare.com/${expectedRequest.name}`,
								format,
								schema,
								http: {
									enabled: true,
									authentication: true,
								},
								worker_binding: { enabled: true },
								created_at: "2024-01-01T00:00:00Z",
								modified_at: "2024-01-01T00:00:00Z",
							},
						});
					},
					{ once: true }
				)
			);
			return requests;
		}

		it("should error when no stream name provided", async () => {
			await expect(
				runWrangler("pipelines streams create")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Not enough non-option arguments: got 0, need at least 1]`
			);
		});

		it("should error when name contains invalid characters", async () => {
			await expect(
				runWrangler("pipelines streams create my-stream")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: stream name must contain only letters, numbers, and underscores]`
			);
		});

		it("should create stream with default settings", async () => {
			setIsTTY(true);
			mockConfirm({
				text: "No schema file provided. Do you want to create stream without a schema (unstructured JSON)?",
				result: true,
			});

			const createRequest = mockCreateStreamRequest({
				name: "my_stream",
			});

			await runWrangler("pipelines streams create my_stream");

			expect(createRequest.count).toBe(1);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				🌀 Creating stream 'my_stream'...
				✨ Successfully created stream 'my_stream' with id 'stream_123'.

				Creation Summary:
				General:
				  Name:  my_stream

				HTTP Ingest:
				  Enabled:         Yes
				  Authentication:  Yes
				  Endpoint:        https://pipelines.cloudflare.com/my_stream
				  CORS Origins:    None

				Input Schema: Unstructured JSON (single 'value' column)"
			`);
		});

		it("should create stream with schema from file", async () => {
			const schemaFile = "schema.json";
			const schema = {
				fields: [
					{ name: "id", type: "string", required: true },
					{
						name: "timestamp",
						type: "timestamp",
						required: true,
						unit: "millisecond",
					},
				],
			};
			writeFileSync(schemaFile, JSON.stringify(schema));

			const createRequest = mockCreateStreamRequest({
				name: "my_stream",
				hasSchema: true,
			});

			await runWrangler(
				`pipelines streams create my_stream --schema-file ${schemaFile}`
			);

			expect(createRequest.count).toBe(1);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				🌀 Creating stream 'my_stream'...
				✨ Successfully created stream 'my_stream' with id 'stream_123'.

				Creation Summary:
				General:
				  Name:  my_stream

				HTTP Ingest:
				  Enabled:         Yes
				  Authentication:  Yes
				  Endpoint:        https://pipelines.cloudflare.com/my_stream
				  CORS Origins:    None

				Input Schema:
				┌─┬─┬─┬─┐
				│ Field Name │ Type │ Unit/Items │ Required │
				├─┼─┼─┼─┤
				│ id │ string │ │ Yes │
				├─┼─┼─┼─┤
				│ timestamp │ timestamp │ millisecond │ Yes │
				└─┴─┴─┴─┘"
			`);
		});
	});

	describe("pipelines streams list", () => {
		function mockListStreamsRequest(streams: Stream[], pipelineId?: string) {
			const requests = { count: 0 };
			msw.use(
				http.get(
					`*/accounts/${accountId}/pipelines/v1/streams`,
					({ request }) => {
						requests.count++;
						const url = new URL(request.url);
						if (pipelineId) {
							expect(url.searchParams.get("pipeline_id")).toBe(pipelineId);
						}
						return HttpResponse.json({
							success: true,
							errors: [],
							messages: [],
							result: streams,
							result_info: {
								page: 1,
								per_page: 20,
								count: streams.length,
								total_count: streams.length,
							},
						});
					},
					{ once: true }
				)
			);
			return requests;
		}

		it("should list streams", async () => {
			const mockStreams: Stream[] = [
				{
					id: "stream_1",
					name: "stream_one",
					version: 1,
					endpoint: "https://pipelines.cloudflare.com/stream_1",
					format: { type: "json", unstructured: true },
					schema: null,
					http: { enabled: true, authentication: false },
					worker_binding: { enabled: true },
					created_at: "2024-01-01T00:00:00Z",
					modified_at: "2024-01-01T00:00:00Z",
				},
			];

			const listRequest = mockListStreamsRequest(mockStreams);

			await runWrangler("pipelines streams list");

			expect(listRequest.count).toBe(1);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				┌─┬─┬─┬─┐
				│ Name │ ID │ HTTP │ Created │
				├─┼─┼─┼─┤
				│ stream_one │ stream_1 │ Yes (unauthenticated) │ 1/1/2024 │
				└─┴─┴─┴─┘"
			`);
		});

		it("should filter by pipeline ID", async () => {
			const mockStreams: Stream[] = [
				{
					id: "stream_1",
					name: "filtered_stream",
					version: 1,
					endpoint: "https://pipelines.cloudflare.com/stream_1",
					format: { type: "json", unstructured: true },
					schema: null,
					http: { enabled: true, authentication: false },
					worker_binding: { enabled: true },
					created_at: "2024-01-01T00:00:00Z",
					modified_at: "2024-01-01T00:00:00Z",
				},
			];

			const listRequest = mockListStreamsRequest(mockStreams, "pipeline_123");

			await runWrangler("pipelines streams list --pipeline-id pipeline_123");

			expect(listRequest.count).toBe(1);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				┌─┬─┬─┬─┐
				│ Name │ ID │ HTTP │ Created │
				├─┼─┼─┼─┤
				│ filtered_stream │ stream_1 │ Yes (unauthenticated) │ 1/1/2024 │
				└─┴─┴─┴─┘"
			`);
		});

		it('supports valid json output with "--json" flag', async () => {
			const mockStreams: Stream[] = [
				{
					id: "stream_1",
					name: "stream_one",
					version: 1,
					endpoint: "https://pipelines.cloudflare.com/stream_1",
					format: { type: "json", unstructured: true },
					schema: null,
					http: { enabled: true, authentication: false },
					worker_binding: { enabled: true },
					created_at: "2024-01-01T00:00:00Z",
					modified_at: "2024-01-01T00:00:00Z",
				},
			];

			mockListStreamsRequest(mockStreams);

			await runWrangler("pipelines streams list --json");

			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(JSON.parse(std.out)).toMatchInlineSnapshot(`
				[
				  {
				    "created_at": "2024-01-01T00:00:00Z",
				    "endpoint": "https://pipelines.cloudflare.com/stream_1",
				    "format": {
				      "type": "json",
				      "unstructured": true,
				    },
				    "http": {
				      "authentication": false,
				      "enabled": true,
				    },
				    "id": "stream_1",
				    "modified_at": "2024-01-01T00:00:00Z",
				    "name": "stream_one",
				    "schema": null,
				    "version": 1,
				    "worker_binding": {
				      "enabled": true,
				    },
				  },
				]
			`);
		});
	});

	describe("pipelines streams get", () => {
		it("should get stream details", async () => {
			const mockStream: Stream = {
				id: "stream_123",
				name: "my_stream",
				version: 1,
				endpoint: "https://pipelines.cloudflare.com/stream_123",
				format: { type: "json", unstructured: true },
				schema: null,
				http: { enabled: true, authentication: true },
				worker_binding: { enabled: true },
				created_at: "2024-01-01T00:00:00Z",
				modified_at: "2024-01-01T00:00:00Z",
			};

			const getRequest = mockGetStreamRequest("stream_123", mockStream);

			await runWrangler("pipelines streams get stream_123");

			expect(getRequest.count).toBe(1);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Stream ID: stream_123

				Configuration:
				General:
				  Name:         my_stream
				  Created At:   1/1/2024, 12:00:00 AM
				  Modified At:  1/1/2024, 12:00:00 AM

				HTTP Ingest:
				  Enabled:         Yes
				  Authentication:  Yes
				  Endpoint:        https://pipelines.cloudflare.com/stream_123
				  CORS Origins:    None

				Input Schema: Unstructured JSON (single 'value' column)"
			`);
		});

		it('supports valid json output with "--json" flag', async () => {
			const mockStream: Stream = {
				id: "stream_123",
				name: "my_stream",
				version: 1,
				endpoint: "https://pipelines.cloudflare.com/stream_123",
				format: { type: "json", unstructured: true },
				schema: null,
				http: { enabled: true, authentication: true },
				worker_binding: { enabled: true },
				created_at: "2024-01-01T00:00:00Z",
				modified_at: "2024-01-01T00:00:00Z",
			};

			mockGetStreamRequest("stream_123", mockStream);

			await runWrangler("pipelines streams get stream_123 --json");

			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(JSON.parse(std.out)).toMatchInlineSnapshot(`
				{
				  "created_at": "2024-01-01T00:00:00Z",
				  "endpoint": "https://pipelines.cloudflare.com/stream_123",
				  "format": {
				    "type": "json",
				    "unstructured": true,
				  },
				  "http": {
				    "authentication": true,
				    "enabled": true,
				  },
				  "id": "stream_123",
				  "modified_at": "2024-01-01T00:00:00Z",
				  "name": "my_stream",
				  "schema": null,
				  "version": 1,
				  "worker_binding": {
				    "enabled": true,
				  },
				}
			`);
		});
	});

	describe("pipelines streams delete", () => {
		const { setIsTTY } = useMockIsTTY();
		function mockDeleteStreamRequest(streamId: string) {
			const requests = { count: 0 };
			msw.use(
				http.delete(
					`*/accounts/${accountId}/pipelines/v1/streams/${streamId}`,
					() => {
						requests.count++;
						return HttpResponse.json({
							success: true,
							errors: [],
							messages: [],
							result: null,
						});
					},
					{ once: true }
				)
			);
			return requests;
		}

		it("should prompt for confirmation", async () => {
			const mockStream: Stream = {
				id: "stream_123",
				name: "my_stream",
				version: 1,
				endpoint: "https://pipelines.cloudflare.com/stream_123",
				format: { type: "json", unstructured: true },
				schema: null,
				http: { enabled: true, authentication: false },
				worker_binding: { enabled: true },
				created_at: "2024-01-01T00:00:00Z",
				modified_at: "2024-01-01T00:00:00Z",
			};

			const getRequest = mockGetStreamRequest("stream_123", mockStream);
			const deleteRequest = mockDeleteStreamRequest("stream_123");

			setIsTTY(true);
			mockConfirm({
				text: "Are you sure you want to delete the stream 'my_stream' (stream_123)?",
				result: true,
			});

			await runWrangler("pipelines streams delete stream_123");

			expect(getRequest.count).toBe(1);
			expect(deleteRequest.count).toBe(1);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				✨ Successfully deleted stream 'my_stream' with id 'stream_123'."
			`);
		});
	});

	describe("pipelines sinks create", () => {
		function mockCreateSinkRequest(expectedRequest: {
			name: string;
			type: string;
			isDataCatalog?: boolean;
		}) {
			const requests = { count: 0 };
			msw.use(
				http.post(
					`*/accounts/${accountId}/pipelines/v1/sinks`,
					async ({ request }) => {
						requests.count++;
						const body = (await request.json()) as {
							name: string;
							type: string;
							config?: Record<string, unknown>;
						};
						expect(body.name).toBe(expectedRequest.name);
						expect(body.type).toBe(expectedRequest.type);

						const config = expectedRequest.isDataCatalog
							? {
									bucket: "catalog-bucket",
									namespace: "default",
									table_name: "my-table",
									token: "token123",
								}
							: {
									bucket: "my-bucket",
									credentials: {
										access_key_id: "key123",
										secret_access_key: "secret123",
									},
								};

						return HttpResponse.json({
							success: true,
							errors: [],
							messages: [],
							result: {
								id: "sink_123",
								name: expectedRequest.name,
								type: expectedRequest.type,
								format: { type: "json" },
								schema: null,
								config,
								created_at: "2024-01-01T00:00:00Z",
								modified_at: "2024-01-01T00:00:00Z",
							},
						});
					},
					{ once: true }
				)
			);
			return requests;
		}

		it("should error when name contains invalid characters", async () => {
			await expect(
				runWrangler(
					"pipelines sinks create my-sink --bucket my-bucket --type r2"
				)
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: sink name must contain only letters, numbers, and underscores]`
			);
		});

		it("should error when type is missing", async () => {
			await expect(
				runWrangler("pipelines sinks create my_sink --bucket my-bucket")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Missing required argument: type]`
			);
		});

		it("should error with invalid bucket name", async () => {
			await expect(
				runWrangler(
					"pipelines sinks create my_sink --type r2 --bucket invalid_bucket_name"
				)
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: The bucket name "invalid_bucket_name" is invalid. Bucket names must begin and end with an alphanumeric character, only contain lowercase letters, numbers, and hyphens, and be between 3 and 63 characters long.]`
			);
		});

		it("should create R2 sink with explicit credentials", async () => {
			const createRequest = mockCreateSinkRequest({
				name: "my_sink",
				type: "r2",
			});

			await runWrangler(
				"pipelines sinks create my_sink --type r2 --bucket my-bucket --access-key-id mykey --secret-access-key mysecret"
			);

			expect(createRequest.count).toBe(1);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				🌀 Creating sink 'my_sink'...
				✨ Successfully created sink 'my_sink' with id 'sink_123'.

				Creation Summary:
				General:
				  Type:  R2

				Destination:
				  Bucket:        my-bucket
				  Path:          (root)
				  Partitioning:  year=%Y/month=%m/day=%d

				Batching:
				  File Size:      none
				  Time Interval:  300s

				Format:
				  Type:  json"
			`);
		});

		it("should create R2 Data Catalog sink", async () => {
			const createRequest = mockCreateSinkRequest({
				name: "my_sink",
				type: "r2_data_catalog",
				isDataCatalog: true,
			});

			await runWrangler(
				"pipelines sinks create my_sink --type r2-data-catalog --bucket catalog-bucket --namespace default --table my-table --catalog-token token123"
			);

			expect(createRequest.count).toBe(1);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				🌀 Creating sink 'my_sink'...
				✨ Successfully created sink 'my_sink' with id 'sink_123'.

				Creation Summary:
				General:
				  Type:  R2 Data Catalog

				Destination:
				  Bucket:  catalog-bucket
				  Table:   default.my-table

				Batching:
				  File Size:      none
				  Time Interval:  300s

				Format:
				  Type:  json"
			`);
		});

		it("should error when r2-data-catalog missing required fields", async () => {
			await expect(
				runWrangler(
					"pipelines sinks create my_sink --type r2-data-catalog --bucket catalog-bucket"
				)
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: --namespace is required for r2-data-catalog sinks]`
			);
		});
	});

	describe("pipelines sinks list", () => {
		function mockListSinksRequest(sinks: Sink[], pipelineId?: string) {
			const requests = { count: 0 };
			msw.use(
				http.get(
					`*/accounts/${accountId}/pipelines/v1/sinks`,
					({ request }) => {
						requests.count++;
						const url = new URL(request.url);
						if (pipelineId) {
							expect(url.searchParams.get("pipeline_id")).toBe(pipelineId);
						}
						return HttpResponse.json({
							success: true,
							errors: [],
							messages: [],
							result: sinks,
							result_info: {
								page: 1,
								per_page: 20,
								count: sinks.length,
								total_count: sinks.length,
							},
						});
					},
					{ once: true }
				)
			);
			return requests;
		}

		it("should list sinks", async () => {
			const mockSinks: Sink[] = [
				{
					id: "sink_1",
					name: "sink_one",
					type: "r2",
					format: { type: "json" },
					schema: null,
					config: { bucket: "bucket1" },
					created_at: "2024-01-01T00:00:00Z",
					modified_at: "2024-01-01T00:00:00Z",
				},
			];

			const listRequest = mockListSinksRequest(mockSinks);

			await runWrangler("pipelines sinks list");

			expect(listRequest.count).toBe(1);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				┌─┬─┬─┬─┬─┐
				│ Name │ ID │ Type │ Destination │ Created │
				├─┼─┼─┼─┼─┤
				│ sink_one │ sink_1 │ R2 │ bucket1 │ 1/1/2024 │
				└─┴─┴─┴─┴─┘"
			`);
		});

		it("should filter by pipeline ID", async () => {
			const mockSinks: Sink[] = [
				{
					id: "sink_1",
					name: "filtered_sink",
					type: "r2",
					format: { type: "json" },
					schema: null,
					config: { bucket: "bucket1" },
					created_at: "2024-01-01T00:00:00Z",
					modified_at: "2024-01-01T00:00:00Z",
				},
			];

			const listRequest = mockListSinksRequest(mockSinks, "pipeline_123");

			await runWrangler("pipelines sinks list --pipeline-id pipeline_123");

			expect(listRequest.count).toBe(1);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				┌─┬─┬─┬─┬─┐
				│ Name │ ID │ Type │ Destination │ Created │
				├─┼─┼─┼─┼─┤
				│ filtered_sink │ sink_1 │ R2 │ bucket1 │ 1/1/2024 │
				└─┴─┴─┴─┴─┘"
			`);
		});

		it('supports json output with "--json" flag', async () => {
			const mockSinks: Sink[] = [
				{
					id: "sink_1",
					name: "sink_one",
					type: "r2",
					format: { type: "json" },
					schema: null,
					config: { bucket: "bucket1" },
					created_at: "2024-01-01T00:00:00Z",
					modified_at: "2024-01-01T00:00:00Z",
				},
			];

			mockListSinksRequest(mockSinks);
			await runWrangler("pipelines sinks list --json");

			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.out).toMatchInlineSnapshot(`
				"[
				  {
				    id: 'sink_1',
				    name: 'sink_one',
				    type: 'r2',
				    format: { type: 'json' },
				    schema: null,
				    config: { bucket: 'bucket1' },
				    created_at: '2024-01-01T00:00:00Z',
				    modified_at: '2024-01-01T00:00:00Z'
				  }
				]"
			`);
		});
	});

	function mockGetSinkRequest(sinkId: string, sink: Sink) {
		const requests = { count: 0 };
		msw.use(
			http.get(
				`*/accounts/${accountId}/pipelines/v1/sinks/${sinkId}`,
				() => {
					requests.count++;
					return HttpResponse.json({
						success: true,
						errors: [],
						messages: [],
						result: sink,
					});
				},
				{ once: true }
			)
		);
		return requests;
	}

	describe("pipelines sinks get", () => {
		it("should get sink details", async () => {
			const mockSink: Sink = {
				id: "sink_123",
				name: "my_sink",
				type: "r2",
				format: { type: "json" },
				schema: null,
				config: {
					bucket: "my-bucket",
				},
				created_at: "2024-01-01T00:00:00Z",
				modified_at: "2024-01-01T00:00:00Z",
			};

			const getRequest = mockGetSinkRequest("sink_123", mockSink);

			await runWrangler("pipelines sinks get sink_123");

			expect(getRequest.count).toBe(1);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				ID:    sink_123
				Name:  my_sink
				General:
				  Type:         R2
				  Created At:   1/1/2024, 12:00:00 AM
				  Modified At:  1/1/2024, 12:00:00 AM

				Destination:
				  Bucket:        my-bucket
				  Path:          (root)
				  Partitioning:  year=%Y/month=%m/day=%d

				Batching:
				  File Size:      none
				  Time Interval:  300s

				Format:
				  Type:  json"
			`);
		});

		it('supports valid json output with "--json" flag', async () => {
			const mockSink: Sink = {
				id: "sink_123",
				name: "my_sink",
				type: "r2",
				format: { type: "json" },
				schema: null,
				config: {
					bucket: "my-bucket",
				},
				created_at: "2024-01-01T00:00:00Z",
				modified_at: "2024-01-01T00:00:00Z",
			};

			mockGetSinkRequest("sink_123", mockSink);
			await runWrangler("pipelines sinks get sink_123 --json");

			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(JSON.parse(std.out)).toEqual({
				config: {
					bucket: "my-bucket",
				},
				created_at: "2024-01-01T00:00:00Z",
				format: {
					type: "json",
				},
				id: "sink_123",
				modified_at: "2024-01-01T00:00:00Z",
				name: "my_sink",
				schema: null,
				type: "r2",
			});
		});
	});

	describe("pipelines sinks delete", () => {
		const { setIsTTY } = useMockIsTTY();
		function mockDeleteSinkRequest(sinkId: string) {
			const requests = { count: 0 };
			msw.use(
				http.delete(
					`*/accounts/${accountId}/pipelines/v1/sinks/${sinkId}`,
					() => {
						requests.count++;
						return HttpResponse.json({
							success: true,
							errors: [],
							messages: [],
							result: null,
						});
					},
					{ once: true }
				)
			);
			return requests;
		}

		it("should prompt for confirmation", async () => {
			const mockSink: Sink = {
				id: "sink_123",
				name: "my_sink",
				type: "r2",
				format: { type: "json" },
				schema: null,
				config: { bucket: "my-bucket" },
				created_at: "2024-01-01T00:00:00Z",
				modified_at: "2024-01-01T00:00:00Z",
			};

			const getSinkRequest = mockGetSinkRequest("sink_123", mockSink);
			const deleteRequest = mockDeleteSinkRequest("sink_123");

			setIsTTY(true);
			mockConfirm({
				text: "Are you sure you want to delete the sink 'my_sink' (sink_123)?",
				result: true,
			});

			await runWrangler("pipelines sinks delete sink_123");

			expect(getSinkRequest.count).toBe(1);
			expect(deleteRequest.count).toBe(1);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				✨ Successfully deleted sink 'my_sink' with id 'sink_123'."
			`);
		});
	});
});
