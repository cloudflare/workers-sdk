import { writeWranglerConfig } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, test } from "vitest";
import { normalizeOutput } from "../../../e2e/helpers/normalize";
import { collectCLIOutput } from "../helpers/collect-cli-output";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { msw, mswGetVersion } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";

describe("versions view", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const cnsl = mockConsoleMethods();
	const std = collectCLIOutput();

	describe("without wrangler.toml", () => {
		beforeEach(() => msw.use(mswGetVersion()));

		test("fails with no args", async ({ expect }) => {
			const result = runWrangler("versions view");

			await expect(result).rejects.toMatchInlineSnapshot(
				`[Error: Not enough non-option arguments: got 0, need at least 1]`
			);

			expect(std.out).toMatchInlineSnapshot(`""`);

			expect(normalizeOutput(std.err)).toMatchInlineSnapshot(`""`);
		});

		test("fails with --name arg only", async ({ expect }) => {
			const result = runWrangler("versions view --name test-name");

			await expect(result).rejects.toMatchInlineSnapshot(
				`[Error: Not enough non-option arguments: got 0, need at least 1]`
			);

			expect(std.out).toMatchInlineSnapshot(`""`);

			expect(normalizeOutput(std.err)).toMatchInlineSnapshot(`""`);
		});

		test("fails with positional version-id arg only", async ({ expect }) => {
			const result = runWrangler(
				"versions view 10000000-0000-0000-0000-000000000000"
			);

			await expect(result).rejects.toMatchInlineSnapshot(
				`[Error: You need to provide a name of your worker. Either pass it as a cli arg with \`--name <name>\` or in your config file as \`name = "<name>"\`]`
			);

			expect(std.out).toMatchInlineSnapshot(`""`);

			expect(normalizeOutput(std.err)).toMatchInlineSnapshot(`""`);
		});

		test("succeeds with positional version-id arg and --name arg", async ({
			expect,
		}) => {
			const result = runWrangler(
				"versions view 10000000-0000-0000-0000-000000000000 --name test-name"
			);

			await expect(result).resolves.toBeUndefined();

			expect(std.out).toMatchInlineSnapshot(`
				"Version ID:  10000000-0000-0000-0000-000000000000
				Created:     2021-01-01T00:00:00.000Z
				Author:      Jean-Luc-Picard@federation.org
				Source:      Upload
				Tag:         -
				Message:     -

				Handlers:             fetch, scheduled
				Compatibility Date:   2020-01-01
				Compatibility Flags:  test, flag
				"
			`);

			expect(cnsl.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Your Worker has access to the following bindings:
				Binding                                Resource
				env.KV (kv-namespace-id)               KV Namespace
				env.ANALYTICS (analytics_dataset)      Analytics Engine Dataset
				"
			`);

			expect(normalizeOutput(std.err)).toMatchInlineSnapshot(`""`);
		});

		test("prints version to stdout as --json", async ({ expect }) => {
			const result = runWrangler(
				"versions view 10000000-0000-0000-0000-000000000000 --name test-name --json"
			);

			await expect(result).resolves.toBeUndefined();

			expect(cnsl.out).not.toMatch(/⛅️ wrangler/);

			expect(std.out).toMatchInlineSnapshot(`
				"{
				  "id": "10000000-0000-0000-0000-000000000000",
				  "number": 1,
				  "annotations": {
				    "workers/triggered_by": "upload"
				  },
				  "metadata": {
				    "author_id": "Picard-Gamma-6-0-7-3",
				    "author_email": "Jean-Luc-Picard@federation.org",
				    "source": "wrangler",
				    "created_on": "2021-01-01T00:00:00.000000Z",
				    "modified_on": "2021-01-01T00:00:00.000000Z"
				  },
				  "resources": {
				    "bindings": [
				      {
				        "type": "analytics_engine",
				        "name": "ANALYTICS",
				        "dataset": "analytics_dataset"
				      },
				      {
				        "type": "kv_namespace",
				        "name": "KV",
				        "namespace_id": "kv-namespace-id"
				      }
				    ],
				    "script": {
				      "etag": "aaabbbccc",
				      "handlers": [
				        "fetch",
				        "scheduled"
				      ],
				      "last_deployed_from": "api"
				    },
				    "script_runtime": {
				      "compatibility_date": "2020-01-01",
				      "compatibility_flags": [
				        "test",
				        "flag"
				      ],
				      "usage_model": "standard",
				      "limits": {
				        "cpu_ms": 50
				      }
				    }
				  }
				}
				"
			`);
		});
	});

	describe("with wrangler.toml", () => {
		beforeEach(() => {
			msw.use(mswGetVersion());
			writeWranglerConfig();
		});

		test("fails with no args", async ({ expect }) => {
			const result = runWrangler("versions view");

			await expect(result).rejects.toMatchInlineSnapshot(
				`[Error: Not enough non-option arguments: got 0, need at least 1]`
			);

			expect(std.out).toMatchInlineSnapshot(`""`);

			expect(normalizeOutput(std.err)).toMatchInlineSnapshot(`""`);
		});

		test("succeeds with positional version-id arg only", async ({ expect }) => {
			const result = runWrangler(
				"versions view 10000000-0000-0000-0000-000000000000"
			);

			await expect(result).resolves.toBeUndefined();

			expect(std.out).toMatchInlineSnapshot(`
				"Version ID:  10000000-0000-0000-0000-000000000000
				Created:     2021-01-01T00:00:00.000Z
				Author:      Jean-Luc-Picard@federation.org
				Source:      Upload
				Tag:         -
				Message:     -

				Handlers:             fetch, scheduled
				Compatibility Date:   2020-01-01
				Compatibility Flags:  test, flag
				"
			`);
			expect(cnsl.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Your Worker has access to the following bindings:
				Binding                                Resource
				env.KV (kv-namespace-id)               KV Namespace
				env.ANALYTICS (analytics_dataset)      Analytics Engine Dataset
				"
			`);

			expect(normalizeOutput(std.err)).toMatchInlineSnapshot(`""`);
		});

		test("fails with non-existent version-id", async ({ expect }) => {
			const result = runWrangler(
				"versions view ffffffff-ffff-ffff-ffff-ffffffffffff"
			);

			await expect(result).rejects.toMatchInlineSnapshot(
				`[APIError: A request to the Cloudflare API (/accounts/some-account-id/workers/scripts/test-name/versions/ffffffff-ffff-ffff-ffff-ffffffffffff) failed.]`
			);

			expect(normalizeOutput(std.out)).toMatchInlineSnapshot(`""`);

			expect(normalizeOutput(std.err)).toMatchInlineSnapshot(`""`);
		});

		test("prints version to stdout as --json", async ({ expect }) => {
			const result = runWrangler(
				"versions view 10000000-0000-0000-0000-000000000000 --json"
			);

			await expect(result).resolves.toBeUndefined();

			expect(std.out).toMatchInlineSnapshot(`
				"{
				  "id": "10000000-0000-0000-0000-000000000000",
				  "number": 1,
				  "annotations": {
				    "workers/triggered_by": "upload"
				  },
				  "metadata": {
				    "author_id": "Picard-Gamma-6-0-7-3",
				    "author_email": "Jean-Luc-Picard@federation.org",
				    "source": "wrangler",
				    "created_on": "2021-01-01T00:00:00.000000Z",
				    "modified_on": "2021-01-01T00:00:00.000000Z"
				  },
				  "resources": {
				    "bindings": [
				      {
				        "type": "analytics_engine",
				        "name": "ANALYTICS",
				        "dataset": "analytics_dataset"
				      },
				      {
				        "type": "kv_namespace",
				        "name": "KV",
				        "namespace_id": "kv-namespace-id"
				      }
				    ],
				    "script": {
				      "etag": "aaabbbccc",
				      "handlers": [
				        "fetch",
				        "scheduled"
				      ],
				      "last_deployed_from": "api"
				    },
				    "script_runtime": {
				      "compatibility_date": "2020-01-01",
				      "compatibility_flags": [
				        "test",
				        "flag"
				      ],
				      "usage_model": "standard",
				      "limits": {
				        "cpu_ms": 50
				      }
				    }
				  }
				}
				"
			`);
		});
	});

	describe("test output", () => {
		test("no secrets, bindings or compat info is logged if not existing", async ({
			expect,
		}) => {
			msw.use(
				mswGetVersion({
					id: "ce15c78b-cc43-4f60-b5a9-15ce4f298c2a",
					metadata: {
						author_email: "test@test.com",
						author_id: "123",
						created_on: "2020-01-01T00:00:00Z",
						modified_on: "2020-01-01T00:00:00Z",
						source: "api",
					},
					number: 2,
					resources: {
						bindings: [],
						script: {
							etag: "etag",
							handlers: ["fetch", "queue"],
							last_deployed_from: "api",
						},
						script_runtime: {
							usage_model: "standard",
							limits: {},
						},
					},
				})
			);

			const result = runWrangler(
				"versions view 10000000-0000-0000-0000-000000000000 --name test"
			);

			await expect(result).resolves.toBeUndefined();

			expect(std.out).toMatchInlineSnapshot(`
				"Version ID:  ce15c78b-cc43-4f60-b5a9-15ce4f298c2a
				Created:     2020-01-01T00:00:00.000Z
				Author:      test@test.com
				Source:      API 📡
				Tag:         -
				Message:     -

				Handlers:  fetch, queue
				"
			`);
		});

		test("compat date is logged if provided", async ({ expect }) => {
			msw.use(
				mswGetVersion({
					id: "ce15c78b-cc43-4f60-b5a9-15ce4f298c2a",
					metadata: {
						author_email: "test@test.com",
						author_id: "123",
						created_on: "2020-01-01T00:00:00Z",
						modified_on: "2020-01-01T00:00:00Z",
						source: "api",
					},
					number: 2,
					resources: {
						bindings: [],
						script: {
							etag: "etag",
							handlers: ["fetch", "queue"],
							last_deployed_from: "api",
						},
						script_runtime: {
							compatibility_date: "2000-00-00",
							usage_model: "standard",
							limits: {},
						},
					},
				})
			);

			const result = runWrangler(
				"versions view 10000000-0000-0000-0000-000000000000 --name test"
			);

			await expect(result).resolves.toBeUndefined();

			expect(std.out).toMatchInlineSnapshot(`
				"Version ID:  ce15c78b-cc43-4f60-b5a9-15ce4f298c2a
				Created:     2020-01-01T00:00:00.000Z
				Author:      test@test.com
				Source:      API 📡
				Tag:         -
				Message:     -

				Handlers:            fetch, queue
				Compatibility Date:  2000-00-00
				"
			`);
		});

		test("compat flag is logged if provided", async ({ expect }) => {
			msw.use(
				mswGetVersion({
					id: "ce15c78b-cc43-4f60-b5a9-15ce4f298c2a",
					metadata: {
						author_email: "test@test.com",
						author_id: "123",
						created_on: "2020-01-01T00:00:00Z",
						modified_on: "2020-01-01T00:00:00Z",
						source: "api",
					},
					number: 2,
					resources: {
						bindings: [],
						script: {
							etag: "etag",
							handlers: ["fetch", "queue"],
							last_deployed_from: "api",
						},
						script_runtime: {
							compatibility_date: "2000-00-00",
							compatibility_flags: ["flag_1", "flag_2"],
							usage_model: "standard",
							limits: {},
						},
					},
				})
			);

			const result = runWrangler(
				"versions view 10000000-0000-0000-0000-000000000000 --name test"
			);

			await expect(result).resolves.toBeUndefined();

			expect(std.out).toMatchInlineSnapshot(`
				"Version ID:  ce15c78b-cc43-4f60-b5a9-15ce4f298c2a
				Created:     2020-01-01T00:00:00.000Z
				Author:      test@test.com
				Source:      API 📡
				Tag:         -
				Message:     -

				Handlers:             fetch, queue
				Compatibility Date:   2000-00-00
				Compatibility Flags:  flag_1, flag_2
				"
			`);
		});

		test("secrets are logged if provided", async ({ expect }) => {
			msw.use(
				mswGetVersion({
					id: "ce15c78b-cc43-4f60-b5a9-15ce4f298c2a",
					metadata: {
						author_email: "test@test.com",
						author_id: "123",
						created_on: "2020-01-01T00:00:00Z",
						modified_on: "2020-01-01T00:00:00Z",
						source: "api",
					},
					number: 2,
					resources: {
						bindings: [
							{ type: "secret_text", name: "SECRET_ONE", text: "" },
							{ type: "secret_text", name: "SECRET_TWO", text: "" },
						],
						script: {
							etag: "etag",
							handlers: ["fetch", "queue"],
							last_deployed_from: "api",
						},
						script_runtime: {
							compatibility_date: "2000-00-00",
							compatibility_flags: ["flag_1", "flag_2"],
							usage_model: "standard",
							limits: {},
						},
					},
				})
			);

			const result = runWrangler(
				"versions view 10000000-0000-0000-0000-000000000000 --name test"
			);

			await expect(result).resolves.toBeUndefined();

			expect(std.out).toMatchInlineSnapshot(`
				"Version ID:  ce15c78b-cc43-4f60-b5a9-15ce4f298c2a
				Created:     2020-01-01T00:00:00.000Z
				Author:      test@test.com
				Source:      API 📡
				Tag:         -
				Message:     -

				Handlers:             fetch, queue
				Compatibility Date:   2000-00-00
				Compatibility Flags:  flag_1, flag_2
				Secrets:
				Secret Name:  SECRET_ONE
				Secret Name:  SECRET_TWO
				"
			`);
		});

		test("env vars are logged if provided", async ({ expect }) => {
			msw.use(
				mswGetVersion({
					id: "ce15c78b-cc43-4f60-b5a9-15ce4f298c2a",
					metadata: {
						author_email: "test@test.com",
						author_id: "123",
						created_on: "2020-01-01T00:00:00Z",
						modified_on: "2020-01-01T00:00:00Z",
						source: "api",
					},
					number: 2,
					resources: {
						bindings: [
							{ type: "plain_text", name: "VAR_ONE", text: "var-one" },
							{ type: "plain_text", name: "VAR_TWO", text: "var-one" },
						],
						script: {
							etag: "etag",
							handlers: ["fetch", "queue"],
							last_deployed_from: "api",
						},
						script_runtime: {
							compatibility_date: "2000-00-00",
							compatibility_flags: ["flag_1", "flag_2"],
							usage_model: "standard",
							limits: {},
						},
					},
				})
			);

			const result = runWrangler(
				"versions view 10000000-0000-0000-0000-000000000000 --name test"
			);

			await expect(result).resolves.toBeUndefined();

			expect(std.out).toMatchInlineSnapshot(`
				"Version ID:  ce15c78b-cc43-4f60-b5a9-15ce4f298c2a
				Created:     2020-01-01T00:00:00.000Z
				Author:      test@test.com
				Source:      API 📡
				Tag:         -
				Message:     -

				Handlers:             fetch, queue
				Compatibility Date:   2000-00-00
				Compatibility Flags:  flag_1, flag_2
				"
			`);
		});

		test("bindings are logged if provided", async ({ expect }) => {
			msw.use(
				mswGetVersion({
					id: "ce15c78b-cc43-4f60-b5a9-15ce4f298c2a",
					metadata: {
						author_email: "test@test.com",
						author_id: "123",
						created_on: "2020-01-01T00:00:00Z",
						modified_on: "2020-01-01T00:00:00Z",
						source: "api",
					},
					number: 2,
					resources: {
						bindings: [
							{ type: "ai", name: "AI" },
							{ type: "analytics_engine", name: "AE", dataset: "datset" },
							{ type: "browser", name: "BROWSER" },
							{ type: "d1", name: "D1", id: "d1-id" },
							{
								type: "dispatch_namespace",
								name: "WFP",
								namespace: "wfp-namespace",
							},
							{
								type: "dispatch_namespace",
								name: "WFP_2",
								namespace: "wfp-namespace",
								outbound: { worker: { service: "outbound-worker" } },
							},
							{
								type: "dispatch_namespace",
								name: "WFP_3",
								namespace: "wfp-namespace",
								outbound: {
									worker: { service: "outbound-worker" },
									params: [{ name: "paramOne" }, { name: "paramTwo" }],
								},
							},
							{
								type: "durable_object_namespace",
								name: "DO",
								class_name: "DurableObject",
							},
							{
								type: "durable_object_namespace",
								name: "DO_2",
								class_name: "DurableObject",
								script_name: "other-worker",
							},
							{ type: "hyperdrive", name: "HYPERDRIVE", id: "hyperdrive-id" },
							{ type: "kv_namespace", name: "KV", namespace_id: "kv-id" },
							{
								type: "mtls_certificate",
								name: "MTLS",
								certificate_id: "mtls-id",
							},
							{ type: "queue", name: "QUEUE", queue_name: "queue" },
							{
								type: "queue",
								name: "QUEUE_2",
								queue_name: "queue",
								delivery_delay: 60,
							},
							{ type: "r2_bucket", name: "R2", bucket_name: "r2-bucket" },
							{
								type: "r2_bucket",
								name: "R2_2",
								bucket_name: "r2-bucket",
								jurisdiction: "eu",
							},
							{ type: "send_email", name: "MAIL" },
							{
								type: "send_email",
								name: "MAIL_2",
								destination_address: "dest@example.com",
							},
							{
								type: "send_email",
								name: "MAIL_3",
								destination_address: "dest@example.com",
								allowed_destination_addresses: ["1@a.com", "2@a.com"],
								allowed_sender_addresses: ["3@a.com", "4@a.com"],
							},
							{ type: "service", name: "SERVICE", service: "worker" },
							{
								type: "service",
								name: "SERVICE_2",
								service: "worker",
								entrypoint: "Enterypoint",
							},
							{ type: "vectorize", name: "VECTORIZE", index_name: "index" },
							{ type: "version_metadata", name: "VERSION_METADATA" },
						],
						script: {
							etag: "etag",
							handlers: ["fetch", "queue"],
							last_deployed_from: "api",
						},
						script_runtime: {
							compatibility_date: "2000-00-00",
							compatibility_flags: ["flag_1", "flag_2"],
							usage_model: "standard",
							limits: {},
						},
					},
				})
			);

			const result = runWrangler(
				"versions view 10000000-0000-0000-0000-000000000000 --name test"
			);

			await expect(result).resolves.toBeUndefined();

			expect(std.out).toMatchInlineSnapshot(`
				"Version ID:  ce15c78b-cc43-4f60-b5a9-15ce4f298c2a
				Created:     2020-01-01T00:00:00.000Z
				Author:      test@test.com
				Source:      API 📡
				Tag:         -
				Message:     -

				Handlers:             fetch, queue
				Compatibility Date:   2000-00-00
				Compatibility Flags:  flag_1, flag_2
				"
			`);
			expect(cnsl.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Your Worker has access to the following bindings:
				Binding                                                                  Resource
				env.DO (DurableObject)                                                   Durable Object
				env.DO_2 (DurableObject, defined in other-worker)                        Durable Object
				env.KV (kv-id)                                                           KV Namespace
				env.MAIL (unrestricted)                                                  Send Email
				env.MAIL_2 (dest@example.com)                                            Send Email
				env.MAIL_3 (dest@example.com - senders: 3@a.com, 4@a.com)                Send Email
				env.QUEUE (queue)                                                        Queue
				env.QUEUE_2 (queue)                                                      Queue
				env.D1 (d1-id)                                                           D1 Database
				env.VECTORIZE (index)                                                    Vectorize Index
				env.HYPERDRIVE (hyperdrive-id)                                           Hyperdrive Config
				env.R2 (r2-bucket)                                                       R2 Bucket
				env.R2_2 (r2-bucket (eu))                                                R2 Bucket
				env.SERVICE (worker)                                                     Worker
				env.SERVICE_2 (worker#Enterypoint)                                       Worker
				env.AE (datset)                                                          Analytics Engine Dataset
				env.BROWSER                                                              Browser
				env.AI                                                                   AI
				env.VERSION_METADATA                                                     Worker Version Metadata
				env.WFP (wfp-namespace)                                                  Dispatch Namespace
				env.WFP_2 (wfp-namespace (outbound -> outbound-worker))                  Dispatch Namespace
				env.WFP_3 (wfp-namespace (outbound -> outbound-worker))                  Dispatch Namespace
				env.MTLS (mtls-id)                                                       mTLS Certificate
				"
			`);
		});
	});
});
