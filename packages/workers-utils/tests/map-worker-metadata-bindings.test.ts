import { describe, it } from "vitest";
import { mapWorkerMetadataBindings } from "../src/map-worker-metadata-bindings";
import type { WorkerMetadataBinding } from "../src/types";

describe("mapWorkerMetadataBindings", () => {
	it("returns an empty object for an empty bindings array", ({ expect }) => {
		const result = mapWorkerMetadataBindings([]);
		expect(result).toEqual({});
	});

	describe("vars", () => {
		it("maps plain_text binding to vars", ({ expect }) => {
			const bindings: WorkerMetadataBinding[] = [
				{ type: "plain_text", name: "MY_VAR", text: "hello world" },
			];
			const result = mapWorkerMetadataBindings(bindings);
			expect(result.vars).toEqual({ MY_VAR: "hello world" });
		});

		it("accumulates multiple plain_text bindings", ({ expect }) => {
			const bindings: WorkerMetadataBinding[] = [
				{ type: "plain_text", name: "VAR_A", text: "aaa" },
				{ type: "plain_text", name: "VAR_B", text: "bbb" },
			];
			const result = mapWorkerMetadataBindings(bindings);
			expect(result.vars).toEqual({ VAR_A: "aaa", VAR_B: "bbb" });
		});

		it("maps json binding to vars", ({ expect }) => {
			const bindings: WorkerMetadataBinding[] = [
				{
					type: "json",
					name: "MY_JSON",
					json: { key: "value" },
				},
			];
			const result = mapWorkerMetadataBindings(bindings);
			expect(result.vars).toEqual({
				MY_JSON: { key: "value" },
			});
		});
	});

	describe("kv_namespaces", () => {
		it("maps kv_namespace binding", ({ expect }) => {
			const bindings: WorkerMetadataBinding[] = [
				{
					type: "kv_namespace",
					name: "MY_KV",
					namespace_id: "kv-abc-123",
				},
			];
			const result = mapWorkerMetadataBindings(bindings);
			expect(result.kv_namespaces).toEqual([
				{ id: "kv-abc-123", binding: "MY_KV" },
			]);
		});

		it("accumulates multiple kv_namespace bindings", ({ expect }) => {
			const bindings: WorkerMetadataBinding[] = [
				{
					type: "kv_namespace",
					name: "KV_A",
					namespace_id: "ns-1",
				},
				{
					type: "kv_namespace",
					name: "KV_B",
					namespace_id: "ns-2",
				},
			];
			const result = mapWorkerMetadataBindings(bindings);
			expect(result.kv_namespaces).toHaveLength(2);
		});
	});

	describe("durable_objects", () => {
		it("maps durable_object_namespace binding", ({ expect }) => {
			const bindings: WorkerMetadataBinding[] = [
				{
					type: "durable_object_namespace",
					name: "MY_DO",
					class_name: "MyDurableObject",
					script_name: "my-worker",
					environment: "production",
				},
			];
			const result = mapWorkerMetadataBindings(bindings);
			expect(result.durable_objects).toEqual({
				bindings: [
					{
						name: "MY_DO",
						class_name: "MyDurableObject",
						script_name: "my-worker",
						environment: "production",
					},
				],
			});
		});

		it("accumulates multiple DO bindings", ({ expect }) => {
			const bindings: WorkerMetadataBinding[] = [
				{
					type: "durable_object_namespace",
					name: "DO_A",
					class_name: "ClassA",
				},
				{
					type: "durable_object_namespace",
					name: "DO_B",
					class_name: "ClassB",
				},
			];
			const result = mapWorkerMetadataBindings(bindings);
			expect(result.durable_objects?.bindings).toHaveLength(2);
		});
	});

	describe("d1_databases", () => {
		it("maps d1 binding", ({ expect }) => {
			const bindings: WorkerMetadataBinding[] = [
				{ type: "d1", name: "MY_DB", id: "db-456" },
			];
			const result = mapWorkerMetadataBindings(bindings);
			expect(result.d1_databases).toEqual([
				{ binding: "MY_DB", database_id: "db-456" },
			]);
		});
	});

	describe("r2_buckets", () => {
		it("maps r2_bucket binding", ({ expect }) => {
			const bindings: WorkerMetadataBinding[] = [
				{
					type: "r2_bucket",
					name: "MY_BUCKET",
					bucket_name: "my-bucket",
					jurisdiction: "eu",
				},
			];
			const result = mapWorkerMetadataBindings(bindings);
			expect(result.r2_buckets).toEqual([
				{
					binding: "MY_BUCKET",
					bucket_name: "my-bucket",
					jurisdiction: "eu",
				},
			]);
		});
	});

	describe("singleton bindings", () => {
		it("maps browser binding", ({ expect }) => {
			const bindings: WorkerMetadataBinding[] = [
				{ type: "browser", name: "BROWSER" },
			];
			const result = mapWorkerMetadataBindings(bindings);
			expect(result.browser).toEqual({ binding: "BROWSER" });
		});

		it("maps ai binding", ({ expect }) => {
			const bindings: WorkerMetadataBinding[] = [{ type: "ai", name: "AI" }];
			const result = mapWorkerMetadataBindings(bindings);
			expect(result.ai).toEqual({ binding: "AI" });
		});

		it("maps images binding", ({ expect }) => {
			const bindings: WorkerMetadataBinding[] = [
				{ type: "images", name: "IMAGES" },
			];
			const result = mapWorkerMetadataBindings(bindings);
			expect(result.images).toEqual({ binding: "IMAGES" });
		});

		it("maps stream binding", ({ expect }) => {
			const bindings: WorkerMetadataBinding[] = [
				{ type: "stream", name: "STREAM" },
			];
			const result = mapWorkerMetadataBindings(bindings);
			expect(result.stream).toEqual({ binding: "STREAM" });
		});

		it("maps media binding", ({ expect }) => {
			const bindings: WorkerMetadataBinding[] = [
				{ type: "media", name: "MEDIA" },
			];
			const result = mapWorkerMetadataBindings(bindings);
			expect(result.media).toEqual({ binding: "MEDIA" });
		});

		it("maps version_metadata binding", ({ expect }) => {
			const bindings: WorkerMetadataBinding[] = [
				{ type: "version_metadata", name: "VERSION" },
			];
			const result = mapWorkerMetadataBindings(bindings);
			expect(result.version_metadata).toEqual({ binding: "VERSION" });
		});
	});

	describe("services", () => {
		it("maps service binding", ({ expect }) => {
			const bindings: WorkerMetadataBinding[] = [
				{
					type: "service",
					name: "AUTH",
					service: "auth-worker",
					environment: "production",
					entrypoint: "AuthHandler",
				},
			];
			const result = mapWorkerMetadataBindings(bindings);
			expect(result.services).toEqual([
				{
					binding: "AUTH",
					service: "auth-worker",
					environment: "production",
					entrypoint: "AuthHandler",
				},
			]);
		});
	});

	describe("queues", () => {
		it("maps queue binding to queues.producers", ({ expect }) => {
			const bindings: WorkerMetadataBinding[] = [
				{
					type: "queue",
					name: "MY_QUEUE",
					queue_name: "my-queue",
					delivery_delay: 30,
				},
			];
			const result = mapWorkerMetadataBindings(bindings);
			expect(result.queues).toEqual({
				producers: [
					{
						binding: "MY_QUEUE",
						queue: "my-queue",
						delivery_delay: 30,
					},
				],
			});
		});

		it("accumulates multiple queue bindings", ({ expect }) => {
			const bindings: WorkerMetadataBinding[] = [
				{ type: "queue", name: "Q1", queue_name: "queue-1" },
				{ type: "queue", name: "Q2", queue_name: "queue-2" },
			];
			const result = mapWorkerMetadataBindings(bindings);
			expect(result.queues?.producers).toHaveLength(2);
		});
	});

	describe("vectorize", () => {
		it("maps vectorize binding", ({ expect }) => {
			const bindings: WorkerMetadataBinding[] = [
				{
					type: "vectorize",
					name: "MY_INDEX",
					index_name: "my-index",
				},
			];
			const result = mapWorkerMetadataBindings(bindings);
			expect(result.vectorize).toEqual([
				{ binding: "MY_INDEX", index_name: "my-index" },
			]);
		});
	});

	describe("hyperdrive", () => {
		it("maps hyperdrive binding", ({ expect }) => {
			const bindings: WorkerMetadataBinding[] = [
				{ type: "hyperdrive", name: "MY_HD", id: "hd-123" },
			];
			const result = mapWorkerMetadataBindings(bindings);
			expect(result.hyperdrive).toEqual([{ binding: "MY_HD", id: "hd-123" }]);
		});
	});

	describe("analytics_engine_datasets", () => {
		it("maps analytics_engine binding", ({ expect }) => {
			const bindings: WorkerMetadataBinding[] = [
				{
					type: "analytics_engine",
					name: "ANALYTICS",
					dataset: "my-dataset",
				},
			];
			const result = mapWorkerMetadataBindings(bindings);
			expect(result.analytics_engine_datasets).toEqual([
				{ binding: "ANALYTICS", dataset: "my-dataset" },
			]);
		});
	});

	describe("dispatch_namespaces", () => {
		it("maps dispatch_namespace binding without outbound", ({ expect }) => {
			const bindings: WorkerMetadataBinding[] = [
				{
					type: "dispatch_namespace",
					name: "DISPATCHER",
					namespace: "my-ns",
				},
			];
			const result = mapWorkerMetadataBindings(bindings);
			expect(result.dispatch_namespaces).toEqual([
				{ binding: "DISPATCHER", namespace: "my-ns" },
			]);
		});

		it("maps dispatch_namespace binding with outbound", ({ expect }) => {
			const bindings: WorkerMetadataBinding[] = [
				{
					type: "dispatch_namespace",
					name: "DISPATCHER",
					namespace: "my-ns",
					outbound: {
						worker: {
							service: "outbound-worker",
							environment: "production",
						},
						params: [{ name: "param1" }, { name: "param2" }],
					},
				},
			];
			const result = mapWorkerMetadataBindings(bindings);
			expect(result.dispatch_namespaces).toEqual([
				{
					binding: "DISPATCHER",
					namespace: "my-ns",
					outbound: {
						service: "outbound-worker",
						environment: "production",
						parameters: ["param1", "param2"],
					},
				},
			]);
		});
	});

	describe("logfwdr", () => {
		it("maps logfwdr binding", ({ expect }) => {
			const bindings: WorkerMetadataBinding[] = [
				{
					type: "logfwdr",
					name: "LOG",
					destination: "my-destination",
				},
			];
			const result = mapWorkerMetadataBindings(bindings);
			expect(result.logfwdr).toEqual({
				bindings: [{ name: "LOG", destination: "my-destination" }],
			});
		});
	});

	describe("blob bindings", () => {
		it("maps wasm_module binding", ({ expect }) => {
			const bindings: WorkerMetadataBinding[] = [
				{ type: "wasm_module", name: "WASM", part: "wasm-part" },
			];
			const result = mapWorkerMetadataBindings(bindings);
			expect(result.wasm_modules).toEqual({ WASM: "wasm-part" });
		});

		it("maps text_blob binding", ({ expect }) => {
			const bindings: WorkerMetadataBinding[] = [
				{ type: "text_blob", name: "TEXT", part: "text-part" },
			];
			const result = mapWorkerMetadataBindings(bindings);
			expect(result.text_blobs).toEqual({ TEXT: "text-part" });
		});

		it("maps data_blob binding", ({ expect }) => {
			const bindings: WorkerMetadataBinding[] = [
				{ type: "data_blob", name: "DATA", part: "data-part" },
			];
			const result = mapWorkerMetadataBindings(bindings);
			expect(result.data_blobs).toEqual({ DATA: "data-part" });
		});
	});

	describe("send_email", () => {
		it("maps send_email binding", ({ expect }) => {
			const bindings: WorkerMetadataBinding[] = [
				{
					type: "send_email",
					name: "EMAIL",
					destination_address: "test@example.com",
					allowed_destination_addresses: ["a@b.com", "c@d.com"],
					allowed_sender_addresses: ["sender@example.com"],
				},
			];
			const result = mapWorkerMetadataBindings(bindings);
			expect(result.send_email).toEqual([
				{
					name: "EMAIL",
					destination_address: "test@example.com",
					allowed_destination_addresses: ["a@b.com", "c@d.com"],
					allowed_sender_addresses: ["sender@example.com"],
				},
			]);
		});
	});

	describe("mtls_certificates", () => {
		it("maps mtls_certificate binding", ({ expect }) => {
			const bindings: WorkerMetadataBinding[] = [
				{
					type: "mtls_certificate",
					name: "CERT",
					certificate_id: "cert-123",
				},
			];
			const result = mapWorkerMetadataBindings(bindings);
			expect(result.mtls_certificates).toEqual([
				{ binding: "CERT", certificate_id: "cert-123" },
			]);
		});
	});

	describe("secrets_store_secrets", () => {
		it("maps secrets_store_secret binding", ({ expect }) => {
			const bindings: WorkerMetadataBinding[] = [
				{
					type: "secrets_store_secret",
					name: "SECRET",
					store_id: "store-1",
					secret_name: "my-secret",
				},
			];
			const result = mapWorkerMetadataBindings(bindings);
			expect(result.secrets_store_secrets).toEqual([
				{
					binding: "SECRET",
					store_id: "store-1",
					secret_name: "my-secret",
				},
			]);
		});
	});

	describe("artifacts", () => {
		it("maps artifacts binding", ({ expect }) => {
			const bindings: WorkerMetadataBinding[] = [
				{
					type: "artifacts",
					name: "ARTIFACTS",
					namespace: "my-artifacts",
				},
			];
			const result = mapWorkerMetadataBindings(bindings);
			expect(result.artifacts).toEqual([
				{ binding: "ARTIFACTS", namespace: "my-artifacts" },
			]);
		});
	});

	describe("unsafe_hello_world", () => {
		it("maps unsafe_hello_world binding", ({ expect }) => {
			const bindings: WorkerMetadataBinding[] = [
				{
					type: "unsafe_hello_world",
					name: "HELLO",
					enable_timer: true,
				},
			];
			const result = mapWorkerMetadataBindings(bindings);
			expect(result.unsafe_hello_world).toEqual([
				{ binding: "HELLO", enable_timer: true },
			]);
		});
	});

	describe("flagship", () => {
		it("maps flagship binding", ({ expect }) => {
			const bindings: WorkerMetadataBinding[] = [
				{
					type: "flagship",
					name: "FLAGS",
					app_id: "app-123",
				},
			];
			const result = mapWorkerMetadataBindings(bindings);
			expect(result.flagship).toEqual([
				{ binding: "FLAGS", app_id: "app-123" },
			]);
		});
	});

	describe("pipelines", () => {
		it("maps pipelines binding with stream", ({ expect }) => {
			const bindings: WorkerMetadataBinding[] = [
				{
					type: "pipelines",
					name: "PIPE",
					stream: "my-stream",
				},
			];
			const result = mapWorkerMetadataBindings(bindings);
			expect(result.pipelines).toEqual([
				{ binding: "PIPE", stream: "my-stream" },
			]);
		});

		it("maps pipelines binding with pipeline", ({ expect }) => {
			const bindings: WorkerMetadataBinding[] = [
				{
					type: "pipelines",
					name: "PIPE",
					pipeline: "my-pipeline",
				},
			];
			const result = mapWorkerMetadataBindings(bindings);
			expect(result.pipelines).toEqual([
				{ binding: "PIPE", pipeline: "my-pipeline" },
			]);
		});
	});

	describe("assets", () => {
		it("maps assets binding (PR #11339 fix)", ({ expect }) => {
			const bindings: WorkerMetadataBinding[] = [
				{ type: "assets", name: "ASSETS" },
			];
			const result = mapWorkerMetadataBindings(bindings);
			expect(result.assets).toEqual({ binding: "ASSETS" });
		});
	});

	describe("workflows", () => {
		it("maps workflow binding", ({ expect }) => {
			const bindings: WorkerMetadataBinding[] = [
				{
					type: "workflow",
					name: "MY_WORKFLOW",
					workflow_name: "my-wf",
					class_name: "MyWorkflow",
					script_name: "wf-worker",
				},
			];
			const result = mapWorkerMetadataBindings(bindings);
			expect(result.workflows).toEqual([
				{
					binding: "MY_WORKFLOW",
					name: "my-wf",
					class_name: "MyWorkflow",
					script_name: "wf-worker",
				},
			]);
		});
	});

	describe("worker_loaders", () => {
		it("maps worker_loader binding", ({ expect }) => {
			const bindings: WorkerMetadataBinding[] = [
				{ type: "worker_loader", name: "LOADER" },
			];
			const result = mapWorkerMetadataBindings(bindings);
			expect(result.worker_loaders).toEqual([{ binding: "LOADER" }]);
		});
	});

	describe("ratelimits", () => {
		it("maps ratelimit binding", ({ expect }) => {
			const bindings: WorkerMetadataBinding[] = [
				{
					type: "ratelimit",
					name: "RATE_LIMIT",
					namespace_id: "rl-ns-1",
					simple: { limit: 100, period: 60 },
				},
			];
			const result = mapWorkerMetadataBindings(bindings);
			expect(result.ratelimits).toEqual([
				{
					name: "RATE_LIMIT",
					namespace_id: "rl-ns-1",
					simple: { limit: 100, period: 60 },
				},
			]);
		});
	});

	describe("vpc_services", () => {
		it("maps vpc_service binding", ({ expect }) => {
			const bindings: WorkerMetadataBinding[] = [
				{
					type: "vpc_service",
					name: "VPC",
					service_id: "svc-123",
				},
			];
			const result = mapWorkerMetadataBindings(bindings);
			expect(result.vpc_services).toEqual([
				{ binding: "VPC", service_id: "svc-123" },
			]);
		});
	});

	describe("vpc_networks", () => {
		it("maps vpc_network binding with tunnel_id", ({ expect }) => {
			const bindings: WorkerMetadataBinding[] = [
				{
					type: "vpc_network",
					name: "VPC_NET",
					tunnel_id: "tun-123",
				},
			];
			const result = mapWorkerMetadataBindings(bindings);
			expect(result.vpc_networks).toEqual([
				{ binding: "VPC_NET", tunnel_id: "tun-123" },
			]);
		});

		it("maps vpc_network binding with network_id", ({ expect }) => {
			const bindings: WorkerMetadataBinding[] = [
				{
					type: "vpc_network",
					name: "VPC_NET",
					network_id: "net-456",
				},
			];
			const result = mapWorkerMetadataBindings(bindings);
			expect(result.vpc_networks).toEqual([
				{ binding: "VPC_NET", network_id: "net-456" },
			]);
		});

		it("does not map vpc_network binding without tunnel_id or network_id", ({
			expect,
		}) => {
			const bindings: WorkerMetadataBinding[] = [
				{ type: "vpc_network", name: "VPC_NET" },
			];
			const result = mapWorkerMetadataBindings(bindings);
			expect(result.vpc_networks).toBeUndefined();
		});
	});

	describe("ai_search", () => {
		it("maps ai_search_namespace binding", ({ expect }) => {
			const bindings: WorkerMetadataBinding[] = [
				{
					type: "ai_search_namespace",
					name: "SEARCH_NS",
					namespace: "my-search-ns",
				},
			];
			const result = mapWorkerMetadataBindings(bindings);
			expect(result.ai_search_namespaces).toEqual([
				{ binding: "SEARCH_NS", namespace: "my-search-ns" },
			]);
		});

		it("maps ai_search binding", ({ expect }) => {
			const bindings: WorkerMetadataBinding[] = [
				{
					type: "ai_search",
					name: "SEARCH",
					instance_name: "my-instance",
				},
			];
			const result = mapWorkerMetadataBindings(bindings);
			expect(result.ai_search).toEqual([
				{ binding: "SEARCH", instance_name: "my-instance" },
			]);
		});
	});

	describe("secret_text filtering", () => {
		it("filters out secret_text bindings", ({ expect }) => {
			const bindings: WorkerMetadataBinding[] = [
				{ type: "secret_text", name: "SECRET", text: "s3cret" },
				{ type: "plain_text", name: "VAR", text: "public" },
			];
			const result = mapWorkerMetadataBindings(bindings);
			expect(result.vars).toEqual({ VAR: "public" });
			expect(JSON.stringify(result)).not.toContain("s3cret");
		});
	});

	describe("inherit binding", () => {
		it("maps inherit binding to unsafe", ({ expect }) => {
			const bindings: WorkerMetadataBinding[] = [
				{ type: "inherit", name: "INHERITED" },
			];
			const result = mapWorkerMetadataBindings(bindings);
			expect(result.unsafe).toEqual({
				bindings: [{ type: "inherit", name: "INHERITED" }],
				metadata: undefined,
			});
		});
	});

	describe("mixed bindings", () => {
		it("correctly combines multiple different binding types", ({ expect }) => {
			const bindings: WorkerMetadataBinding[] = [
				{ type: "plain_text", name: "VAR", text: "hello" },
				{
					type: "kv_namespace",
					name: "KV",
					namespace_id: "ns-1",
				},
				{
					type: "r2_bucket",
					name: "BUCKET",
					bucket_name: "bucket",
				},
				{ type: "ai", name: "AI" },
				{ type: "d1", name: "DB", id: "db-1" },
				{ type: "secret_text", name: "SECRET", text: "hidden" },
			];
			const result = mapWorkerMetadataBindings(bindings);

			expect(result.vars).toEqual({ VAR: "hello" });
			expect(result.kv_namespaces).toHaveLength(1);
			expect(result.r2_buckets).toHaveLength(1);
			expect(result.ai).toEqual({ binding: "AI" });
			expect(result.d1_databases).toHaveLength(1);
			// secret_text should be filtered out
			expect(JSON.stringify(result)).not.toContain("hidden");
		});
	});
});
