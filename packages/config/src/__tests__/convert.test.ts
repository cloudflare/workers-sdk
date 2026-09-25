import { describe, it } from "vitest";
import { convertToWranglerConfig } from "../convert";
import type { ParsedInputConfig } from "../schema";

const baseWorker = {
	name: "my-worker",
	compatibilityDate: "2026-06-01",
} as const;

describe("convertToWranglerConfig", () => {
	describe("top-level fields", () => {
		it("maps primitive top-level fields", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					name: "my-worker",
					entrypoint: "./src/index.ts",
					compatibilityDate: "2026-01-01",
					compatibilityFlags: ["nodejs_compat"],
					workersDev: true,
					previewUrls: false,
					logpush: true,
					firstPartyWorker: false,
				},
				containers: [],
			});
			expect(result).toEqual({
				name: "my-worker",
				main: "./src/index.ts",
				compatibility_date: "2026-01-01",
				compatibility_flags: ["nodejs_compat"],
				workers_dev: true,
				preview_urls: false,
				logpush: true,
				first_party_worker: false,
			});
		});

		it("passes placement through unchanged", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					placement: { mode: "smart", hint: "iad" },
				},
				containers: [],
			});
			expect(result.placement).toEqual({ mode: "smart", hint: "iad" });
		});

		it("maps limits.cpuMs to limits.cpu_ms", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					limits: { cpuMs: 50, subrequests: 100 },
				},
				containers: [],
			});
			expect(result.limits).toEqual({ cpu_ms: 50, subrequests: 100 });
		});

		it("converts observability camelCase to snake_case", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					observability: {
						enabled: true,
						headSamplingRate: 0.5,
						redactQueryString: true,
						issues: { enabled: true },
						logs: {
							enabled: true,
							headSamplingRate: 0.25,
							invocationLogs: false,
							persist: true,
							destinations: ["d1"],
						},
						traces: {
							enabled: false,
							headSamplingRate: 0.1,
							persist: false,
							destinations: ["d2"],
						},
					},
				},
				containers: [],
			});
			expect(result.observability).toEqual({
				enabled: true,
				head_sampling_rate: 0.5,
				redact_query_string: true,
				issues: { enabled: true },
				logs: {
					enabled: true,
					head_sampling_rate: 0.25,
					invocation_logs: false,
					persist: true,
					destinations: ["d1"],
				},
				traces: {
					enabled: false,
					head_sampling_rate: 0.1,
					persist: false,
					destinations: ["d2"],
				},
			});
		});

		it("passes cache through unchanged", ({ expect }) => {
			expect(
				convertToWranglerConfig({
					worker: {
						...baseWorker,
						cache: { enabled: true },
					},
					containers: [],
				}).cache
			).toEqual({ enabled: true });
		});

		it("maps cross version cache to wrangler config", ({ expect }) => {
			expect(
				convertToWranglerConfig({
					worker: {
						...baseWorker,
						cache: { enabled: false, crossVersionCache: true },
					},
					containers: [],
				}).cache
			).toEqual({ enabled: false, cross_version_cache: true });
		});

		it("maps unsafe.metadata directly", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					unsafe: { metadata: { foo: "bar" } },
				},
				containers: [],
			});
			expect(result.unsafe).toEqual({ metadata: { foo: "bar" } });
		});

		it("maps unsafe.capnp basePath variant to snake_case", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					unsafe: {
						capnp: {
							basePath: "/schemas",
							sourceSchemas: ["a.capnp", "b.capnp"],
						},
					},
				},
				containers: [],
			});
			expect(result.unsafe).toEqual({
				capnp: {
					base_path: "/schemas",
					source_schemas: ["a.capnp", "b.capnp"],
				},
			});
		});

		it("maps unsafe.capnp compiledSchema variant to snake_case", ({
			expect,
		}) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					unsafe: { capnp: { compiledSchema: "compiled-blob" } },
				},
				containers: [],
			});
			expect(result.unsafe).toEqual({
				capnp: { compiled_schema: "compiled-blob" },
			});
		});
	});

	describe("singleton bindings", () => {
		it("maps each singleton binding to a {binding: name} entry", ({
			expect,
		}) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					env: {
						MY_AI: { type: "ai" },
						MY_BROWSER: { type: "browser" },
						MY_IMAGES: { type: "images" },
						MY_MEDIA: { type: "media" },
						MY_STREAM: { type: "stream" },
						MY_VM: { type: "version-metadata" },
					},
				},
				containers: [],
			});
			expect(result.ai).toEqual({ binding: "MY_AI" });
			expect(result.browser).toEqual({ binding: "MY_BROWSER" });
			expect(result.images).toEqual({ binding: "MY_IMAGES" });
			expect(result.media).toEqual({ binding: "MY_MEDIA" });
			expect(result.stream).toEqual({ binding: "MY_STREAM" });
			expect(result.version_metadata).toEqual({ binding: "MY_VM" });
		});

		it("includes the remote flag on singletons that support it", ({
			expect,
		}) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					env: { MY_AI: { type: "ai", dev: { remote: true } } },
				},
				containers: [],
			});
			expect(result.ai).toEqual({ binding: "MY_AI", remote: true });
		});
	});

	it("creates draft provisionable bindings", ({ expect }) => {
		const result = convertToWranglerConfig({
			worker: {
				...baseWorker,
				env: {
					QUEUE: { type: "queue" },
					DISPATCH: { type: "dispatch-namespace" },
					FLAGS: { type: "flagship" },
				},
			},
			containers: [],
		});

		expect(result.queues?.producers).toEqual([{ binding: "QUEUE" }]);
		expect(result.dispatch_namespaces).toEqual([{ binding: "DISPATCH" }]);
		expect(result.flagship).toEqual([{ binding: "FLAGS" }]);
	});

	describe("array bindings", () => {
		it("maps kv with id", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					env: {
						MY_KV: { type: "kv", id: "abc", dev: { remote: true } },
					},
				},
				containers: [],
			});
			expect(result.kv_namespaces).toEqual([
				{ binding: "MY_KV", id: "abc", remote: true },
			]);
		});

		it("maps multiple kv bindings", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					env: {
						KV_1: { type: "kv" },
						KV_2: { type: "kv", id: "abc" },
					},
				},
				containers: [],
			});
			expect(result.kv_namespaces).toEqual([
				{ binding: "KV_1" },
				{ binding: "KV_2", id: "abc" },
			]);
		});

		it("maps d1 with id and name", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					env: {
						MY_DB: { type: "d1", id: "db-id", name: "db-name" },
					},
				},
				containers: [],
			});
			expect(result.d1_databases).toEqual([
				{ binding: "MY_DB", database_id: "db-id", database_name: "db-name" },
			]);
		});

		it("maps r2 with name, jurisdiction, and dev S3 credentials", ({
			expect,
		}) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					env: {
						MY_R2: {
							type: "r2",
							name: "my-bucket",
							jurisdiction: "eu",
							dev: {
								experimentalS3Credentials: {
									accessKeyId: "access-key",
									secretAccessKey: "secret-key",
								},
							},
						},
					},
				},
				containers: [],
			});
			expect(result.r2_buckets).toEqual([
				{
					binding: "MY_R2",
					bucket_name: "my-bucket",
					jurisdiction: "eu",
					local_dev: {
						experimental_s3_credentials: {
							accessKeyId: "access-key",
							secretAccessKey: "secret-key",
						},
					},
				},
			]);
		});

		it("maps vectorize.name to index_name", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					env: { MY_VEC: { type: "vectorize", name: "my-index" } },
				},
				containers: [],
			});
			expect(result.vectorize).toEqual([
				{ binding: "MY_VEC", index_name: "my-index" },
			]);
		});

		it("maps mtlsCertificate.id to certificate_id", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					env: { MY_MTLS: { type: "mtls-certificate", id: "cert-1" } },
				},
				containers: [],
			});
			expect(result.mtls_certificates).toEqual([
				{ binding: "MY_MTLS", certificate_id: "cert-1" },
			]);
		});

		it("maps hyperdrive dev.connectionString", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					env: {
						HD: {
							type: "hyperdrive",
							id: "h-1",
							dev: { connectionString: "postgres://..." },
						},
					},
				},
				containers: [],
			});
			expect(result.hyperdrive).toEqual([
				{
					binding: "HD",
					id: "h-1",
					localConnectionString: "postgres://...",
				},
			]);
		});

		it("maps pipeline.name to stream", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					env: { MY_PIPE: { type: "pipeline", name: "pipe-1" } },
				},
				containers: [],
			});
			expect(result.pipelines).toEqual([
				{ binding: "MY_PIPE", stream: "pipe-1" },
			]);
		});

		it("maps flagship.id to app_id", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					env: { F: { type: "flagship", id: "app-1" } },
				},
				containers: [],
			});
			expect(result.flagship).toEqual([{ binding: "F", app_id: "app-1" }]);
		});

		it("preserves a draft flagship binding", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					env: { F: { type: "flagship" } },
				},
				containers: [],
			});
			expect(result.flagship).toEqual([{ binding: "F" }]);
		});

		it("maps ai-search.name to instance_name", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					env: { S: { type: "ai-search", name: "inst-1" } },
				},
				containers: [],
			});
			expect(result.ai_search).toEqual([
				{ binding: "S", instance_name: "inst-1" },
			]);
		});

		it("maps ai-search-namespace.namespace to namespace", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					env: { N: { type: "ai-search-namespace", namespace: "ns-1" } },
				},
				containers: [],
			});
			expect(result.ai_search_namespaces).toEqual([
				{ binding: "N", namespace: "ns-1" },
			]);
		});

		it("maps agent-memory bindings with namespace", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					env: {
						MEM: {
							type: "agent-memory",
							namespace: "ns-1",
							dev: { remote: true },
						},
					},
				},
				containers: [],
			});
			expect(result.agent_memory).toEqual([
				{ binding: "MEM", namespace: "ns-1", remote: true },
			]);
		});

		it("maps multiple agent-memory bindings", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					env: {
						MEM_1: { type: "agent-memory", namespace: "ns-1" },
						MEM_2: { type: "agent-memory", namespace: "ns-2" },
					},
				},
				containers: [],
			});
			expect(result.agent_memory).toEqual([
				{ binding: "MEM_1", namespace: "ns-1" },
				{ binding: "MEM_2", namespace: "ns-2" },
			]);
		});

		it("maps analytics-engine-dataset.name to dataset", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					env: { AE: { type: "analytics-engine-dataset", name: "ds-1" } },
				},
				containers: [],
			});
			expect(result.analytics_engine_datasets).toEqual([
				{ binding: "AE", dataset: "ds-1" },
			]);
		});

		it("maps artifacts.namespace", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					env: { A: { type: "artifacts", namespace: "ns-1" } },
				},
				containers: [],
			});
			expect(result.artifacts).toEqual([{ binding: "A", namespace: "ns-1" }]);
		});

		it("maps dispatch-namespace with outbound", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					env: {
						DN: {
							type: "dispatch-namespace",
							namespace: "ns-1",
							outbound: { worker: "out-worker", parameters: ["p1", "p2"] },
						},
					},
				},
				containers: [],
			});
			expect(result.dispatch_namespaces).toEqual([
				{
					binding: "DN",
					namespace: "ns-1",
					outbound: { service: "out-worker", parameters: ["p1", "p2"] },
				},
			]);
		});

		it("preserves a draft dispatch namespace binding", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					env: { DN: { type: "dispatch-namespace" } },
				},
				containers: [],
			});
			expect(result.dispatch_namespaces).toEqual([{ binding: "DN" }]);
		});

		it("maps secrets-store-secret to store_id + secret_name", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					env: {
						SS: {
							type: "secrets-store-secret",
							storeId: "store-1",
							secretName: "secret-1",
						},
					},
				},
				containers: [],
			});
			expect(result.secrets_store_secrets).toEqual([
				{ binding: "SS", store_id: "store-1", secret_name: "secret-1" },
			]);
		});

		it("maps send-email address restrictions", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					env: {
						EM_DESTINATION: {
							type: "send-email",
							destinationAddress: "dest@example.com",
							allowedSenderAddresses: ["sender@x.com"],
						},
						EM_ALLOWLIST: {
							type: "send-email",
							allowedDestinationAddresses: ["a@x.com", "b@x.com"],
							allowedSenderAddresses: ["sender@x.com"],
						},
					},
				},
				containers: [],
			});
			expect(result.send_email).toEqual([
				{
					name: "EM_DESTINATION",
					destination_address: "dest@example.com",
					allowed_sender_addresses: ["sender@x.com"],
				},
				{
					name: "EM_ALLOWLIST",
					allowed_destination_addresses: ["a@x.com", "b@x.com"],
					allowed_sender_addresses: ["sender@x.com"],
				},
			]);
		});

		it("maps vpc-service.id to service_id", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					env: { V: { type: "vpc-service", id: "svc-1" } },
				},
				containers: [],
			});
			expect(result.vpc_services).toEqual([
				{ binding: "V", service_id: "svc-1" },
			]);
		});

		it("maps vpc-network with tunnelId", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					env: { V: { type: "vpc-network", tunnelId: "tun-1" } },
				},
				containers: [],
			});
			expect(result.vpc_networks).toEqual([
				{ binding: "V", tunnel_id: "tun-1" },
			]);
		});

		it("maps vpc-network with networkId", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					env: { V: { type: "vpc-network", networkId: "net-1" } },
				},
				containers: [],
			});
			expect(result.vpc_networks).toEqual([
				{ binding: "V", network_id: "net-1" },
			]);
		});

		it("maps worker-loader to a worker_loaders entry", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					env: { WL: { type: "worker-loader" } },
				},
				containers: [],
			});
			expect(result.worker_loaders).toEqual([{ binding: "WL" }]);
		});

		it("maps rate-limit to ratelimits with name + namespace_id + simple", ({
			expect,
		}) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					env: {
						RL: {
							type: "rate-limit",
							namespace: "ns-1",
							simple: { limit: 100, period: 60 },
						},
					},
				},
				containers: [],
			});
			expect(result.ratelimits).toEqual([
				{
					name: "RL",
					namespace_id: "ns-1",
					simple: { limit: 100, period: 60 },
				},
			]);
		});

		it("maps worker binding to a services entry", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					env: {
						W: {
							type: "worker",
							worker: "other-worker",
							exportName: "MyEntry",
							props: { foo: "bar" },
							dev: { remote: true },
						},
					},
				},
				containers: [],
			});
			expect(result.services).toEqual([
				{
					binding: "W",
					service: "other-worker",
					entrypoint: "MyEntry",
					props: { foo: "bar" },
					remote: true,
				},
			]);
		});

		it("maps queue binding to queues.producers", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					env: {
						Q: { type: "queue", name: "q-1", deliveryDelay: 5 },
					},
				},
				containers: [],
			});
			expect(result.queues).toEqual({
				producers: [{ binding: "Q", queue: "q-1", delivery_delay: 5 }],
			});
		});

		it("preserves a draft queue binding", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					env: { Q: { type: "queue" } },
				},
				containers: [],
			});
			expect(result.queues).toEqual({ producers: [{ binding: "Q" }] });
		});

		it("maps durable-object binding to durable_objects.bindings", ({
			expect,
		}) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					env: {
						DO: {
							type: "durable-object",
							worker: "other-worker",
							exportName: "MyDO",
						},
					},
				},
				containers: [],
			});
			expect(result.durable_objects).toEqual({
				bindings: [
					{ name: "DO", class_name: "MyDO", script_name: "other-worker" },
				],
			});
		});

		it("maps durable-object retry policy to Wrangler's shape", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					env: {
						CONFIGURED: {
							type: "durable-object",
							worker: "other-worker",
							exportName: "MyDO",
							retry: { maxAttempts: 0, timeoutMs: 500 },
						},
						PARTIAL: {
							type: "durable-object",
							worker: "other-worker",
							exportName: "MyDO",
							retry: { timeoutMs: 12_345 },
						},
					},
				},
				containers: [],
			});
			expect(result.durable_objects?.bindings).toStrictEqual([
				{
					name: "CONFIGURED",
					class_name: "MyDO",
					script_name: "other-worker",
					retry: { max_attempts: 0, timeout_ms: 500 },
				},
				{
					name: "PARTIAL",
					class_name: "MyDO",
					script_name: "other-worker",
					retry: { timeout_ms: 12_345 },
				},
			]);
		});

		it("maps logfwdr binding to logfwdr.bindings", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					env: { LF: { type: "logfwdr", destination: "dest-1" } },
				},
				containers: [],
			});
			expect(result.logfwdr).toEqual({
				bindings: [{ name: "LF", destination: "dest-1" }],
			});
		});

		it("maps unsafe binding with all fields", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					env: {
						U: {
							type: "unsafe:my-custom",
							custom_field: "value-1",
							dev: {
								plugin: { package: "pkg", name: "plug" },
							},
						},
					},
				},
				containers: [],
			});
			expect(result.unsafe).toEqual({
				bindings: [
					{
						name: "U",
						type: "my-custom",
						custom_field: "value-1",
						dev: { plugin: { package: "pkg", name: "plug" } },
					},
				],
			});
		});
	});

	describe("vars and secrets", () => {
		it("merges multiple json and text bindings into a single vars object", ({
			expect,
		}) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					env: {
						CFG: { type: "json", value: { debug: true } },
						GREETING: { type: "text", value: "hello" },
						NUM: { type: "json", value: 42 },
					},
				},
				containers: [],
			});
			expect(result.vars).toEqual({
				CFG: { debug: true },
				GREETING: "hello",
				NUM: 42,
			});
		});

		it("collects secret bindings into secrets.required", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					env: {
						A: { type: "secret" },
						B: { type: "secret" },
					},
				},
				containers: [],
			});
			expect(result.secrets).toEqual({ required: ["A", "B"] });
		});
	});

	describe("exports", () => {
		it("converts a sqlite durable-object export to the wrangler shape (no `state` when default)", ({
			expect,
		}) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					exports: {
						MyDO: { type: "durable-object", storage: "sqlite" },
					},
				},
				containers: [],
			});
			expect((result as { exports?: unknown }).exports).toEqual({
				MyDO: { type: "durable-object", storage: "sqlite" },
			});
		});

		it("passes a legacy-kv storage value through to the wrangler shape", ({
			expect,
		}) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					exports: {
						LegacyDO: { type: "durable-object", storage: "legacy-kv" },
					},
				},
				containers: [],
			});
			expect((result as { exports?: unknown }).exports).toEqual({
				LegacyDO: { type: "durable-object", storage: "legacy-kv" },
			});
		});

		it("converts an attached container on a live durable-object export", ({
			expect,
		}) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					exports: {
						MyDO: {
							type: "durable-object",
							storage: "sqlite",
							container: "my-container",
						},
					},
				},
				containers: [],
			});
			expect((result as { exports?: unknown }).exports).toEqual({
				MyDO: {
					type: "durable-object",
					storage: "sqlite",
					container: "my-container",
				},
			});
		});

		it("converts an attached container on an expecting-transfer export", ({
			expect,
		}) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					exports: {
						Incoming: {
							type: "durable-object",
							state: "expecting-transfer",
							storage: "sqlite",
							transferFrom: "source-worker",
							container: "my-container",
						},
					},
				},
				containers: [],
			});
			expect((result as { exports?: unknown }).exports).toEqual({
				Incoming: {
					type: "durable-object",
					state: "expecting-transfer",
					storage: "sqlite",
					transfer_from: "source-worker",
					container: "my-container",
				},
			});
		});

		it('treats an explicit `state: "created"` like the default and omits it on the wire', ({
			expect,
		}) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					exports: {
						MyDO: {
							type: "durable-object",
							state: "created",
							storage: "sqlite",
						},
					},
				},
				containers: [],
			});
			expect((result as { exports?: unknown }).exports).toEqual({
				MyDO: { type: "durable-object", storage: "sqlite" },
			});
		});

		it("converts a deleted tombstone to the (type, state) wrangler shape", ({
			expect,
		}) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					exports: {
						OldClass: { type: "durable-object", state: "deleted" },
					},
				},
				containers: [],
			});
			expect((result as { exports?: unknown }).exports).toEqual({
				OldClass: { type: "durable-object", state: "deleted" },
			});
		});

		it("converts a renamed tombstone (camelCase `renamedTo` -> snake_case `renamed_to`)", ({
			expect,
		}) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					exports: {
						OldName: {
							type: "durable-object",
							state: "renamed",
							renamedTo: "NewName",
						},
					},
				},
				containers: [],
			});
			expect((result as { exports?: unknown }).exports).toEqual({
				OldName: {
					type: "durable-object",
					state: "renamed",
					renamed_to: "NewName",
				},
			});
		});

		it("converts a transferred tombstone (camelCase `transferredTo` -> snake_case `transferred_to`)", ({
			expect,
		}) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					exports: {
						Movee: {
							type: "durable-object",
							state: "transferred",
							transferredTo: "target-worker",
						},
					},
				},
				containers: [],
			});
			expect((result as { exports?: unknown }).exports).toEqual({
				Movee: {
					type: "durable-object",
					state: "transferred",
					transferred_to: "target-worker",
				},
			});
		});

		it("converts an expecting-transfer entry (camelCase `transferFrom` -> snake_case `transfer_from`)", ({
			expect,
		}) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					exports: {
						Incoming: {
							type: "durable-object",
							state: "expecting-transfer",
							storage: "sqlite",
							transferFrom: "source-worker",
						},
					},
				},
				containers: [],
			});
			expect((result as { exports?: unknown }).exports).toEqual({
				Incoming: {
					type: "durable-object",
					state: "expecting-transfer",
					storage: "sqlite",
					transfer_from: "source-worker",
				},
			});
		});

		it("passes worker export cache config through", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					exports: {
						default: {
							type: "worker",
							cache: { enabled: false },
						},
						Admin: { type: "worker", cache: { enabled: true } },
					},
				},
				containers: [],
			});

			expect((result as { exports?: unknown }).exports).toEqual({
				default: { type: "worker", cache: { enabled: false } },
				Admin: { type: "worker", cache: { enabled: true } },
			});
		});

		it("passes mixed Durable Object and worker exports through", ({
			expect,
		}) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					exports: {
						Counter: { type: "durable-object", storage: "sqlite" },
						Admin: { type: "worker", cache: { enabled: true } },
					},
				},
				containers: [],
			});

			expect((result as { exports?: unknown }).exports).toEqual({
				Counter: { type: "durable-object", storage: "sqlite" },
				Admin: { type: "worker", cache: { enabled: true } },
			});
		});

		it("converts workflow export retention to snake_case", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					exports: {
						GreetingWorkflow: { type: "workflow", name: "greeting" },
						BatchWorkflow: {
							type: "workflow",
							name: "batch",
							limits: { steps: 10 },
							concurrency: { limit: 2 },
							schedules: "0 * * * *",
							defaultRetention: {
								successRetention: "3 days",
								errorRetention: 86_400_000,
							},
						},
					},
				},
				containers: [],
			});

			expect((result as { exports?: unknown }).exports).toEqual({
				GreetingWorkflow: { type: "workflow", name: "greeting" },
				BatchWorkflow: {
					type: "workflow",
					name: "batch",
					limits: { steps: 10 },
					concurrency: { limit: 2 },
					schedules: "0 * * * *",
					default_retention: {
						success_retention: "3 days",
						error_retention: 86_400_000,
					},
				},
			});
		});

		it("emits no exports key when the map is empty", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					exports: {},
				},
				containers: [],
			});
			expect("exports" in (result as object)).toBe(false);
		});

		it("throws when an export has an unknown type", ({ expect }) => {
			const config = {
				...baseWorker,
				exports: {
					FutureExport: { type: "future" },
				},
			} as unknown as NonNullable<ParsedInputConfig["worker"]>;

			expect(() =>
				convertToWranglerConfig({ worker: config, containers: [] })
			).toThrow(/Unknown export types found: - FutureExport : future/);
		});
	});

	describe("triggers", () => {
		it("maps email triggers to addresses", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					triggers: [
						{
							type: "email",
							addresses: ["support@example.com", "*@example.com"],
						},
					],
				},
				containers: [],
			});
			expect(result.addresses).toEqual([
				"support@example.com",
				"*@example.com",
			]);
		});

		it("preserves empty email trigger addresses", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					triggers: [{ type: "email", addresses: [] }],
				},
				containers: [],
			});
			expect(result.addresses).toEqual([]);
		});

		it("maps scheduled triggers to triggers.crons", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					triggers: [
						{ type: "scheduled", schedule: "0 * * * *" },
						{ type: "scheduled", schedule: "*/5 * * * *" },
					],
				},
				containers: [],
			});
			expect(result.triggers).toEqual({
				crons: ["0 * * * *", "*/5 * * * *"],
			});
			expect(result.addresses).toBeUndefined();
		});

		it("maps fetch trigger with dot-zone to zone_name", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					triggers: [
						{ type: "fetch", pattern: "example.com/*", zone: "example.com" },
					],
				},
				containers: [],
			});
			expect(result.routes).toEqual([
				{ pattern: "example.com/*", zone_name: "example.com" },
			]);
		});

		it("maps fetch trigger with non-dot zone to zone_id", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					triggers: [
						{
							type: "fetch",
							pattern: "example.com/*",
							zone: "abc123zoneid",
						},
					],
				},
				containers: [],
			});
			expect(result.routes).toEqual([
				{ pattern: "example.com/*", zone_id: "abc123zoneid" },
			]);
		});

		it("maps fetch trigger without zone to pattern only", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					triggers: [{ type: "fetch", pattern: "*/api/*" }],
				},
				containers: [],
			});
			expect(result.routes).toEqual(["*/api/*"]);
		});

		it("maps queue trigger to queues.consumers with snake_case fields", ({
			expect,
		}) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					triggers: [
						{
							type: "queue",
							name: "q-1",
							deadLetterQueue: "dlq",
							maxBatchSize: 10,
							maxBatchTimeout: 30,
							maxConcurrency: 5,
							maxRetries: 3,
							retryDelay: 60,
							visibilityTimeoutMs: 1000,
						},
					],
				},
				containers: [],
			});
			expect(result.queues).toEqual({
				consumers: [
					{
						queue: "q-1",
						dead_letter_queue: "dlq",
						max_batch_size: 10,
						max_batch_timeout: 30,
						max_concurrency: 5,
						max_retries: 3,
						retry_delay: 60,
						visibility_timeout_ms: 1000,
					},
				],
			});
		});

		it("merges queue producers (from bindings) and consumers (from triggers) under a single queues object", ({
			expect,
		}) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					env: { Q: { type: "queue", name: "p-queue" } },
					triggers: [{ type: "queue", name: "c-queue" }],
				},
				containers: [],
			});
			expect(result.queues).toEqual({
				producers: [{ binding: "Q", queue: "p-queue" }],
				consumers: [{ queue: "c-queue" }],
			});
		});

		it("maps connect trigger to connect", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					triggers: [
						{
							type: "connect",
							protocol: "tcp",
							port: 5432,
							address: "127.0.0.1",
						},
					],
				},
				containers: [],
			});
			expect(result.connect).toEqual([
				{ protocol: "tcp", port: 5432, address: "127.0.0.1" },
			]);
		});

		it("maps UDP connect trigger to connect", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					triggers: [
						{
							type: "connect",
							protocol: "udp",
							port: 5432,
							idleTimeoutMs: 1_000,
							maxPendingBytes: 65_536,
						},
					],
				},
				containers: [],
			});
			expect(result.connect).toEqual([
				{
					protocol: "udp",
					port: 5432,
					idle_timeout_ms: 1_000,
					max_pending_bytes: 65_536,
				},
			]);
		});

		it("maps connect trigger without an address", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					triggers: [{ type: "connect", protocol: "tcp", port: 5432 }],
				},
				containers: [],
			});
			expect(result.connect).toEqual([{ protocol: "tcp", port: 5432 }]);
		});

		it("collects multiple connect triggers into a single connect array", ({
			expect,
		}) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					triggers: [
						{ type: "connect", protocol: "tcp", port: 5432 },
						{
							type: "connect",
							protocol: "tcp",
							port: 6379,
							address: "0.0.0.0",
						},
					],
				},
				containers: [],
			});
			expect(result.connect).toEqual([
				{ protocol: "tcp", port: 5432 },
				{ protocol: "tcp", port: 6379, address: "0.0.0.0" },
			]);
		});
	});

	describe("domains", () => {
		it("converts each domain to a custom_domain route", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					domains: ["a.com", "b.com"],
				},
				containers: [],
			});
			expect(result.routes).toEqual([
				{ pattern: "a.com", custom_domain: true },
				{ pattern: "b.com", custom_domain: true },
			]);
		});

		it("appends fetch-trigger routes after domain routes", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					triggers: [{ type: "fetch", pattern: "x.com/*", zone: "x.com" }],
					domains: ["y.com"],
				},
				containers: [],
			});
			expect(result.routes).toEqual([
				{ pattern: "y.com", custom_domain: true },
				{ pattern: "x.com/*", zone_name: "x.com" },
			]);
		});
	});

	describe("assets", () => {
		it("converts the top-level assets block to snake_case", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					assets: {
						htmlHandling: "none",
						notFoundHandling: "404-page",
						runWorkerFirst: ["/api/*"],
					},
				},
				containers: [],
			});
			expect(result.assets).toEqual({
				html_handling: "none",
				not_found_handling: "404-page",
				run_worker_first: ["/api/*"],
			});
		});

		it("attaches the assets binding name when an assets binding is present", ({
			expect,
		}) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					env: { ASSETS: { type: "assets" } },
				},
				containers: [],
			});
			expect(result.assets).toEqual({ binding: "ASSETS" });
		});

		it("merges the top-level assets block with the assets binding name", ({
			expect,
		}) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					assets: { htmlHandling: "none" },
					env: { ASSETS: { type: "assets" } },
				},
				containers: [],
			});
			expect(result.assets).toEqual({
				binding: "ASSETS",
				html_handling: "none",
			});
		});
	});

	describe("tail consumers", () => {
		it("maps non-streaming consumers to tail_consumers", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					tailConsumers: [{ worker: "tail-worker" }],
				},
				containers: [],
			});
			expect(result.tail_consumers).toEqual([{ service: "tail-worker" }]);
			expect(result.streaming_tail_consumers).toBeUndefined();
		});

		it("maps streaming consumers to streaming_tail_consumers", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					tailConsumers: [{ worker: "stream-worker", streaming: true }],
				},
				containers: [],
			});
			expect(result.streaming_tail_consumers).toEqual([
				{ service: "stream-worker" },
			]);
			expect(result.tail_consumers).toBeUndefined();
		});

		it("splits a mixed list of consumers into the two arrays", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: {
					...baseWorker,
					tailConsumers: [
						{ worker: "a" },
						{ worker: "b", streaming: true },
						{ worker: "c", streaming: false },
					],
				},
				containers: [],
			});
			expect(result.tail_consumers).toEqual([
				{ service: "a" },
				{ service: "c" },
			]);
			expect(result.streaming_tail_consumers).toEqual([{ service: "b" }]);
		});
	});

	describe("containers", () => {
		it("omits containers when no Container exports are provided", ({
			expect,
		}) => {
			const result = convertToWranglerConfig({
				worker: baseWorker,
				containers: [],
			});

			expect(result).not.toHaveProperty("containers");
		});

		it("converts standard Container exports to Wrangler containers", ({
			expect,
		}) => {
			const dockerfileContainer = {
				name: "dockerfile-container",
				image: {
					dockerfile: "./Dockerfile",
					buildContext: ".",
					buildVars: { VERSION: "1" },
				},
				maxInstances: 4,
				instanceType: {
					vcpu: 1,
					memoryMib: 1024,
					diskMb: 4000,
				},
				schedulingPolicy: "regional",
				ssh: { enabled: true, port: 2222 },
				authorizedKeys: [{ name: "deploy", publicKey: "ssh-ed25519 key" }],
				constraints: {
					regions: ["ENAM", "WEUR"],
					jurisdiction: "eu",
				},
				rollout: {
					kind: "full-auto",
					stepPercentage: [50, 100],
					activeGracePeriod: 30,
				},
				observability: {
					enabled: true,
					logs: { enabled: true },
					targetInstancePercentage: 50,
				},
				unsafe: { experimental: true },
			} satisfies ParsedInputConfig["containers"][number];
			const referencedContainer = {
				name: "referenced-container",
				image: { reference: "registry.example.com/image:tag" },
				maxInstances: 20,
				observability: {
					enabled: true,
					targetInstanceCount: 2,
				},
			} satisfies ParsedInputConfig["containers"][number];
			const result = convertToWranglerConfig({
				worker: baseWorker,
				containers: [dockerfileContainer, referencedContainer],
			});

			expect(result.containers).toEqual([
				{
					name: "dockerfile-container",
					image: "./Dockerfile",
					image_build_context: ".",
					image_vars: { VERSION: "1" },
					max_instances: 4,
					instance_type: {
						vcpu: 1,
						memory_mib: 1024,
						disk_mb: 4000,
					},
					scheduling_policy: "regional",
					ssh: { enabled: true, port: 2222 },
					authorized_keys: [{ name: "deploy", public_key: "ssh-ed25519 key" }],
					constraints: {
						regions: ["ENAM", "WEUR"],
						jurisdiction: "eu",
					},
					rollout_kind: "full_auto",
					rollout_step_percentage: [50, 100],
					rollout_active_grace_period: 30,
					observability: {
						enabled: true,
						logs: { enabled: true },
						target_instance_percentage: 50,
					},
					unsafe: { experimental: true },
				},
				{
					name: "referenced-container",
					image: "registry.example.com/image:tag",
					max_instances: 20,
					observability: {
						enabled: true,
						target_instance_count: 2,
					},
				},
			]);
		});

		it("converts Durable Object-managed Container exports", ({ expect }) => {
			const registryImage =
				"registry.cloudflare.com/account/base@sha256:" + "a".repeat(64);
			const result = convertToWranglerConfig({
				worker: baseWorker,
				containers: [
					{
						name: "managed-container",
						schedulingPolicy: "durable-object",
						images: {
							app: {
								dockerfile: "./Dockerfile",
								buildContext: "./container",
								buildVars: { VERSION: "1" },
							},
							base: { reference: registryImage },
						},
						observability: {
							enabled: true,
							logs: { enabled: false },
						},
						unsafe: {
							configuration: { experimental_flags: ["allow_fast_images"] },
						},
					},
				],
			});

			expect(result.containers).toEqual([
				{
					name: "managed-container",
					scheduling_policy: "durable_object",
					images: {
						app: {
							dockerfile: "./Dockerfile",
							build_context: "./container",
							build_vars: { VERSION: "1" },
						},
						base: { image: registryImage },
					},
					observability: {
						enabled: true,
						logs: { enabled: false },
					},
					unsafe: {
						configuration: { experimental_flags: ["allow_fast_images"] },
					},
				},
			]);
		});

		it("omits images for a Durable Object-managed Container without them", ({
			expect,
		}) => {
			const result = convertToWranglerConfig({
				worker: baseWorker,
				containers: [
					{
						name: "managed-container",
						schedulingPolicy: "durable-object",
					},
				],
			});

			expect(result.containers).toEqual([
				{
					name: "managed-container",
					scheduling_policy: "durable_object",
				},
			]);
		});
	});

	describe("settings", () => {
		it("maps accountId without requiring a Worker", ({ expect }) => {
			const result = convertToWranglerConfig({
				accountId: "acc-123",
				containers: [],
			});
			expect(result.account_id).toBe("acc-123");
		});

		it("maps complianceRegion: 'fedramp-high' to 'fedramp_high'", ({
			expect,
		}) => {
			const result = convertToWranglerConfig({
				complianceRegion: "fedramp-high",
				worker: baseWorker,
				containers: [],
			});
			expect(result.compliance_region).toBe("fedramp_high");
		});

		it("passes complianceRegion: 'public' through unchanged", ({ expect }) => {
			const result = convertToWranglerConfig({
				complianceRegion: "public",
				worker: baseWorker,
				containers: [],
			});
			expect(result.compliance_region).toBe("public");
		});

		it("sets no settings fields when none are provided", ({ expect }) => {
			const result = convertToWranglerConfig({
				worker: baseWorker,
				containers: [],
			});
			expect(result.account_id).toBeUndefined();
			expect(result.compliance_region).toBeUndefined();
		});
	});
});
