import { writeFileSync } from "node:fs";
import { http, HttpResponse } from "msw";
/* eslint-disable workers-sdk/no-vitest-import-expect -- MSW handlers use expect at module scope */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
/* eslint-enable workers-sdk/no-vitest-import-expect */
import {
	__testSkipCredentialValidation,
	__testSkipDelays,
} from "../pipelines/index";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import {
	clearDialogs,
	mockConfirm,
	mockPrompt,
	mockSelect,
} from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import { createFetchResult, msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type { Sink, Stream } from "../pipelines/types";

describe("wrangler pipelines setup", () => {
	const std = mockConsoleMethods();
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();

	const accountId = "some-account-id";

	beforeAll(() => {
		__testSkipDelays();
		__testSkipCredentialValidation();
	});

	function mockGetR2Bucket(bucketName: string, exists: boolean) {
		msw.use(
			http.get(
				`*/accounts/${accountId}/r2/buckets/${bucketName}`,
				() => {
					if (exists) {
						return HttpResponse.json(
							createFetchResult({ name: bucketName, location: "WNAM" })
						);
					}
					return HttpResponse.json(
						createFetchResult(null, false, [
							{ code: 10006, message: "bucket not found" },
						]),
						{ status: 404 }
					);
				},
				{ once: true }
			)
		);
	}

	function mockCreateStreamRequest(
		expectedName: string,
		options: { fail?: boolean } = {}
	) {
		const requests = { count: 0 };
		msw.use(
			http.post(
				`*/accounts/${accountId}/pipelines/v1/streams`,
				async ({ request }) => {
					requests.count++;
					const body = (await request.json()) as { name: string };
					expect(body.name).toBe(expectedName);

					if (options.fail) {
						return HttpResponse.json(
							{
								success: false,
								errors: [{ code: 1000, message: "Stream creation failed" }],
								messages: [],
								result: null,
							},
							{ status: 400 }
						);
					}

					return HttpResponse.json({
						success: true,
						errors: [],
						messages: [],
						result: {
							id: "stream_123",
							name: body.name,
							version: 1,
							endpoint: `https://pipelines.cloudflare.com/${body.name}`,
							format: { type: "json", unstructured: true },
							schema: null,
							http: { enabled: true, authentication: false },
							worker_binding: { enabled: true },
							created_at: "2024-01-01T00:00:00Z",
							modified_at: "2024-01-01T00:00:00Z",
						} as Stream,
					});
				},
				{ once: true }
			)
		);
		return requests;
	}

	function mockCreateSinkRequest(
		expectedName: string,
		options: { fail?: boolean } = {}
	) {
		const requests = { count: 0 };
		msw.use(
			http.post(
				`*/accounts/${accountId}/pipelines/v1/sinks`,
				async ({ request }) => {
					requests.count++;
					const body = (await request.json()) as { name: string };
					expect(body.name).toBe(expectedName);

					if (options.fail) {
						return HttpResponse.json(
							{
								success: false,
								errors: [{ code: 1000, message: "Sink creation failed" }],
								messages: [],
								result: null,
							},
							{ status: 400 }
						);
					}

					return HttpResponse.json({
						success: true,
						errors: [],
						messages: [],
						result: {
							id: "sink_123",
							name: body.name,
							type: "r2",
							format: { type: "json" },
							schema: null,
							config: { bucket: "test-bucket" },
							created_at: "2024-01-01T00:00:00Z",
							modified_at: "2024-01-01T00:00:00Z",
						} as Sink,
					});
				},
				{ once: true }
			)
		);
		return requests;
	}

	function mockDeleteStream(streamId: string) {
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

	function mockValidateSql(sql: string, options: { fail?: boolean } = {}) {
		const requests = { count: 0 };
		msw.use(
			http.post(
				`*/accounts/${accountId}/pipelines/v1/validate_sql`,
				async ({ request }) => {
					requests.count++;
					const body = (await request.json()) as { sql: string };
					expect(body.sql).toBe(sql);

					if (options.fail) {
						return HttpResponse.json(
							{
								success: false,
								errors: [{ code: 1000, message: "SQL validation failed" }],
								messages: [],
								result: null,
							},
							{ status: 400 }
						);
					}

					return HttpResponse.json({
						success: true,
						errors: [],
						messages: [],
						result: {
							tables: {
								test_pipeline_stream: { type: "stream" },
								test_pipeline_sink: { type: "sink" },
							},
						},
					});
				},
				{ once: true }
			)
		);
		return requests;
	}

	function mockCreatePipeline(
		expectedName: string,
		options: { fail?: boolean } = {}
	) {
		const requests = { count: 0 };
		msw.use(
			http.post(
				`*/accounts/${accountId}/pipelines/v1/pipelines`,
				async ({ request }) => {
					requests.count++;
					const body = (await request.json()) as { name: string };
					expect(body.name).toBe(expectedName);

					if (options.fail) {
						return HttpResponse.json(
							{
								success: false,
								errors: [{ code: 1000, message: "Pipeline creation failed" }],
								messages: [],
								result: null,
							},
							{ status: 400 }
						);
					}

					return HttpResponse.json({
						success: true,
						errors: [],
						messages: [],
						result: {
							id: "pipeline_123",
							name: body.name,
							sql: "INSERT INTO test_pipeline_sink SELECT * FROM test_pipeline_stream;",
							status: "active",
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

	type DestinationType = "r2" | "r2_data_catalog";
	type SetupMode = "simple" | "advanced";

	function mockSinkDialogs(destination: DestinationType, mode: SetupMode) {
		mockConfirm({
			text: "Enable HTTP endpoint for sending data?",
			result: true,
		});
		mockConfirm({
			text: "Require authentication for HTTP endpoint?",
			result: false,
		});
		mockConfirm({
			text: "Configure custom CORS origins?",
			result: false,
		});
		mockSelect({
			text: "How would you like to define the schema for incoming events?",
			result: "skip",
		});
		mockSelect({
			text: "Destination type:",
			result: destination,
		});
		mockSelect({
			text: "Setup mode:",
			result: mode,
		});
	}

	function mockAdvancedR2SinkPrompts() {
		mockPrompt({
			text: "The base prefix in your bucket where data will be written (optional):",
			result: "",
		});
		mockPrompt({
			text: "Time partition pattern (optional):",
			result: "year=%Y/month=%m/day=%d",
		});
		mockSelect({
			text: "Output format:",
			result: "json",
		});
		mockPrompt({
			text: "Roll file when size reaches (MB, minimum 5):",
			result: "100",
		});
		mockPrompt({
			text: "Roll file when time reaches (seconds, minimum 10):",
			result: "300",
		});
		mockConfirm({
			text: "Automatically generate credentials needed to write to your R2 bucket?",
			result: false,
		});
		mockPrompt({
			text: "R2 Access Key ID:",
			result: "test-access-key",
		});
		mockPrompt({
			text: "R2 Secret Access Key:",
			result: "test-secret-key",
		});
	}

	function mockCancelAtBucketName() {
		mockPrompt({
			text: "R2 bucket name (will be created if it doesn't exist):",
			result: "",
		});
		mockConfirm({
			text: "Would you like to try again?",
			result: false,
		});
	}

	function mockBasicStreamConfig() {
		mockConfirm({
			text: "Enable HTTP endpoint for sending data?",
			result: false,
		});
		mockSelect({
			text: "How would you like to define the schema for incoming events?",
			result: "skip",
		});
		mockSelect({
			text: "Destination type:",
			result: "r2",
		});
		mockSelect({
			text: "Setup mode:",
			result: "simple",
		});
	}

	function mockGetR2Catalog(
		bucketName: string,
		options: { exists?: boolean; active?: boolean } = {}
	) {
		const { exists = true, active = true } = options;
		msw.use(
			http.get(
				`*/accounts/${accountId}/r2-catalog/${bucketName}`,
				() => {
					if (!exists) {
						return HttpResponse.json(
							createFetchResult(null, false, [
								{ code: 40401, message: "Warehouse not found" },
							]),
							{ status: 404 }
						);
					}
					return HttpResponse.json(
						createFetchResult({
							id: "catalog_123",
							name: bucketName,
							bucket: bucketName,
							status: active ? "active" : "inactive",
						})
					);
				},
				{ once: true }
			)
		);
	}

	function mockEnableR2Catalog(bucketName: string) {
		msw.use(
			http.post(
				`*/accounts/${accountId}/r2-catalog/${bucketName}/enable`,
				() => {
					return HttpResponse.json(
						createFetchResult({
							id: "catalog_123",
							name: bucketName,
						})
					);
				},
				{ once: true }
			)
		);
	}

	function mockUpsertR2CatalogCredential(
		bucketName: string,
		options: { fail?: boolean } = {}
	) {
		msw.use(
			http.post(
				`*/accounts/${accountId}/r2-catalog/${bucketName}/credential`,
				() => {
					if (options.fail) {
						return HttpResponse.json(
							createFetchResult(null, false, [
								{ code: 1000, message: "Invalid token" },
							]),
							{ status: 400 }
						);
					}
					return HttpResponse.json(createFetchResult({ success: true }));
				},
				{ once: true }
			)
		);
	}

	function mockCreateR2Bucket(bucketName: string) {
		msw.use(
			http.post(
				`*/accounts/${accountId}/r2/buckets`,
				async ({ request }) => {
					const body = (await request.json()) as { name: string };
					expect(body.name).toBe(bucketName);
					return HttpResponse.json(createFetchResult({}));
				},
				{ once: true }
			)
		);
	}

	afterEach(() => {
		clearDialogs();
		vi.restoreAllMocks();
	});

	describe("pipeline name validation", () => {
		it("validates pipeline name provided via --name flag - rejects hyphens", async () => {
			setIsTTY(true);

			await expect(
				runWrangler('pipelines setup --name "invalid-name!"')
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: pipeline name must contain only letters, numbers, and underscores]`
			);
		});

		it("accepts valid pipeline name with underscores and proceeds to stream config", async () => {
			setIsTTY(true);

			mockBasicStreamConfig();
			mockCancelAtBucketName();

			await expect(
				runWrangler('pipelines setup --name "valid_pipeline_name"')
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: R2 bucket name - cancelled]`
			);

			expect(std.out).toContain("Cloudflare Pipelines Setup");
			expect(std.out).toContain("STREAM");
		});

		it("falls back to interactive prompt when --name is empty string", async () => {
			setIsTTY(true);

			mockPrompt({
				text: "What would you like to name your pipeline?",
				result: "",
			});
			mockConfirm({
				text: "Would you like to try again?",
				result: false,
			});

			await expect(
				runWrangler('pipelines setup --name ""')
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Pipeline name - cancelled]`
			);
		});
	});

	describe("interactive validation retry", () => {
		it("shows retry prompt when invalid pipeline name entered interactively", async () => {
			setIsTTY(true);

			mockPrompt({
				text: "What would you like to name your pipeline?",
				result: "invalid-name!",
			});
			mockConfirm({
				text: "Would you like to try again?",
				result: false,
			});

			await expect(
				runWrangler("pipelines setup")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Pipeline name - cancelled]`
			);
		});

		it("allows retry and accepts valid name on second attempt", async () => {
			setIsTTY(true);

			mockPrompt({
				text: "What would you like to name your pipeline?",
				result: "invalid-name!",
			});
			mockConfirm({
				text: "Would you like to try again?",
				result: true,
			});
			mockPrompt({
				text: "What would you like to name your pipeline?",
				result: "valid_name",
			});
			mockSinkDialogs("r2", "simple");
			mockCancelAtBucketName();

			await expect(
				runWrangler("pipelines setup")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: R2 bucket name - cancelled]`
			);

			expect(std.out).toContain("STREAM");
			expect(std.out).toContain("SINK");
		});

		it("allows multiple retries before succeeding", async () => {
			setIsTTY(true);

			mockPrompt({
				text: "What would you like to name your pipeline?",
				result: "bad-name",
			});
			mockConfirm({
				text: "Would you like to try again?",
				result: true,
			});
			mockPrompt({
				text: "What would you like to name your pipeline?",
				result: "still bad!",
			});
			mockConfirm({
				text: "Would you like to try again?",
				result: true,
			});
			mockPrompt({
				text: "What would you like to name your pipeline?",
				result: "finally_valid",
			});
			mockBasicStreamConfig();
			mockCancelAtBucketName();

			await expect(
				runWrangler("pipelines setup")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: R2 bucket name - cancelled]`
			);

			expect(std.err).toContain(
				"pipeline name must contain only letters, numbers, and underscores"
			);
		});
	});

	describe("bucket name validation", () => {
		it("rejects bucket names with underscores", async () => {
			setIsTTY(true);

			mockSinkDialogs("r2", "simple");
			mockPrompt({
				text: "R2 bucket name (will be created if it doesn't exist):",
				result: "invalid_bucket_name",
			});
			mockConfirm({
				text: "Would you like to try again?",
				result: false,
			});

			await expect(
				runWrangler('pipelines setup --name "test_pipeline"')
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: R2 bucket name - cancelled]`
			);

			expect(std.err).toContain('The bucket name "invalid_bucket_name"');
		});

		it("rejects bucket names that are too short", async () => {
			setIsTTY(true);

			mockBasicStreamConfig();
			mockPrompt({
				text: "R2 bucket name (will be created if it doesn't exist):",
				result: "ab",
			});
			mockConfirm({
				text: "Would you like to try again?",
				result: false,
			});

			await expect(
				runWrangler('pipelines setup --name "test_pipeline"')
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: R2 bucket name - cancelled]`
			);

			expect(std.err).toContain('The bucket name "ab"');
		});

		it("allows retry with valid bucket name after invalid input", async () => {
			setIsTTY(true);

			mockSinkDialogs("r2", "advanced");
			mockPrompt({
				text: "R2 bucket name (will be created if it doesn't exist):",
				result: "invalid_bucket",
			});
			mockConfirm({
				text: "Would you like to try again?",
				result: true,
			});
			mockPrompt({
				text: "R2 bucket name (will be created if it doesn't exist):",
				result: "UPPERCASE",
			});
			mockConfirm({
				text: "Would you like to try again?",
				result: true,
			});
			mockPrompt({
				text: "R2 bucket name (will be created if it doesn't exist):",
				result: "valid-bucket-name",
			});
			mockGetR2Bucket("valid-bucket-name", true);
			mockAdvancedR2SinkPrompts();

			mockConfirm({
				text: "Create resources?",
				result: false,
			});

			await expect(
				runWrangler('pipelines setup --name "test_pipeline"')
			).rejects.toThrowErrorMatchingInlineSnapshot(`[Error: Setup cancelled]`);

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Cloudflare Pipelines Setup


				STREAM


				SINK

				  Using existing bucket "valid-bucket-name"

				  To create R2 API credentials:
				  Visit https://dash.cloudflare.com/some-account-id/r2/api-tokens/create?type=account
				  Create token with "Object Read & Write" permissions

				 done

				SUMMARY

				  Stream    test_pipeline_stream
				            HTTP enabled, unstructured

				  Sink      test_pipeline_sink
				            R2 → valid-bucket-name, json

				"
			`);
			expect(std.err).toMatchInlineSnapshot(`
				"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mThe bucket name "invalid_bucket" is invalid. Bucket names must begin and end with an alphanumeric character, only contain lowercase letters, numbers, and hyphens, and be between 3 and 63 characters long.[0m


				[31mX [41;31m[[41;97mERROR[41;31m][0m [1mThe bucket name "UPPERCASE" is invalid. Bucket names must begin and end with an alphanumeric character, only contain lowercase letters, numbers, and hyphens, and be between 3 and 63 characters long.[0m


				[31mX [41;31m[[41;97mERROR[41;31m][0m [1mSetup cancelled[0m

				"
			`);
			expect(std.err).toMatchInlineSnapshot(`
				"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mThe bucket name "invalid_bucket" is invalid. Bucket names must begin and end with an alphanumeric character, only contain lowercase letters, numbers, and hyphens, and be between 3 and 63 characters long.[0m


				[31mX [41;31m[[41;97mERROR[41;31m][0m [1mThe bucket name "UPPERCASE" is invalid. Bucket names must begin and end with an alphanumeric character, only contain lowercase letters, numbers, and hyphens, and be between 3 and 63 characters long.[0m


				[31mX [41;31m[[41;97mERROR[41;31m][0m [1mSetup cancelled[0m

				"
			`);
		});
	});

	describe("stream configuration", () => {
		it("proceeds through schema selection options with HTTP auth enabled", async () => {
			setIsTTY(true);

			mockConfirm({
				text: "Enable HTTP endpoint for sending data?",
				result: true,
			});
			mockConfirm({
				text: "Require authentication for HTTP endpoint?",
				result: true,
			});
			mockConfirm({
				text: "Configure custom CORS origins?",
				result: false,
			});
			mockSelect({
				text: "How would you like to define the schema for incoming events?",
				result: "skip",
			});
			mockSelect({
				text: "Destination type:",
				result: "r2",
			});
			mockSelect({
				text: "Setup mode:",
				result: "simple",
			});
			mockCancelAtBucketName();

			await expect(
				runWrangler('pipelines setup --name "test_pipeline"')
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: R2 bucket name - cancelled]`
			);

			expect(std.out).toContain("STREAM");
			expect(std.out).toContain("SINK");
		});
	});

	describe("schema loading from file", () => {
		it("loads schema from JSON file", async () => {
			setIsTTY(true);

			const schema = {
				fields: [
					{ name: "user_id", type: "string", required: true },
					{ name: "event", type: "string", required: true },
				],
			};
			writeFileSync("schema.json", JSON.stringify(schema));

			mockConfirm({
				text: "Enable HTTP endpoint for sending data?",
				result: false,
			});
			mockSelect({
				text: "How would you like to define the schema for incoming events?",
				result: "file",
			});
			mockPrompt({
				text: "Schema file path:",
				result: "schema.json",
			});
			mockSelect({
				text: "Destination type:",
				result: "r2",
			});
			mockSelect({
				text: "Setup mode:",
				result: "simple",
			});
			mockCancelAtBucketName();

			await expect(
				runWrangler('pipelines setup --name "test_pipeline"')
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: R2 bucket name - cancelled]`
			);

			expect(std.out).toContain("SINK");
		});

		it("retries when schema file not found", async () => {
			setIsTTY(true);

			const schema = {
				fields: [{ name: "id", type: "string", required: true }],
			};
			writeFileSync("valid-schema.json", JSON.stringify(schema));

			mockConfirm({
				text: "Enable HTTP endpoint for sending data?",
				result: false,
			});
			mockSelect({
				text: "How would you like to define the schema for incoming events?",
				result: "file",
			});
			mockPrompt({
				text: "Schema file path:",
				result: "nonexistent.json",
			});
			mockConfirm({
				text: "Would you like to try again?",
				result: true,
			});
			mockPrompt({
				text: "Schema file path:",
				result: "valid-schema.json",
			});
			mockSelect({
				text: "Destination type:",
				result: "r2",
			});
			mockSelect({
				text: "Setup mode:",
				result: "simple",
			});
			mockCancelAtBucketName();

			await expect(
				runWrangler('pipelines setup --name "test_pipeline"')
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: R2 bucket name - cancelled]`
			);

			expect(std.err).toContain("Failed to read schema file");
			expect(std.out).toContain("SINK");
		});
	});

	describe("sink creation retry and cleanup", () => {
		it("cleans up stream when user cancels after sink failure", async () => {
			setIsTTY(true);

			mockSinkDialogs("r2", "advanced");

			mockPrompt({
				text: "R2 bucket name (will be created if it doesn't exist):",
				result: "test-bucket",
			});
			mockGetR2Bucket("test-bucket", true);
			mockAdvancedR2SinkPrompts();

			mockConfirm({
				text: "Create resources?",
				result: true,
			});

			mockCreateStreamRequest("test_pipeline_stream");
			mockCreateSinkRequest("test_pipeline_sink", { fail: true });

			mockConfirm({
				text: "  Retry? (stream was created successfully)",
				result: false,
			});

			const deleteReq = mockDeleteStream("stream_123");

			await expect(
				runWrangler('pipelines setup --name "test_pipeline"')
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Sink creation cancelled]`
			);

			expect(deleteReq.count).toBe(1);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Cloudflare Pipelines Setup


				STREAM


				SINK

				  Using existing bucket "test-bucket"

				  To create R2 API credentials:
				  Visit https://dash.cloudflare.com/some-account-id/r2/api-tokens/create?type=account
				  Create token with "Object Read & Write" permissions

				 done

				SUMMARY

				  Stream    test_pipeline_stream
				            HTTP enabled, unstructured

				  Sink      test_pipeline_sink
				            R2 → test-bucket, json

				 done
				 failed
				  Sink creation failed [code: 1000]
				 done
				"
			`);
			expect(std.err).toMatchInlineSnapshot(`
				"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mSink creation cancelled[0m

				"
			`);
		});
	});

	describe("pipeline creation failure", () => {
		it("exits gracefully when user declines retry after pipeline failure", async () => {
			setIsTTY(true);

			mockSinkDialogs("r2", "advanced");

			mockPrompt({
				text: "R2 bucket name (will be created if it doesn't exist):",
				result: "test-bucket",
			});
			mockGetR2Bucket("test-bucket", true);
			mockAdvancedR2SinkPrompts();

			mockConfirm({
				text: "Create resources?",
				result: true,
			});

			mockCreateStreamRequest("test_pipeline_stream");
			mockCreateSinkRequest("test_pipeline_sink");

			mockSelect({
				text: "Query:",
				result: "simple",
			});

			const sql =
				"INSERT INTO test_pipeline_sink SELECT * FROM test_pipeline_stream;";
			mockValidateSql(sql);

			// Pipeline creation fails
			mockCreatePipeline("test_pipeline", { fail: true });

			// Decline retry - should exit gracefully without throwing
			mockConfirm({
				text: "  Try again with different SQL?",
				result: false,
			});

			// Should complete without error, just showing guidance
			await runWrangler('pipelines setup --name "test_pipeline"');

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Cloudflare Pipelines Setup


				STREAM


				SINK

				  Using existing bucket "test-bucket"

				  To create R2 API credentials:
				  Visit https://dash.cloudflare.com/some-account-id/r2/api-tokens/create?type=account
				  Create token with "Object Read & Write" permissions

				 done

				SUMMARY

				  Stream    test_pipeline_stream
				            HTTP enabled, unstructured

				  Sink      test_pipeline_sink
				            R2 → test-bucket, json

				 done
				 done

				SQL

				  Available tables:
				    test_pipeline_stream (source)
				    test_pipeline_sink (sink)


				  INSERT INTO test_pipeline_sink SELECT * FROM test_pipeline_stream;

				 done
				 failed
				  Pipeline creation failed [code: 1000]

				  Stream and sink were created, but pipeline creation failed.

				  You can create the pipeline later with: wrangler pipelines create
				  Your stream "test_pipeline_stream" and sink "test_pipeline_sink" are ready."
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});
	});

	describe("rolling policy validation", () => {
		it("validates file size minimum", async () => {
			setIsTTY(true);

			mockSinkDialogs("r2", "advanced");

			mockPrompt({
				text: "R2 bucket name (will be created if it doesn't exist):",
				result: "test-bucket",
			});
			mockGetR2Bucket("test-bucket", true);

			mockPrompt({
				text: "The base prefix in your bucket where data will be written (optional):",
				result: "",
			});
			mockPrompt({
				text: "Time partition pattern (optional):",
				result: "year=%Y/month=%m/day=%d",
			});
			mockSelect({
				text: "Output format:",
				result: "json",
			});
			mockPrompt({
				text: "Roll file when size reaches (MB, minimum 5):",
				result: "2",
			});
			mockConfirm({
				text: "Would you like to try again?",
				result: false,
			});

			await expect(
				runWrangler('pipelines setup --name "test_pipeline"')
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: File size - cancelled]`
			);

			expect(std.err).toContain("File size must be a number >= 5");
		});

		it("validates interval minimum", async () => {
			setIsTTY(true);

			mockSinkDialogs("r2", "advanced");

			mockPrompt({
				text: "R2 bucket name (will be created if it doesn't exist):",
				result: "test-bucket",
			});
			mockGetR2Bucket("test-bucket", true);

			mockPrompt({
				text: "The base prefix in your bucket where data will be written (optional):",
				result: "",
			});
			mockPrompt({
				text: "Time partition pattern (optional):",
				result: "year=%Y/month=%m/day=%d",
			});
			mockSelect({
				text: "Output format:",
				result: "json",
			});
			mockPrompt({
				text: "Roll file when size reaches (MB, minimum 5):",
				result: "100",
			});
			mockPrompt({
				text: "Roll file when time reaches (seconds, minimum 10):",
				result: "5",
			});
			mockConfirm({
				text: "Would you like to try again?",
				result: false,
			});

			await expect(
				runWrangler('pipelines setup --name "test_pipeline"')
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Interval - cancelled]`
			);

			expect(std.err).toContain("Interval must be a number >= 10");
		});
	});

	describe("Data Catalog sink configuration", () => {
		it("enables catalog when not already enabled", async () => {
			setIsTTY(true);

			mockSinkDialogs("r2_data_catalog", "simple");

			mockPrompt({
				text: "R2 bucket name (will be created if it doesn't exist):",
				result: "test-bucket",
			});
			mockGetR2Bucket("test-bucket", true);
			mockGetR2Catalog("test-bucket", { exists: false });
			mockEnableR2Catalog("test-bucket");

			mockPrompt({
				text: "Table name (e.g. events, user_activity):",
				result: "",
			});
			mockConfirm({
				text: "Would you like to try again?",
				result: false,
			});

			await expect(
				runWrangler('pipelines setup --name "test_pipeline"')
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Table name - cancelled]`
			);

			expect(std.out).toContain("done");
		});

		it("shows already enabled message when catalog is active", async () => {
			setIsTTY(true);

			mockSinkDialogs("r2_data_catalog", "simple");

			mockPrompt({
				text: "R2 bucket name (will be created if it doesn't exist):",
				result: "test-bucket",
			});
			mockGetR2Bucket("test-bucket", true);
			mockGetR2Catalog("test-bucket", { exists: true, active: true });

			mockPrompt({
				text: "Table name (e.g. events, user_activity):",
				result: "",
			});
			mockConfirm({
				text: "Would you like to try again?",
				result: false,
			});

			await expect(
				runWrangler('pipelines setup --name "test_pipeline"')
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Table name - cancelled]`
			);

			expect(std.out).toContain("Data Catalog already enabled");
		});

		it("creates bucket when it does not exist", async () => {
			setIsTTY(true);

			mockSinkDialogs("r2_data_catalog", "simple");

			mockPrompt({
				text: "R2 bucket name (will be created if it doesn't exist):",
				result: "new-bucket",
			});
			mockGetR2Bucket("new-bucket", false);
			mockCreateR2Bucket("new-bucket");
			mockGetR2Catalog("new-bucket", { exists: false });
			mockEnableR2Catalog("new-bucket");

			mockPrompt({
				text: "Table name (e.g. events, user_activity):",
				result: "",
			});
			mockConfirm({
				text: "Would you like to try again?",
				result: false,
			});

			await expect(
				runWrangler('pipelines setup --name "test_pipeline"')
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Table name - cancelled]`
			);

			expect(std.out).toContain("done");
		});

		it("retries when catalog token validation fails", async () => {
			setIsTTY(true);

			mockSinkDialogs("r2_data_catalog", "simple");

			mockPrompt({
				text: "R2 bucket name (will be created if it doesn't exist):",
				result: "test-bucket",
			});
			mockGetR2Bucket("test-bucket", true);
			mockGetR2Catalog("test-bucket", { exists: true, active: true });

			mockPrompt({
				text: "Table name (e.g. events, user_activity):",
				result: "events",
			});
			mockPrompt({
				text: "Catalog API token:",
				result: "bad-token",
			});
			mockUpsertR2CatalogCredential("test-bucket", { fail: true });
			mockConfirm({
				text: "Would you like to try again?",
				result: true,
			});
			mockPrompt({
				text: "Catalog API token:",
				result: "",
			});
			mockConfirm({
				text: "Would you like to try again?",
				result: false,
			});

			await expect(
				runWrangler('pipelines setup --name "test_pipeline"')
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Catalog API token - cancelled]`
			);

			expect(std.out).toContain("failed");
		});
	});

	describe("Advanced mode Data Catalog sink", () => {
		it("prompts for namespace and table name", async () => {
			setIsTTY(true);

			mockSinkDialogs("r2_data_catalog", "advanced");

			mockPrompt({
				text: "R2 bucket name (will be created if it doesn't exist):",
				result: "test-bucket",
			});
			mockGetR2Bucket("test-bucket", true);
			mockGetR2Catalog("test-bucket", { exists: true, active: true });

			mockPrompt({
				text: "Namespace:",
				result: "custom_namespace",
			});
			mockPrompt({
				text: "Table name:",
				result: "",
			});
			mockConfirm({
				text: "Would you like to try again?",
				result: false,
			});

			await expect(
				runWrangler('pipelines setup --name "test_pipeline"')
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Table name - cancelled]`
			);

			expect(std.out).toContain("Data Catalog already enabled");
		});
	});

	describe("Data Catalog full flow", () => {
		it("completes full setup from bucket to pipeline creation", async () => {
			setIsTTY(true);
			vi.useFakeTimers({ now: new Date("2025-01-01T00:00:00Z") });

			mockSinkDialogs("r2_data_catalog", "simple");

			mockPrompt({
				text: "R2 bucket name (will be created if it doesn't exist):",
				result: "test-bucket",
			});
			mockGetR2Bucket("test-bucket", true);
			mockGetR2Catalog("test-bucket", { exists: false });
			mockEnableR2Catalog("test-bucket");

			mockPrompt({
				text: "Table name (e.g. events, user_activity):",
				result: "events",
			});
			mockPrompt({
				text: "Catalog API token:",
				result: "test-catalog-token",
			});
			mockUpsertR2CatalogCredential("test-bucket");

			mockConfirm({
				text: "Create resources?",
				result: true,
			});

			mockCreateStreamRequest("test_pipeline_stream");
			mockCreateSinkRequest("test_pipeline_sink");

			mockSelect({
				text: "Query:",
				result: "simple",
			});

			const sql =
				"INSERT INTO test_pipeline_sink SELECT * FROM test_pipeline_stream;";
			mockValidateSql(sql);
			mockCreatePipeline("test_pipeline");

			await runWrangler('pipelines setup --name "test_pipeline"');

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Cloudflare Pipelines Setup


				STREAM


				SINK

				  Using existing bucket "test-bucket"
				 done

				  To create a Catalog API token:
				  Visit https://dash.cloudflare.com/some-account-id/r2/api-tokens/create?type=account
				  Create token with "Admin Read & Write" permissions

				 done

				SUMMARY

				  Stream    test_pipeline_stream
				            HTTP enabled, unstructured

				  Sink      test_pipeline_sink
				            Data Catalog → default/events

				 done
				 done

				SQL

				  Available tables:
				    test_pipeline_stream (source)
				    test_pipeline_sink (sink)


				  INSERT INTO test_pipeline_sink SELECT * FROM test_pipeline_stream;

				 done
				 done

				✓ Setup complete

				To access your new Pipeline in your Worker, add the following snippet to your configuration file:
				{
				  "pipelines": [
				    {
				      "pipeline": "stream_123",
				      "binding": "TEST_PIPELINE_STREAM"
				    }
				  ]
				}

				Then send events:

				  await env.TEST_PIPELINE_STREAM.send([{"user_id":"sample_user_id","event_name":"sample_event_name","timestamp":1735689600000}]);

				Or via HTTP:

				  curl -X POST https://pipelines.cloudflare.com/test_pipeline_stream /
				     -H "Content-Type: application/json" /
				     -d '[{"user_id":"sample_user_id","event_name":"sample_event_name","timestamp":1735689600000}]'

				Docs: https://developers.cloudflare.com/pipelines/
				"
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});
	});

	describe("SQL validation", () => {
		it("shows error and exits when validation fails and user declines retry", async () => {
			setIsTTY(true);

			mockSinkDialogs("r2", "advanced");

			mockPrompt({
				text: "R2 bucket name (will be created if it doesn't exist):",
				result: "test-bucket",
			});
			mockGetR2Bucket("test-bucket", true);
			mockAdvancedR2SinkPrompts();

			mockConfirm({
				text: "Create resources?",
				result: true,
			});

			mockCreateStreamRequest("test_pipeline_stream");
			mockCreateSinkRequest("test_pipeline_sink");

			mockSelect({
				text: "Query:",
				result: "simple",
			});

			const sql =
				"INSERT INTO test_pipeline_sink SELECT * FROM test_pipeline_stream;";
			mockValidateSql(sql, { fail: true });

			mockConfirm({
				text: "  SQL validation failed [code: 1000]\n\n  Retry with different SQL?",
				result: false,
			});

			await expect(
				runWrangler('pipelines setup --name "test_pipeline"')
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: SQL validation failed and setup cannot continue without valid pipeline SQL]`
			);

			expect(std.out).toContain("failed");
		});
	});
});
