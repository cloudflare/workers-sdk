import { writeFileSync } from "node:fs";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
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
			expect(std.out).toContain(
				"Send your first event to stream 'test_stream':"
			);
			expect(std.out).toContain("Worker Integration:");
			expect(std.out).toContain("HTTP Endpoint:");
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
				"┌─┬─┬─┬─┐
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
			expect(std.out).toMatchInlineSnapshot(`"No pipelines found."`);
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
				"General:
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
				"✨ Successfully deleted pipeline 'my_pipeline' with id 'pipeline_123'."
			`);
		});
	});

	describe("pipelines update", () => {
		it("should error when not using --legacy flag", async () => {
			await expect(
				runWrangler("pipelines update my_pipeline")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: The update command is not supported for pipelines created with the V1 API. Use the --legacy flag to update legacy pipelines.]`
			);
		});
	});

	describe("pipelines streams create", () => {
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

		it("should create stream with default settings", async () => {
			const createRequest = mockCreateStreamRequest({
				name: "my_stream",
			});

			await runWrangler("pipelines streams create my_stream");

			expect(createRequest.count).toBe(1);
			expect(std.err).toMatchInlineSnapshot(`""`);
			expect(std.out).toMatchInlineSnapshot(`
				"🌀 Creating stream 'my_stream'...
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
				"🌀 Creating stream 'my_stream'...
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
				"┌─┬─┬─┬─┐
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
				"┌─┬─┬─┬─┐
				│ Name │ ID │ HTTP │ Created │
				├─┼─┼─┼─┤
				│ filtered_stream │ stream_1 │ Yes (unauthenticated) │ 1/1/2024 │
				└─┴─┴─┴─┘"
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
				"Stream ID: stream_123

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
				"✨ Successfully deleted stream 'my_stream' with id 'stream_123'."
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
				"🌀 Creating sink 'my_sink'...
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
				  Time Interval:  30s

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
				"🌀 Creating sink 'my_sink'...
				✨ Successfully created sink 'my_sink' with id 'sink_123'.

				Creation Summary:
				General:
				  Type:  R2 Data Catalog

				Destination:
				  Bucket:  catalog-bucket
				  Table:   default.my-table

				Batching:
				  File Size:      none
				  Time Interval:  30s

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
				"┌─┬─┬─┬─┬─┐
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
				"┌─┬─┬─┬─┬─┐
				│ Name │ ID │ Type │ Destination │ Created │
				├─┼─┼─┼─┼─┤
				│ filtered_sink │ sink_1 │ R2 │ bucket1 │ 1/1/2024 │
				└─┴─┴─┴─┴─┘"
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
				"ID:    sink_123
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
				  Time Interval:  30s

				Format:
				  Type:  json"
			`);
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
				"✨ Successfully deleted sink 'my_sink' with id 'sink_123'."
			`);
		});
	});
});
