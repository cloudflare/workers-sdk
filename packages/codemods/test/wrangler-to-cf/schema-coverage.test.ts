import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "vitest";
import {
	KNOWN_FIELDS,
	convertWranglerConfig,
} from "../../src/codemods/wrangler-to-cf/config-converter";
import {
	renderCloudflareConfig,
	renderWranglerConfig,
} from "../../src/codemods/wrangler-to-cf/config-renderer";
import type { RawConfig } from "@cloudflare/workers-utils";

const BASE_CONFIG = {
	compatibility_date: "2026-09-23",
	name: "schema-coverage",
} satisfies RawConfig;

const FIELD_CASES = {
	access: {},
	account_id: "account-id",
	addresses: ["worker@example.com"],
	agent_memory: [{ binding: "MEMORY", namespace: "memory" }],
	ai: { binding: "AI" },
	ai_search: [{ binding: "SEARCH", instance_name: "search" }],
	ai_search_namespaces: [{ binding: "SEARCH", namespace: "search" }],
	alias: { module: "./module.ts" },
	analytics_engine_datasets: [{ binding: "ANALYTICS", dataset: "events" }],
	artifacts: [{ binding: "ARTIFACTS", namespace: "artifacts" }],
	assets: {
		binding: "ASSETS",
		directory: "public",
		html_handling: "auto-trailing-slash",
	},
	base_dir: ".",
	browser: { binding: "BROWSER" },
	build: { command: "pnpm build" },
	cache: { enabled: true },
	cloudchamber: {},
	compatibility_date: "2026-10-01",
	compatibility_flags: ["nodejs_compat"],
	compliance_region: "fedramp_high",
	connect: [{ hostname: "example.com", port: 443 }],
	containers: [{ class_name: "Container" }],
	d1_databases: [
		{ binding: "DATABASE", database_id: "id", database_name: "db" },
	],
	data_blobs: { DATA: "data.bin" },
	define: { FEATURE: "true" },
	dependencies_instrumentation: { enabled: true },
	dev: { port: 8788 },
	dispatch_namespaces: [{ binding: "DISPATCH", namespace: "namespace" }],
	durable_objects: {
		bindings: [{ class_name: "DurableObject", name: "DURABLE_OBJECT" }],
	},
	env: { staging: { vars: { MODE: "staging" } } },
	exports: { WorkerEntrypoint: { type: "worker" } },
	find_additional_modules: true,
	first_party_worker: true,
	flagship: [{ app_id: "app-id", binding: "FLAGSHIP" }],
	hyperdrive: [{ binding: "HYPERDRIVE", id: "id" }],
	images: { binding: "IMAGES" },
	jsx_factory: "h",
	jsx_fragment: "Fragment",
	keep_names: true,
	keep_vars: true,
	kv_namespaces: [{ binding: "KV", id: "id" }],
	limits: { cpu_ms: 100 },
	logfwdr: { bindings: [{ destination: "destination", name: "LOG" }] },
	logpush: true,
	main: "src/worker.ts",
	media: { binding: "MEDIA" },
	migrations: [{ new_classes: ["DurableObject"], tag: "v1" }],
	minify: true,
	mtls_certificates: [{ binding: "MTLS", certificate_id: "id" }],
	name: "renamed-worker",
	no_bundle: true,
	observability: { enabled: true },
	pages_build_output_dir: "dist",
	pipelines: [{ binding: "PIPELINE", pipeline: "pipeline" }],
	placement: { mode: "smart" },
	preserve_file_names: true,
	preview_urls: true,
	previews: { vars: { MODE: "preview" } },
	python_modules: { vendor: "vendor" },
	queues: { producers: [{ binding: "QUEUE", queue: "queue" }] },
	r2_buckets: [{ binding: "BUCKET", bucket_name: "bucket" }],
	ratelimits: [
		{
			name: "RATE_LIMIT",
			namespace_id: "1",
			simple: { limit: 100, period: 60 },
		},
	],
	route: "example.com/*",
	routes: [{ pattern: "api.example.com/*", zone_name: "example.com" }],
	rules: [{ globs: ["**/*.txt"], type: "Text" }],
	secrets: { required: ["SECRET"] },
	secrets_store_secrets: [
		{ binding: "STORED_SECRET", secret_name: "secret", store_id: "store" },
	],
	send_email: [{ name: "EMAIL" }],
	send_metrics: false,
	services: [{ binding: "SERVICE", service: "service" }],
	site: { bucket: "public" },
	stream: { binding: "STREAM" },
	streaming_tail_consumers: [{ service: "streaming-tail" }],
	tail_consumers: [{ service: "tail" }],
	text_blobs: { TEXT: "text.txt" },
	triggers: { crons: ["0 * * * *"] },
	tsconfig: "tsconfig.worker.json",
	unsafe: {
		bindings: [{ name: "UNSAFE", type: "custom" }],
		metadata: { enabled: true },
	},
	unsafe_hello_world: [],
	upload_source_maps: true,
	vars: { VALUE: "text" },
	vectorize: [{ binding: "VECTORIZE", index_name: "index" }],
	version_metadata: { binding: "VERSION" },
	vpc_networks: [
		{ binding: "VPC_NETWORK", network_id: "network", tunnel_id: "tunnel" },
	],
	vpc_services: [{ binding: "VPC_SERVICE", service_id: "service" }],
	wasm_modules: { MODULE: "module.wasm" },
	worker_loaders: [{ binding: "WORKER_LOADER" }],
	workers_dev: false,
	workflows: [
		{ binding: "WORKFLOW", class_name: "Workflow", name: "workflow" },
	],
} satisfies Record<string, unknown>;

const INTENTIONALLY_IGNORED_FIELDS = {
	$schema: "https://example.com/wrangler.schema.json",
} satisfies Record<string, unknown>;

interface WranglerSchema {
	definitions?: {
		RawConfig?: {
			properties?: Record<string, unknown>;
		};
	};
}

function getConversionSignature(rawConfig: RawConfig): string {
	const converted = convertWranglerConfig(rawConfig, "wrangler", []);

	return JSON.stringify({
		cloudflareConfig: renderCloudflareConfig(converted),
		followUps: converted.followUps,
		wranglerConfig: renderWranglerConfig(converted),
	});
}

const BASE_SIGNATURE = getConversionSignature(BASE_CONFIG);

describe("Wrangler schema coverage", () => {
	it("classifies every top-level Wrangler configuration field", async ({
		expect,
	}) => {
		const schemaPath = path.join(
			__dirname,
			"../../../wrangler/config-schema.json"
		);

		await expect(access(schemaPath)).resolves.toBeUndefined();

		const schema = JSON.parse(
			await readFile(schemaPath, "utf8")
		) as WranglerSchema;
		const schemaFields = Object.keys(
			schema.definitions?.RawConfig?.properties ?? {}
		).sort();
		const behaviorFields = [
			...Object.keys(FIELD_CASES),
			...Object.keys(INTENTIONALLY_IGNORED_FIELDS),
		].sort();

		expect(Array.from(KNOWN_FIELDS).sort()).toEqual(schemaFields);
		expect(behaviorFields).toEqual(schemaFields);
	});

	for (const [field, value] of Object.entries(FIELD_CASES)) {
		it(`observably handles the top-level \`${field}\` field`, ({ expect }) => {
			const signature = getConversionSignature({
				...BASE_CONFIG,
				[field]: value,
			} as RawConfig);

			expect(signature).not.toBe(BASE_SIGNATURE);
		});
	}

	for (const [field, value] of Object.entries(INTENTIONALLY_IGNORED_FIELDS)) {
		it(`intentionally ignores the top-level \`${field}\` field`, ({
			expect,
		}) => {
			const signature = getConversionSignature({
				...BASE_CONFIG,
				[field]: value,
			} as RawConfig);

			expect(signature).toBe(BASE_SIGNATURE);
		});
	}
});
