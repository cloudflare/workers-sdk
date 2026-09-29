import { describe, test } from "vitest";
import {
	buildPreviewConfigProposal,
	createPreviewConfigProposal,
} from "../preview/preview-config";
import type { PreviewTopLevelSettings } from "../preview/preview-config";
import type { Binding, PreviewBaseConfig } from "@cloudflare/deploy-helpers";
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
	test("redacts local values while retaining safe fields", ({ expect }) => {
		const result = buildPreviewConfigProposal(
			{
				TEXT: { type: "plain_text", text: "production-text" },
				JSON: {
					type: "json",
					json: { nested: ["production-json", null] },
				},
				AI: { type: "ai", staging: true },
				D1: {
					type: "d1",
					database_id: "production-database",
					internalEnv: "production-internal-env",
				},
				R2: {
					type: "r2_bucket",
					bucket_name: "production-bucket",
					jurisdiction: "eu",
				},
				QUEUE: { type: "queue", queue_name: "production-queue" },
			},
			topLevelSettings({
				define: { API_URL: "production-url" },
				observability: {
					enabled: true,
					logs: { destinations: ["production-destination"] },
				},
				logpush: true,
				limits: { cpu_ms: 50, subrequests: 100 },
				placement: { mode: "smart", hint: "production-hint" },
				cache: { enabled: true, cross_version_cache: true },
				tail_consumers: [
					{ service: "production-tail", environment: "production-env" },
				],
			}),
			"localConfig"
		);

		expect(result.config).toEqual({
			vars: {
				TEXT: "<REPLACE_ME>",
				JSON: { nested: ["<REPLACE_ME>", null] },
			},
			ai: { binding: "AI", staging: true },
			d1_databases: [{ binding: "D1", database_id: "<REPLACE_ME>" }],
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
			define: { API_URL: "<REPLACE_ME>" },
			observability: {
				enabled: true,
				logs: { destinations: ["<REPLACE_ME>"] },
			},
			logpush: true,
			limits: { cpu_ms: 50, subrequests: 100 },
			placement: { mode: "smart", hint: "<REPLACE_ME>" },
			cache: { enabled: true, cross_version_cache: true },
			tail_consumers: [
				{ service: "<REPLACE_ME>", environment: "<REPLACE_ME>" },
			],
		});
		expect(result.messages).toEqual([
			"These settings have limitations in Worker Previews: Tail consumer environments.\nWrangler did not add them automatically. Review the limitations, then decide how you want to configure them for your Preview.\nLearn more: https://developers.cloudflare.com/workers/previews/limitations/",
		]);
		expect(JSON.stringify(result)).not.toContain("production");
	});

	test("preserves Preview Base values", ({ expect }) => {
		const result = createPreviewConfigProposal({
			kind: "previewBase",
			config: {
				observability: {
					enabled: true,
					logs: { destinations: ["preview-destination"] },
				},
				placement: { mode: "smart", hint: "preview-hint" },
				tail_consumers: [{ name: "preview-tail" }],
				env: {
					JSON: { type: "json", json: null },
					D1: { type: "d1", database_id: "preview-database" },
				},
			} as PreviewBaseConfig,
		});

		expect(result.config).toEqual({
			vars: { JSON: null },
			d1_databases: [{ binding: "D1", database_id: "preview-database" }],
			observability: {
				enabled: true,
				logs: { destinations: ["preview-destination"] },
			},
			placement: { mode: "smart", hint: "preview-hint" },
			tail_consumers: [{ service: "preview-tail" }],
		});
		expect(result.messages).toEqual([]);
		expect(result.blockingDeploymentMessages).toEqual([]);
	});

	test("preserves empty Preview Base values and omits null observability fields", ({
		expect,
	}) => {
		const result = createPreviewConfigProposal({
			kind: "previewBase",
			config: {
				observability: {
					enabled: true,
					head_sampling_rate: null,
					logs: { head_sampling_rate: null },
				},
				limits: {},
				tail_consumers: [],
				env: {
					EMPTY_OBJECT: { type: "json", json: {} },
					EMPTY_ARRAY: { type: "json", json: [] },
					NULL_VALUE: { type: "json", json: null },
				},
			} as unknown as PreviewBaseConfig,
		});

		expect(result.config).toEqual({
			vars: { EMPTY_OBJECT: {}, EMPTY_ARRAY: [], NULL_VALUE: null },
			observability: { enabled: true },
			limits: {},
			tail_consumers: [],
		});
	});

	test("ignores excluded bindings without reading their values", ({
		expect,
	}) => {
		const secret = Object.defineProperty(
			{ type: "secret_text" } as Binding,
			"text",
			{
				enumerable: true,
				get() {
					throw new Error("secret text must not be read");
				},
			}
		);
		const ignored: Binding[] = [
			secret,
			{ type: "inherit" },
			{ type: "wasm_module" },
			{ type: "assets" },
		];

		const result = buildPreviewConfigProposal(
			Object.fromEntries(
				ignored.map((binding, i) => [`IGNORED_${i}`, binding])
			),
			topLevelSettings(),
			"previewBase"
		);
		expect(result).toEqual({
			config: {},
			messages: [],
			blockingDeploymentMessages: [],
		});
	});

	test("deduplicates limitations and blocking messages", ({ expect }) => {
		const result = buildPreviewConfigProposal(
			{
				WORKFLOW_1: { type: "workflow" },
				WORKFLOW_2: { type: "workflow" },
				SERVICE: { type: "service" },
				DO_1: { type: "durable_object_namespace" },
				DO_2: { type: "durable_object_namespace" },
			},
			topLevelSettings({
				containers: [{ class_name: "ContainerDO" }],
				queues: { consumers: [{ queue: "production-queue" }] },
				triggers: { crons: ["0 * * * *"] },
			}),
			"localConfig"
		);

		expect(result.config).toEqual({});
		expect(result.messages).toEqual([
			"These settings have limitations in Worker Previews: Workflows, Service Bindings, Queue consumers, Cron triggers.\nWrangler did not add them automatically. Review the limitations, then decide how you want to configure them for your Preview.\nLearn more: https://developers.cloudflare.com/workers/previews/limitations/",
		]);
		expect(result.blockingDeploymentMessages).toEqual([
			"This Worker uses Durable Objects. They are not included in the suggested Preview configuration.\nFollow the setup instructions so each Preview automatically gets a new, isolated Durable Object namespace:\nhttps://developers.cloudflare.com/workers/previews/resources/#durable-objects",
			"This Worker uses Containers. They are not included in the suggested Preview configuration.\nFollow the setup instructions so each Preview automatically gets a new, isolated Container app and state:\nhttps://developers.cloudflare.com/workers/previews/resources/#containers",
		]);
	});

	test("adapts normalized local config and preserves empty values", ({
		expect,
	}) => {
		expect(
			createPreviewConfigProposal({
				kind: "localConfig",
				config: {
					define: {},
					limits: {},
					tail_consumers: [],
				} as unknown as Config,
			}).config
		).toEqual({ limits: {}, tail_consumers: [] });
	});
});
