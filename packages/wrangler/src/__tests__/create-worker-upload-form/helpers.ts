import type { StartDevWorkerInput } from "../../api/startDevWorker/types";
import type { CfWorkerInit } from "@cloudflare/workers-utils";

/**
 * Helper to parse the metadata JSON from a FormData upload form.
 */
export function getMetadata(form: FormData): Record<string, unknown> {
	return JSON.parse(form.get("metadata") as string);
}

/**
 * Helper to extract the bindings array from form metadata.
 */
export function getBindings(
	form: FormData
): Array<Record<string, unknown>> {
	return getMetadata(form).bindings as Array<Record<string, unknown>>;
}

/**
 * Helper to create a minimal CfWorkerInit for ESM workers.
 * This is the base object that can be extended with specific bindings for each test.
 */
export function createEsmWorker(
	overrides: Partial<CfWorkerInit> = {}
): Omit<CfWorkerInit, "bindings" | "rawBindings"> {
	return {
		name: "test-worker",
		main: {
			name: "index.js",
			filePath: "index.js",
			content: 'export default { fetch() { return new Response("ok"); } }',
			type: "esm",
		},
		modules: [],
		sourceMaps: [],
		compatibility_date: "2024-01-01",
		compatibility_flags: [],
		assets: undefined,
		containers: undefined,
		migrations: undefined,
		keepVars: undefined,
		keepSecrets: undefined,
		logpush: undefined,
		placement: undefined,
		tail_consumers: undefined,
		limits: undefined,
		observability: undefined,
		...overrides,
	};
}

/**
 * Helper to create a minimal CfWorkerInit for service-worker (commonjs) format workers.
 */
export function createCjsWorker(
	overrides: Partial<CfWorkerInit> = {}
): Omit<CfWorkerInit, "bindings" | "rawBindings"> {
	return {
		name: "test-worker",
		main: {
			name: "index.js",
			filePath: "index.js",
			content:
				'addEventListener("fetch", (event) => event.respondWith(new Response("ok")))',
			type: "commonjs",
		},
		modules: [],
		sourceMaps: [],
		compatibility_date: "2024-01-01",
		compatibility_flags: [],
		assets: undefined,
		containers: undefined,
		migrations: undefined,
		keepVars: undefined,
		keepSecrets: undefined,
		logpush: undefined,
		placement: undefined,
		tail_consumers: undefined,
		limits: undefined,
		observability: undefined,
		...overrides,
	};
}

export const emptyBindings: CfWorkerInit["bindings"] = {
	vars: undefined,
	kv_namespaces: undefined,
	send_email: undefined,
	wasm_modules: undefined,
	text_blobs: undefined,
	browser: undefined,
	ai: undefined,
	images: undefined,
	version_metadata: undefined,
	data_blobs: undefined,
	durable_objects: undefined,
	workflows: undefined,
	queues: undefined,
	r2_buckets: undefined,
	d1_databases: undefined,
	vectorize: undefined,
	hyperdrive: undefined,
	secrets_store_secrets: undefined,
	services: undefined,
	vpc_services: undefined,
	analytics_engine_datasets: undefined,
	dispatch_namespaces: undefined,
	mtls_certificates: undefined,
	logfwdr: undefined,
	pipelines: undefined,
	unsafe: undefined,
	assets: undefined,
	unsafe_hello_world: undefined,
	ratelimits: undefined,
	worker_loaders: undefined,
	media: undefined,
};

/**
 * Helper to create a full CfWorkerInit (including bindings) for the wrapper function tests.
 */
export function createFullWorker(overrides: {
	bindings?: Partial<CfWorkerInit["bindings"]>;
}): CfWorkerInit {
	return {
		name: "test-worker",
		main: {
			name: "index.js",
			filePath: "index.js",
			content: 'export default { fetch() { return new Response("ok"); } }',
			type: "esm",
		},
		modules: [],
		sourceMaps: [],
		compatibility_date: "2024-01-01",
		compatibility_flags: [],
		assets: undefined,
		containers: undefined,
		migrations: undefined,
		keepVars: undefined,
		keepSecrets: undefined,
		logpush: undefined,
		placement: undefined,
		tail_consumers: undefined,
		limits: undefined,
		observability: undefined,
		bindings: {
			...emptyBindings,
			...overrides.bindings,
		},
	};
}

export type { StartDevWorkerInput, CfWorkerInit };
