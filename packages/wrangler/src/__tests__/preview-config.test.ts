import { UserError } from "@cloudflare/workers-utils";
import { describe, test } from "vitest";
import {
	convertBinding,
	convertPreviewBaseToPreviewsConfig,
	convertPreviewSettings,
	convertProductionToPreviewsConfig,
	convertTopLevelSetting,
	getProductionBindingsExpectedInPreview,
} from "../preview/preview-config";
import type { PreviewTopLevelSettings } from "../preview/preview-config";
import type { Binding } from "@cloudflare/deploy-helpers";
import type { Config } from "@cloudflare/workers-utils";

function topLevelSettings(
	overrides: Partial<PreviewTopLevelSettings> = {}
): PreviewTopLevelSettings {
	return {
		define: undefined,
		observability: undefined,
		logpush: undefined,
		limits: undefined,
		placement: undefined,
		cache: undefined,
		containers: undefined,
		tail_consumers: undefined,
		streaming_tail_consumers: undefined,
		queues: undefined,
		triggers: undefined,
		...overrides,
	};
}

describe("Preview configuration conversion", () => {
	test("converts a broad supported configuration without production values", ({
		expect,
	}) => {
		const result = convertPreviewSettings(
			{
				TEXT: { type: "plain_text", text: "production-text" },
				JSON: { type: "json", json: { source: "production-json" } },
				BROWSER: { type: "browser" },
				AI: { type: "ai", staging: true },
				IMAGES: { type: "images" },
				STREAM: { type: "stream" },
				VERSION: { type: "version_metadata" },
				KV: { type: "kv_namespace", namespace_id: "production-kv" },
				MEDIA: { type: "media" },
				EMAIL: {
					type: "send_email",
					destination_address: "production@example.com",
				},
				QUEUE: { type: "queue", queue_name: "production-queue" },
				R2: {
					type: "r2_bucket",
					bucket_name: "production-bucket",
					jurisdiction: "eu",
				},
				D1: { type: "d1", database_id: "production-database" },
				VECTOR: { type: "vectorize", index_name: "production-index" },
				AI_SEARCH_NAMESPACE: {
					type: "ai_search_namespace",
					namespace: "production-search-namespace",
				},
				AI_SEARCH: {
					type: "ai_search",
					instance_name: "production-search-instance",
				},
				HYPERDRIVE: { type: "hyperdrive", id: "production-hyperdrive" },
				ANALYTICS: { type: "analytics_engine", dataset: "production-dataset" },
				DISPATCH: {
					type: "dispatch_namespace",
					namespace: "production-namespace",
				},
				MTLS: { type: "mtls_certificate", certificate_id: "production-cert" },
				PIPELINE: { type: "pipelines", stream: "production-stream" },
				SECRET: {
					type: "secrets_store_secret",
					store_id: "production-store",
					secret_name: "production-secret",
				},
				ARTIFACT: { type: "artifacts", namespace: "production-artifact" },
				FLAGS: { type: "flagship", app_id: "production-app" },
				LIMITER: {
					type: "ratelimit",
					namespace_id: "production-limiter",
					simple: { limit: 10, period: 60 },
				},
				VPC: { type: "vpc_service", service_id: "production-vpc" },
				LOADER: { type: "worker_loader" },
			},
			topLevelSettings({
				define: { API_URL: "production-url" },
				observability: {
					enabled: true,
					logs: { destinations: ["production-log-destination"] },
				},
				placement: { mode: "smart", hint: "production-hint" },
				tail_consumers: [{ service: "production-tail" }],
			}),
			true
		);

		expect(result.messages).toEqual([]);
		expect(result.blockingDeploymentMessages).toEqual([]);
		expect(Object.keys(result.config)).toEqual([
			"vars",
			"browser",
			"ai",
			"images",
			"stream",
			"version_metadata",
			"kv_namespaces",
			"media",
			"send_email",
			"queues",
			"r2_buckets",
			"d1_databases",
			"vectorize",
			"ai_search_namespaces",
			"ai_search",
			"hyperdrive",
			"analytics_engine_datasets",
			"dispatch_namespaces",
			"mtls_certificates",
			"pipelines",
			"secrets_store_secrets",
			"artifacts",
			"flagship",
			"ratelimits",
			"vpc_services",
			"worker_loaders",
			"define",
			"placement",
			"tail_consumers",
		]);
		expect(result.config).toMatchObject({
			vars: { TEXT: "<REPLACE_ME>", JSON: "<REPLACE_ME>" },
			ai: { binding: "AI", staging: true },
			kv_namespaces: [{ binding: "KV", id: "<REPLACE_ME>" }],
			r2_buckets: [
				{
					binding: "R2",
					bucket_name: "<REPLACE_ME>",
					jurisdiction: "eu",
				},
			],
			queues: {
				producers: [{ binding: "QUEUE", queue: "<REPLACE_ME>" }],
			},
			ai_search_namespaces: [
				{ binding: "AI_SEARCH_NAMESPACE", namespace: "<REPLACE_ME>" },
			],
			ai_search: [{ binding: "AI_SEARCH", instance_name: "<REPLACE_ME>" }],
			define: { API_URL: "<REPLACE_ME>" },
			placement: { mode: "smart", hint: "<REPLACE_ME>" },
			tail_consumers: [{ service: "<REPLACE_ME>" }],
		});
		expect(JSON.stringify(result)).not.toContain("production");
	});

	test("copies supported Preview Base configuration and blocks Durable Objects", ({
		expect,
	}) => {
		expect(
			convertPreviewBaseToPreviewsConfig({
				observability: {
					enabled: true,
					issues: { enabled: true },
					logs: { enabled: false },
				},
				logpush: false,
				limits: { subrequests: 100 },
				placement: { mode: "smart" },
				cache: { enabled: false },
				tail_consumers: [{ name: "preview-tail" }],
				env: {
					TEXT: { type: "plain_text", text: "preview-text" },
					D1: { type: "d1", database_id: "preview-database" },
					QUEUE: { type: "queue", queue_name: "preview-queue" },
					DO: { type: "durable_object_namespace", class_name: "PreviewDO" },
				},
			} as Parameters<typeof convertPreviewBaseToPreviewsConfig>[0])
		).toEqual({
			config: {
				observability: {
					enabled: true,
					issues: { enabled: true },
					logs: { enabled: false },
				},
				logpush: false,
				limits: { subrequests: 100 },
				placement: { mode: "smart" },
				cache: { enabled: false },
				tail_consumers: [{ service: "preview-tail" }],
				vars: { TEXT: "preview-text" },
				d1_databases: [{ binding: "D1", database_id: "preview-database" }],
				queues: {
					producers: [{ binding: "QUEUE", queue: "preview-queue" }],
				},
			},
			messages: [],
			blockingDeploymentMessages: [
				"This Worker uses Durable Objects. They are not included in the suggested Preview configuration.\nFollow the setup instructions so each Preview automatically gets a new, isolated Durable Object namespace:\nhttps://developers.cloudflare.com/workers/previews/resources/#durable-objects",
			],
		});
	});

	test("copies an Issues-only Preview Base observability configuration", ({
		expect,
	}) => {
		expect(
			convertPreviewBaseToPreviewsConfig({
				observability: { issues: { enabled: true } },
			} as Parameters<typeof convertPreviewBaseToPreviewsConfig>[0])
		).toEqual({
			config: {
				observability: { issues: { enabled: true } },
			},
			messages: [],
			blockingDeploymentMessages: [],
		});
	});

	test("returns one no-op outcome for ignored and incomplete bindings", ({
		expect,
	}) => {
		const ignoredBindings: Binding[] = [
			{ type: "inherit" },
			{ type: "secret_text" },
			{ type: "wasm_module" },
			{ type: "text_blob" },
			{ type: "data_blob" },
			{ type: "assets" },
			{ type: "unknown" },
			{ type: "kv_namespace" },
		];

		for (const binding of ignoredBindings) {
			expect(convertBinding("IGNORED", binding, true)).toEqual({});
		}
	});

	test("does not read ignored binding payloads", ({ expect }) => {
		const binding = Object.defineProperty(
			{ type: "secret_text" } as Binding,
			"text",
			{
				enumerable: true,
				get() {
					throw new Error("secret text must not be read");
				},
			}
		);

		expect(convertBinding("SECRET", binding, false)).toEqual({});
	});

	test("reports unsupported binding messages", ({ expect }) => {
		expect(convertBinding("WORKFLOW", { type: "workflow" }, true)).toEqual({
			bindingLimitationName: "Workflows",
		});
		expect(convertBinding("SERVICE", { type: "service" }, true)).toEqual({
			bindingLimitationName: "Service Bindings",
		});
	});

	test("reports top-level setting messages", ({ expect }) => {
		const settings = topLevelSettings({
			containers: [{ class_name: "ContainerDO" }],
			queues: { consumers: [{ queue: "production-queue" }] },
			triggers: { crons: ["0 * * * *"] },
		});

		expect(convertTopLevelSetting(settings, "containers", true)).toEqual({
			blockDeploymentMessage:
				"This Worker uses Containers. They are not included in the suggested Preview configuration.\nFollow the setup instructions so each Preview automatically gets a new, isolated Container app and state:\nhttps://developers.cloudflare.com/workers/previews/resources/#containers",
		});
		expect(convertTopLevelSetting(settings, "queues", true)).toEqual({
			bindingLimitationName: "Queue consumers",
		});
		expect(convertTopLevelSetting(settings, "triggers", true)).toEqual({
			bindingLimitationName: "Cron triggers",
		});
		expect(
			convertTopLevelSetting(
				topLevelSettings({
					triggers: {
						events: [
							{
								type: "cf.artifacts.repo.created",
								targets: [
									{
										type: "workflow",
										workflow_name: "production-workflow",
									},
								],
							},
						],
					},
				}),
				"triggers",
				true
			)
		).toEqual({ bindingLimitationName: "Artifacts event triggers" });
	});

	test("omits tail consumer environments and reports their limitation", ({
		expect,
	}) => {
		const result = convertPreviewSettings(
			{},
			topLevelSettings({
				tail_consumers: [
					{ service: "production-tail", environment: "staging" },
				],
			}),
			true
		);

		expect(result.config).toEqual({
			tail_consumers: [{ service: "<REPLACE_ME>" }],
		});
		expect(result.messages).toEqual([
			"These settings have limitations in Worker Previews: Tail consumer environments.\nWrangler did not add them automatically. Review the limitations, then decide how you want to configure them for your Preview.\nLearn more: https://developers.cloudflare.com/workers/previews/limitations/",
		]);
		expect(result.blockingDeploymentMessages).toEqual([]);
	});

	test("inherits production observability", ({ expect }) => {
		expect(
			convertTopLevelSetting(
				topLevelSettings({
					observability: {
						enabled: true,
						logs: { destinations: ["production-log-destination"] },
					},
				}),
				"observability",
				true
			)
		).toEqual({});
	});

	test("aggregates config, deduplicates messages, and preserves blocking", ({
		expect,
	}) => {
		const result = convertPreviewSettings(
			{
				FIRST_WORKFLOW: { type: "workflow" },
				SECOND_WORKFLOW: { type: "workflow" },
				SERVICE: { type: "service" },
				QUEUE: { type: "queue", queue_name: "production-queue" },
				DO: { type: "durable_object_namespace", class_name: "ProductionDO" },
			},
			topLevelSettings({
				containers: [{ class_name: "ContainerDO" }],
				queues: { consumers: [{ queue: "production-queue" }] },
				triggers: { crons: ["0 * * * *"] },
			}),
			true
		);

		expect(result.config).toEqual({
			queues: {
				producers: [{ binding: "QUEUE", queue: "<REPLACE_ME>" }],
			},
		});
		expect(result.messages).toEqual([
			"These settings have limitations in Worker Previews: Workflows, Service Bindings, Queue consumers, Cron triggers.\nWrangler did not add them automatically. Review the limitations, then decide how you want to configure them for your Preview.\nLearn more: https://developers.cloudflare.com/workers/previews/limitations/",
		]);
		expect(result.blockingDeploymentMessages).toEqual([
			"This Worker uses Durable Objects. They are not included in the suggested Preview configuration.\nFollow the setup instructions so each Preview automatically gets a new, isolated Durable Object namespace:\nhttps://developers.cloudflare.com/workers/previews/resources/#durable-objects",
			"This Worker uses Containers. They are not included in the suggested Preview configuration.\nFollow the setup instructions so each Preview automatically gets a new, isolated Container app and state:\nhttps://developers.cloudflare.com/workers/previews/resources/#containers",
		]);
	});

	test("returns an empty nonblocking aggregate", ({ expect }) => {
		expect(convertPreviewSettings({}, topLevelSettings(), true)).toEqual({
			config: {},
			messages: [],
			blockingDeploymentMessages: [],
		});
	});

	test("uses conversion to select production bindings expected in Preview", ({
		expect,
	}) => {
		expect(
			getProductionBindingsExpectedInPreview({
				ai: { binding: "AI", staging: false },
				kv_namespaces: [{ binding: "KV", id: "production-kv" }],
				services: [{ binding: "SERVICE", service: "production-service" }],
				durable_objects: {
					bindings: [{ name: "DO", class_name: "ProductionDO" }],
				},
				assets: { binding: "ASSETS", directory: "public" },
			} as Config)
		).toEqual({
			AI: { type: "ai", staging: false },
			KV: { type: "kv_namespace", namespace_id: "production-kv" },
		});
	});

	test("preserves empty Preview Base values", ({ expect }) => {
		expect(
			convertPreviewBaseToPreviewsConfig({
				limits: {},
				tail_consumers: [],
			}).config
		).toEqual({ limits: {}, tail_consumers: [] });
	});

	test("omits null Preview Base settings without removing JSON null", ({
		expect,
	}) => {
		expect(
			convertPreviewBaseToPreviewsConfig({
				observability: {
					enabled: false,
					head_sampling_rate: null,
				},
			} as unknown as Parameters<typeof convertPreviewBaseToPreviewsConfig>[0])
				.config
		).toEqual({ observability: { enabled: false } });

		expect(
			convertBinding("NULL_VALUE", { type: "json", json: null }, false)
		).toEqual({
			config: { vars: { NULL_VALUE: null } },
		});
	});

	test("rejects duplicate singleton bindings", ({ expect }) => {
		const convertDuplicates = () =>
			convertPreviewSettings(
				{
					FIRST_BROWSER: { type: "browser" },
					SECOND_BROWSER: { type: "browser" },
				},
				topLevelSettings(),
				false
			);

		expect(convertDuplicates).toThrow(UserError);
		expect(convertDuplicates).toThrow(
			"Preview browser binding is defined more than once. Rename one of the bindings so each Preview setting is produced only once."
		);
	});

	test("production conversion never serializes unsupported values", ({
		expect,
	}) => {
		const result = convertProductionToPreviewsConfig({
			services: [
				{
					binding: "SERVICE",
					service: "production-service",
					environment: "production",
				},
			],
		} as Config);

		expect(result.config).toEqual({});
		expect(result.messages).toEqual([
			"These settings have limitations in Worker Previews: Service Bindings.\nWrangler did not add them automatically. Review the limitations, then decide how you want to configure them for your Preview.\nLearn more: https://developers.cloudflare.com/workers/previews/limitations/",
		]);
		expect(JSON.stringify(result)).not.toContain("production");
	});
});
