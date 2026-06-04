import { describe, it } from "vitest";
import { convertToWranglerConfig } from "../convert";

describe("convertToWranglerConfig", () => {
	describe("top-level fields", () => {
		it("returns an empty object for an empty config", ({ expect }) => {
			expect(convertToWranglerConfig({})).toEqual({});
		});

		it("maps primitive top-level fields", ({ expect }) => {
			const result = convertToWranglerConfig({
				name: "my-worker",
				entrypoint: "./src/index.ts",
				accountId: "acc-123",
				compatibilityDate: "2026-01-01",
				compatibilityFlags: ["nodejs_compat"],
				workersDev: true,
				previewUrls: false,
				logpush: true,
				firstPartyWorker: false,
			});
			expect(result).toEqual({
				name: "my-worker",
				main: "./src/index.ts",
				account_id: "acc-123",
				compatibility_date: "2026-01-01",
				compatibility_flags: ["nodejs_compat"],
				workers_dev: true,
				preview_urls: false,
				logpush: true,
				first_party_worker: false,
			});
		});

		it("maps complianceRegion: 'fedramp-high' to 'fedramp_high'", ({
			expect,
		}) => {
			const result = convertToWranglerConfig({
				complianceRegion: "fedramp-high",
			});
			expect(result.compliance_region).toBe("fedramp_high");
		});

		it("passes complianceRegion: 'public' through unchanged", ({ expect }) => {
			const result = convertToWranglerConfig({ complianceRegion: "public" });
			expect(result.compliance_region).toBe("public");
		});

		it("passes placement through unchanged", ({ expect }) => {
			const result = convertToWranglerConfig({
				placement: { mode: "smart", hint: "iad" },
			});
			expect(result.placement).toEqual({ mode: "smart", hint: "iad" });
		});

		it("maps limits.cpuMs to limits.cpu_ms", ({ expect }) => {
			const result = convertToWranglerConfig({
				limits: { cpuMs: 50, subrequests: 100 },
			});
			expect(result.limits).toEqual({ cpu_ms: 50, subrequests: 100 });
		});

		it("converts observability camelCase to snake_case", ({ expect }) => {
			const result = convertToWranglerConfig({
				observability: {
					enabled: true,
					headSamplingRate: 0.5,
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
			});
			expect(result.observability).toEqual({
				enabled: true,
				head_sampling_rate: 0.5,
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
				convertToWranglerConfig({ cache: { enabled: true } }).cache
			).toEqual({ enabled: true });
		});

		it("maps unsafe.metadata directly", ({ expect }) => {
			const result = convertToWranglerConfig({
				unsafe: { metadata: { foo: "bar" } },
			});
			expect(result.unsafe).toEqual({ metadata: { foo: "bar" } });
		});

		it("maps unsafe.capnp basePath variant to snake_case", ({ expect }) => {
			const result = convertToWranglerConfig({
				unsafe: {
					capnp: {
						basePath: "/schemas",
						sourceSchemas: ["a.capnp", "b.capnp"],
					},
				},
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
				unsafe: { capnp: { compiledSchema: "compiled-blob" } },
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
				env: {
					MY_AI: { type: "ai" },
					MY_BROWSER: { type: "browser" },
					MY_IMAGES: { type: "images" },
					MY_MEDIA: { type: "media" },
					MY_STREAM: { type: "stream" },
					MY_VM: { type: "version-metadata" },
					MY_WEB_SEARCH: { type: "web-search" },
				},
			});
			expect(result.ai).toEqual({ binding: "MY_AI" });
			expect(result.browser).toEqual({ binding: "MY_BROWSER" });
			expect(result.images).toEqual({ binding: "MY_IMAGES" });
			expect(result.media).toEqual({ binding: "MY_MEDIA" });
			expect(result.stream).toEqual({ binding: "MY_STREAM" });
			expect(result.version_metadata).toEqual({ binding: "MY_VM" });
			expect(result.websearch).toEqual({ binding: "MY_WEB_SEARCH" });
		});

		it("includes the remote flag on singletons that support it", ({
			expect,
		}) => {
			const result = convertToWranglerConfig({
				env: { MY_AI: { type: "ai", remote: true } },
			});
			expect(result.ai).toEqual({ binding: "MY_AI", remote: true });
		});

		it("includes the remote flag on web-search", ({ expect }) => {
			const result = convertToWranglerConfig({
				env: { MY_WS: { type: "web-search", remote: true } },
			});
			expect(result.websearch).toEqual({
				binding: "MY_WS",
				remote: true,
			});
		});
	});

	describe("array bindings", () => {
		it("maps kv with id", ({ expect }) => {
			const result = convertToWranglerConfig({
				env: { MY_KV: { type: "kv", id: "abc", remote: true } },
			});
			expect(result.kv_namespaces).toEqual([
				{ binding: "MY_KV", id: "abc", remote: true },
			]);
		});

		it("maps multiple kv bindings", ({ expect }) => {
			const result = convertToWranglerConfig({
				env: {
					KV_1: { type: "kv" },
					KV_2: { type: "kv", id: "abc" },
				},
			});
			expect(result.kv_namespaces).toEqual([
				{ binding: "KV_1" },
				{ binding: "KV_2", id: "abc" },
			]);
		});

		it("maps d1 with id and name", ({ expect }) => {
			const result = convertToWranglerConfig({
				env: {
					MY_DB: { type: "d1", id: "db-id", name: "db-name" },
				},
			});
			expect(result.d1_databases).toEqual([
				{ binding: "MY_DB", database_id: "db-id", database_name: "db-name" },
			]);
		});

		it("maps r2 with name and jurisdiction", ({ expect }) => {
			const result = convertToWranglerConfig({
				env: {
					MY_R2: { type: "r2", name: "my-bucket", jurisdiction: "eu" },
				},
			});
			expect(result.r2_buckets).toEqual([
				{ binding: "MY_R2", bucket_name: "my-bucket", jurisdiction: "eu" },
			]);
		});

		it("maps vectorize.name to index_name", ({ expect }) => {
			const result = convertToWranglerConfig({
				env: { MY_VEC: { type: "vectorize", name: "my-index" } },
			});
			expect(result.vectorize).toEqual([
				{ binding: "MY_VEC", index_name: "my-index" },
			]);
		});

		it("maps mtlsCertificate.id to certificate_id", ({ expect }) => {
			const result = convertToWranglerConfig({
				env: { MY_MTLS: { type: "mtls-certificate", id: "cert-1" } },
			});
			expect(result.mtls_certificates).toEqual([
				{ binding: "MY_MTLS", certificate_id: "cert-1" },
			]);
		});

		it("maps hyperdrive with localConnectionString (camelCase)", ({
			expect,
		}) => {
			const result = convertToWranglerConfig({
				env: {
					HD: {
						type: "hyperdrive",
						id: "h-1",
						localConnectionString: "postgres://...",
					},
				},
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
				env: { MY_PIPE: { type: "pipeline", name: "pipe-1" } },
			});
			expect(result.pipelines).toEqual([
				{ binding: "MY_PIPE", stream: "pipe-1" },
			]);
		});

		it("maps flagship.id to app_id", ({ expect }) => {
			const result = convertToWranglerConfig({
				env: { F: { type: "flagship", id: "app-1" } },
			});
			expect(result.flagship).toEqual([{ binding: "F", app_id: "app-1" }]);
		});

		it("maps ai-search.name to instance_name", ({ expect }) => {
			const result = convertToWranglerConfig({
				env: { S: { type: "ai-search", name: "inst-1" } },
			});
			expect(result.ai_search).toEqual([
				{ binding: "S", instance_name: "inst-1" },
			]);
		});

		it("maps ai-search-namespace.namespace to namespace", ({ expect }) => {
			const result = convertToWranglerConfig({
				env: { N: { type: "ai-search-namespace", namespace: "ns-1" } },
			});
			expect(result.ai_search_namespaces).toEqual([
				{ binding: "N", namespace: "ns-1" },
			]);
		});

		it("maps agent-memory bindings with namespace", ({ expect }) => {
			const result = convertToWranglerConfig({
				env: {
					MEM: { type: "agent-memory", namespace: "ns-1", remote: true },
				},
			});
			expect(result.agent_memory).toEqual([
				{ binding: "MEM", namespace: "ns-1", remote: true },
			]);
		});

		it("maps multiple agent-memory bindings", ({ expect }) => {
			const result = convertToWranglerConfig({
				env: {
					MEM_1: { type: "agent-memory", namespace: "ns-1" },
					MEM_2: { type: "agent-memory", namespace: "ns-2" },
				},
			});
			expect(result.agent_memory).toEqual([
				{ binding: "MEM_1", namespace: "ns-1" },
				{ binding: "MEM_2", namespace: "ns-2" },
			]);
		});

		it("maps analytics-engine-dataset.name to dataset", ({ expect }) => {
			const result = convertToWranglerConfig({
				env: { AE: { type: "analytics-engine-dataset", name: "ds-1" } },
			});
			expect(result.analytics_engine_datasets).toEqual([
				{ binding: "AE", dataset: "ds-1" },
			]);
		});

		it("maps artifacts.namespace", ({ expect }) => {
			const result = convertToWranglerConfig({
				env: { A: { type: "artifacts", namespace: "ns-1" } },
			});
			expect(result.artifacts).toEqual([{ binding: "A", namespace: "ns-1" }]);
		});

		it("maps dispatch-namespace with outbound", ({ expect }) => {
			const result = convertToWranglerConfig({
				env: {
					DN: {
						type: "dispatch-namespace",
						namespace: "ns-1",
						outbound: { workerName: "out-worker", parameters: ["p1", "p2"] },
					},
				},
			});
			expect(result.dispatch_namespaces).toEqual([
				{
					binding: "DN",
					namespace: "ns-1",
					outbound: { service: "out-worker", parameters: ["p1", "p2"] },
				},
			]);
		});

		it("maps secrets-store-secret to store_id + secret_name", ({ expect }) => {
			const result = convertToWranglerConfig({
				env: {
					SS: {
						type: "secrets-store-secret",
						storeId: "store-1",
						secretName: "secret-1",
					},
				},
			});
			expect(result.secrets_store_secrets).toEqual([
				{ binding: "SS", store_id: "store-1", secret_name: "secret-1" },
			]);
		});

		it("maps send-email with all address fields", ({ expect }) => {
			const result = convertToWranglerConfig({
				env: {
					EM: {
						type: "send-email",
						destinationAddress: "dest@example.com",
						allowedDestinationAddresses: ["a@x.com", "b@x.com"],
						allowedSenderAddresses: ["sender@x.com"],
					},
				},
			});
			expect(result.send_email).toEqual([
				{
					name: "EM",
					destination_address: "dest@example.com",
					allowed_destination_addresses: ["a@x.com", "b@x.com"],
					allowed_sender_addresses: ["sender@x.com"],
				},
			]);
		});

		it("maps vpc-service.id to service_id", ({ expect }) => {
			const result = convertToWranglerConfig({
				env: { V: { type: "vpc-service", id: "svc-1" } },
			});
			expect(result.vpc_services).toEqual([
				{ binding: "V", service_id: "svc-1" },
			]);
		});

		it("maps vpc-network with tunnelId", ({ expect }) => {
			const result = convertToWranglerConfig({
				env: { V: { type: "vpc-network", tunnelId: "tun-1" } },
			});
			expect(result.vpc_networks).toEqual([
				{ binding: "V", tunnel_id: "tun-1" },
			]);
		});

		it("maps vpc-network with networkId", ({ expect }) => {
			const result = convertToWranglerConfig({
				env: { V: { type: "vpc-network", networkId: "net-1" } },
			});
			expect(result.vpc_networks).toEqual([
				{ binding: "V", network_id: "net-1" },
			]);
		});

		it("maps worker-loader to a worker_loaders entry", ({ expect }) => {
			const result = convertToWranglerConfig({
				env: { WL: { type: "worker-loader" } },
			});
			expect(result.worker_loaders).toEqual([{ binding: "WL" }]);
		});

		it("maps rate-limit to ratelimits with name + namespace_id + simple", ({
			expect,
		}) => {
			const result = convertToWranglerConfig({
				env: {
					RL: {
						type: "rate-limit",
						namespace: "ns-1",
						simple: { limit: 100, period: 60 },
					},
				},
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
				env: {
					W: {
						type: "worker",
						workerName: "other-worker",
						exportName: "MyEntry",
						props: { foo: "bar" },
						remote: true,
					},
				},
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
				env: {
					Q: { type: "queue", name: "q-1", deliveryDelay: 5 },
				},
			});
			expect(result.queues).toEqual({
				producers: [{ binding: "Q", queue: "q-1", delivery_delay: 5 }],
			});
		});

		it("maps durable-object binding to durable_objects.bindings", ({
			expect,
		}) => {
			const result = convertToWranglerConfig({
				env: {
					DO: {
						type: "durable-object",
						workerName: "other-worker",
						exportName: "MyDO",
					},
				},
			});
			expect(result.durable_objects).toEqual({
				bindings: [
					{ name: "DO", class_name: "MyDO", script_name: "other-worker" },
				],
			});
		});

		it("maps logfwdr binding to logfwdr.bindings", ({ expect }) => {
			const result = convertToWranglerConfig({
				env: { LF: { type: "logfwdr", destination: "dest-1" } },
			});
			expect(result.logfwdr).toEqual({
				bindings: [{ name: "LF", destination: "dest-1" }],
			});
		});

		it("maps unsafe binding with all fields", ({ expect }) => {
			const result = convertToWranglerConfig({
				env: {
					U: {
						type: "unsafe:my-custom",
						custom_field: "value-1",
						dev: {
							plugin: { package: "pkg", name: "plug" },
						},
					},
				},
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
				env: {
					CFG: { type: "json", value: { debug: true } },
					GREETING: { type: "text", value: "hello" },
					NUM: { type: "json", value: 42 },
				},
			});
			expect(result.vars).toEqual({
				CFG: { debug: true },
				GREETING: "hello",
				NUM: 42,
			});
		});

		it("collects secret bindings into secrets.required", ({ expect }) => {
			const result = convertToWranglerConfig({
				env: {
					A: { type: "secret" },
					B: { type: "secret" },
				},
			});
			expect(result.secrets).toEqual({ required: ["A", "B"] });
		});
	});

	describe("exports", () => {
		it("throws when sqlite durable-object exports are present", ({
			expect,
		}) => {
			expect(() =>
				convertToWranglerConfig({
					exports: {
						MyDO: { type: "durable-object", storage: "sqlite" },
					},
				})
			).toThrow(/Durable Object exports/);
		});

		it("throws when legacy-kv durable-object exports are present", ({
			expect,
		}) => {
			expect(() =>
				convertToWranglerConfig({
					exports: {
						LegacyDO: { type: "durable-object", storage: "legacy-kv" },
					},
				})
			).toThrow(/Durable Object exports/);
		});
	});

	describe("triggers", () => {
		it("maps scheduled triggers to triggers.crons", ({ expect }) => {
			const result = convertToWranglerConfig({
				triggers: [
					{ type: "scheduled", schedule: "0 * * * *" },
					{ type: "scheduled", schedule: "*/5 * * * *" },
				],
			});
			expect(result.triggers).toEqual({
				crons: ["0 * * * *", "*/5 * * * *"],
			});
		});

		it("maps fetch trigger with dot-zone to zone_name", ({ expect }) => {
			const result = convertToWranglerConfig({
				triggers: [
					{ type: "fetch", pattern: "example.com/*", zone: "example.com" },
				],
			});
			expect(result.routes).toEqual([
				{ pattern: "example.com/*", zone_name: "example.com" },
			]);
		});

		it("maps fetch trigger with non-dot zone to zone_id", ({ expect }) => {
			const result = convertToWranglerConfig({
				triggers: [
					{
						type: "fetch",
						pattern: "example.com/*",
						zone: "abc123zoneid",
					},
				],
			});
			expect(result.routes).toEqual([
				{ pattern: "example.com/*", zone_id: "abc123zoneid" },
			]);
		});

		it("maps fetch trigger without zone to pattern only", ({ expect }) => {
			const result = convertToWranglerConfig({
				triggers: [{ type: "fetch", pattern: "*/api/*" }],
			});
			expect(result.routes).toEqual(["*/api/*"]);
		});

		it("maps queue trigger to queues.consumers with snake_case fields", ({
			expect,
		}) => {
			const result = convertToWranglerConfig({
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
				env: { Q: { type: "queue", name: "p-queue" } },
				triggers: [{ type: "queue", name: "c-queue" }],
			});
			expect(result.queues).toEqual({
				producers: [{ binding: "Q", queue: "p-queue" }],
				consumers: [{ queue: "c-queue" }],
			});
		});
	});

	describe("domains", () => {
		it("converts each domain to a custom_domain route", ({ expect }) => {
			const result = convertToWranglerConfig({ domains: ["a.com", "b.com"] });
			expect(result.routes).toEqual([
				{ pattern: "a.com", custom_domain: true },
				{ pattern: "b.com", custom_domain: true },
			]);
		});

		it("appends fetch-trigger routes after domain routes", ({ expect }) => {
			const result = convertToWranglerConfig({
				triggers: [{ type: "fetch", pattern: "x.com/*", zone: "x.com" }],
				domains: ["y.com"],
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
				assets: {
					htmlHandling: "none",
					notFoundHandling: "404-page",
					runWorkerFirst: ["/api/*"],
				},
			});
			expect(result.assets).toEqual({
				html_handling: "none",
				not_found_handling: "404-page",
				run_worker_first: ["/api/*"],
			});
		});

		it("attaches the assets binding name when bindings.assets() is present", ({
			expect,
		}) => {
			const result = convertToWranglerConfig({
				env: { ASSETS: { type: "assets" } },
			});
			expect(result.assets).toEqual({ binding: "ASSETS" });
		});

		it("merges the top-level assets block with the assets binding name", ({
			expect,
		}) => {
			const result = convertToWranglerConfig({
				assets: { htmlHandling: "none" },
				env: { ASSETS: { type: "assets" } },
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
				tailConsumers: [{ workerName: "tail-worker" }],
			});
			expect(result.tail_consumers).toEqual([{ service: "tail-worker" }]);
			expect(result.streaming_tail_consumers).toBeUndefined();
		});

		it("maps streaming consumers to streaming_tail_consumers", ({ expect }) => {
			const result = convertToWranglerConfig({
				tailConsumers: [{ workerName: "stream-worker", streaming: true }],
			});
			expect(result.streaming_tail_consumers).toEqual([
				{ service: "stream-worker" },
			]);
			expect(result.tail_consumers).toBeUndefined();
		});

		it("splits a mixed list of consumers into the two arrays", ({ expect }) => {
			const result = convertToWranglerConfig({
				tailConsumers: [
					{ workerName: "a" },
					{ workerName: "b", streaming: true },
					{ workerName: "c", streaming: false },
				],
			});
			expect(result.tail_consumers).toEqual([
				{ service: "a" },
				{ service: "c" },
			]);
			expect(result.streaming_tail_consumers).toEqual([{ service: "b" }]);
		});
	});
});
