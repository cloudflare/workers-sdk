import assert from "node:assert";
import type { Binding, Hook, HookValues, StartDevWorkerOptions } from "./types";
import type { Config } from "@cloudflare/workers-utils";
import type { Json } from "miniflare";

export function assertNever(_value: never) {}

export type MaybePromise<T> = T | Promise<T>;
export type DeferredPromise<T> = {
	promise: Promise<T>;
	resolve: (_: MaybePromise<T>) => void;
	reject: (_: Error) => void;
};

export function createDeferred<T>(
	previousDeferred?: DeferredPromise<T>
): DeferredPromise<T> {
	let resolve, reject;
	const newPromise = new Promise<T>((_resolve, _reject) => {
		resolve = _resolve;
		reject = _reject;
	});
	assert(resolve);
	assert(reject);

	// if passed a previousDeferred, ensure it is resolved with the newDeferred
	// so that await-ers of previousDeferred are now await-ing newDeferred
	previousDeferred?.resolve(newPromise);

	return {
		promise: newPromise,
		resolve,
		reject,
	};
}

export function urlFromParts(
	parts: Partial<URL>,
	base = "http://localhost"
): URL {
	const url = new URL(base);

	Object.assign(url, parts);

	return url;
}

type UnwrapHook<
	T extends HookValues | Promise<HookValues>,
	Args extends unknown[],
> = Hook<T, Args>;

export function unwrapHook<
	T extends HookValues | Promise<HookValues>,
	Args extends unknown[],
>(hook: UnwrapHook<T, Args>, ...args: Args): T {
	return typeof hook === "function" ? hook(...args) : hook;
}

/**
 * Options for convertConfigToBindings
 */
export interface ConvertBindingsOptions {
	/**
	 * When true, uses preview IDs (preview_id, preview_bucket_name, preview_database_id)
	 * instead of production IDs. Used for local development.
	 */
	usePreviewIds?: boolean;
	/**
	 * When true, excludes bindings that are not supported in Pages
	 * (send_email, wasm_modules, text_blobs, data_blobs, dispatch_namespaces, pipelines, logfwdr, assets, unsafe)
	 */
	pages?: boolean;
}

/**
 * Binding options that can be provided to convertConfigBindingsToStartWorkerBindings.
 * This is a subset of Config focused only on binding-related fields.
 */
export interface ConfigBindingOptions {
	vars?: Config["vars"];
	kv_namespaces?: Config["kv_namespaces"];
	send_email?: Config["send_email"];
	durable_objects?: Config["durable_objects"];
	workflows?: Config["workflows"];
	queues?: Config["queues"];
	r2_buckets?: Config["r2_buckets"];
	d1_databases?: Config["d1_databases"];
	vectorize?: Config["vectorize"];
	hyperdrive?: Config["hyperdrive"];
	secrets_store_secrets?: Config["secrets_store_secrets"];
	unsafe_hello_world?: Config["unsafe_hello_world"];
	ratelimits?: Config["ratelimits"];
	vpc_services?: Config["vpc_services"];
	services?: Config["services"];
	analytics_engine_datasets?: Config["analytics_engine_datasets"];
	dispatch_namespaces?: Config["dispatch_namespaces"];
	mtls_certificates?: Config["mtls_certificates"];
	pipelines?: Config["pipelines"];
	worker_loaders?: Config["worker_loaders"];
	logfwdr?: Config["logfwdr"];
	wasm_modules?: Config["wasm_modules"];
	browser?: Config["browser"];
	ai?: Config["ai"];
	images?: Config["images"];
	media?: Config["media"];
	version_metadata?: Config["version_metadata"];
	assets?: Config["assets"];
	text_blobs?: Config["text_blobs"];
	data_blobs?: Config["data_blobs"];
	unsafe?: Config["unsafe"];
}

/**
 * Convert Config bindings to the flat StartDevWorkerInput["bindings"] format.
 * This is the canonical conversion function - other converters should delegate to this.
 */
export function convertConfigToBindings(
	config: Config,
	options?: ConvertBindingsOptions
): NonNullable<StartDevWorkerOptions["bindings"]> {
	const { usePreviewIds = false, pages = false } = options ?? {};
	const output: NonNullable<StartDevWorkerOptions["bindings"]> = {};

	// Helper to get ID with optional preview fallback
	const getId = <T, K1 extends keyof T, K2 extends keyof T>(
		item: T,
		previewField: K1,
		idField: K2
	): T[K1] | T[K2] =>
		usePreviewIds ? item[previewField] ?? item[idField] : item[idField];

	// vars (plain_text and json)
	for (const [key, value] of Object.entries(config.vars ?? {})) {
		if (typeof value === "string") {
			output[key] = { type: "plain_text", value };
		} else {
			output[key] = { type: "json", value };
		}
	}

	// 2. kv_namespaces
	for (const kv of config.kv_namespaces ?? []) {
		const { binding, preview_id: _, ...rest } = kv;
		output[binding] = {
			type: "kv_namespace",
			...rest,
			id: getId(kv, "preview_id", "id"),
		};
	}

	// 3. send_email (pages: exclude)
	if (!pages) {
		for (const email of config.send_email ?? []) {
			const { name, ...rest } = email;
			output[name] = { type: "send_email", ...rest };
		}
	}

	// 4. durable_objects
	for (const durable of config.durable_objects?.bindings ?? []) {
		const { name, ...rest } = durable;
		output[name] = { type: "durable_object_namespace", ...rest };
	}

	// 5. workflows
	for (const workflow of config.workflows ?? []) {
		const { binding, ...rest } = workflow;
		output[binding] = { type: "workflow", ...rest };
	}

	// 6. queues (producers)
	for (const producer of config.queues?.producers ?? []) {
		output[producer.binding] = {
			type: "queue",
			queue_name: producer.queue,
			...(producer.delivery_delay !== undefined && {
				delivery_delay: producer.delivery_delay,
			}),
		};
	}

	// 7. r2_buckets
	for (const r2 of config.r2_buckets ?? []) {
		const { binding, preview_bucket_name: _, ...rest } = r2;
		output[binding] = {
			type: "r2_bucket",
			...rest,
			bucket_name: getId(r2, "preview_bucket_name", "bucket_name"),
		};
	}

	// 8. d1_databases
	for (const d1 of config.d1_databases ?? []) {
		const { binding, preview_database_id: _, ...rest } = d1;
		output[binding] = {
			type: "d1",
			...rest,
			database_id: getId(d1, "preview_database_id", "database_id"),
		};
	}

	// 9. vectorize
	for (const vectorize of config.vectorize ?? []) {
		const { binding, ...rest } = vectorize;
		output[binding] = { type: "vectorize", ...rest };
	}

	// 10. hyperdrive
	for (const hyperdrive of config.hyperdrive ?? []) {
		const { binding, ...rest } = hyperdrive;
		output[binding] = { type: "hyperdrive", ...rest };
	}

	// 11. secrets_store_secrets
	for (const secret of config.secrets_store_secrets ?? []) {
		const { binding, ...rest } = secret;
		output[binding] = { type: "secrets_store_secret", ...rest };
	}

	// 12. unsafe_hello_world (pages: exclude)
	if (!pages) {
		for (const helloWorld of config.unsafe_hello_world ?? []) {
			const { binding, ...rest } = helloWorld;
			output[binding] = { type: "unsafe_hello_world", ...rest };
		}
	}

	// 13. ratelimits
	for (const ratelimit of config.ratelimits ?? []) {
		const { name, ...rest } = ratelimit;
		output[name] = { type: "ratelimit", ...rest };
	}

	// 14. vpc_services
	for (const vpc of config.vpc_services ?? []) {
		const { binding, ...rest } = vpc;
		output[binding] = { type: "vpc_service", ...rest };
	}

	// 15. services
	for (const service of config.services ?? []) {
		const { binding, ...rest } = service;
		output[binding] = { type: "service", ...rest };
	}

	// 16. analytics_engine_datasets
	for (const dataset of config.analytics_engine_datasets ?? []) {
		const { binding, ...rest } = dataset;
		output[binding] = { type: "analytics_engine", ...rest };
	}

	// 17. dispatch_namespaces (pages: exclude)
	if (!pages) {
		for (const dispatch of config.dispatch_namespaces ?? []) {
			const { binding, ...rest } = dispatch;
			output[binding] = { type: "dispatch_namespace", ...rest };
		}
	}

	// 18. mtls_certificates
	for (const mtls of config.mtls_certificates ?? []) {
		const { binding, ...rest } = mtls;
		output[binding] = { type: "mtls_certificate", ...rest };
	}

	// 19. pipelines (pages: exclude)
	if (!pages) {
		for (const pipeline of config.pipelines ?? []) {
			const { binding, ...rest } = pipeline;
			output[binding] = { type: "pipeline", ...rest };
		}
	}

	// 20. worker_loaders
	for (const loader of config.worker_loaders ?? []) {
		output[loader.binding] = { type: "worker_loader" };
	}

	// 21. logfwdr (pages: exclude)
	if (!pages) {
		for (const logfwdr of config.logfwdr?.bindings ?? []) {
			const { name, ...rest } = logfwdr;
			output[name] = { type: "logfwdr", ...rest };
		}
	}

	// 22. wasm_modules (pages: exclude)
	if (!pages) {
		for (const [key, value] of Object.entries(config.wasm_modules ?? {})) {
			if (typeof value === "string") {
				output[key] = { type: "wasm_module", source: { path: value } };
			} else {
				output[key] = { type: "wasm_module", source: { contents: value } };
			}
		}
	}

	// 23. browser
	if (config.browser) {
		const { binding, ...rest } = config.browser;
		output[binding] = { type: "browser", ...rest };
	}

	// 24. ai
	if (config.ai) {
		const { binding, ...rest } = config.ai;
		output[binding] = { type: "ai", ...rest };
	}

	// 25. images
	if (config.images) {
		const { binding, ...rest } = config.images;
		output[binding] = { type: "images", ...rest };
	}

	// 26. media
	if (config.media) {
		const { binding, ...rest } = config.media;
		output[binding] = { type: "media", ...rest };
	}

	// 27. version_metadata
	if (config.version_metadata) {
		output[config.version_metadata.binding] = { type: "version_metadata" };
	}

	// 28. assets (pages: exclude)
	if (!pages && config.assets?.binding) {
		output[config.assets.binding] = { type: "assets" };
	}

	// 29. text_blobs (pages: exclude)
	if (!pages) {
		for (const [key, value] of Object.entries(config.text_blobs ?? {})) {
			output[key] = { type: "text_blob", source: { path: value } };
		}
	}

	// 30. data_blobs (pages: exclude)
	if (!pages) {
		for (const [key, value] of Object.entries(config.data_blobs ?? {})) {
			if (typeof value === "string") {
				output[key] = { type: "data_blob", source: { path: value } };
			} else {
				output[key] = { type: "data_blob", source: { contents: value } };
			}
		}
	}

	// 31. unsafe bindings (pages: exclude)
	// Unsafe bindings always get prefixed with "unsafe_" to distinguish them from
	// regular bindings. This is important because:
	// 1. Unsafe bindings may have different property structures than regular bindings
	// 2. Bindings with dev.plugin need special handling by external plugins
	// Miniflare extraction handles both "type" and "unsafe_type" variants for bindings
	// that need special processing (like ratelimit).
	if (!pages) {
		for (const unsafe of config.unsafe?.bindings ?? []) {
			const { type: unsafeType, name, ...data } = unsafe;
			output[name] = { type: `unsafe_${unsafeType}`, ...data } as Binding;
		}
	}

	return output;
}

export function convertConfigBindingsToStartWorkerBindings(
	configBindings: ConfigBindingOptions
): StartDevWorkerOptions["bindings"] {
	return convertConfigToBindings(configBindings as unknown as Config, {
		usePreviewIds: true,
	});
}

/**
 * Bindings that can be passed via the StartDevOptions (CLI/API) interface.
 * This is a subset of all binding types, focused on the most commonly used ones.
 */
export interface StartDevOptionsBindings {
	vars?: Record<string, string | Json>;
	kv?: {
		binding: string;
		id?: string;
		preview_id?: string;
	}[];
	durableObjects?: {
		name: string;
		class_name: string;
		script_name?: string;
		environment?: string;
	}[];
	services?: {
		binding: string;
		service: string;
		environment?: string;
		entrypoint?: string;
	}[];
	r2?: {
		binding: string;
		bucket_name?: string;
		preview_bucket_name?: string;
		jurisdiction?: string;
	}[];
	ai?: {
		binding: string;
	};
	version_metadata?: {
		binding: string;
	};
	d1Databases?: {
		binding: string;
		database_id?: string;
		database_name?: string;
		database_internal_env?: string;
		preview_database_id?: string;
	}[];
	queueProducers?: {
		binding: string;
		queue: string;
		delivery_delay?: number;
	}[];
	hyperdrive?: {
		binding: string;
		id: string;
		localConnectionString?: string;
	}[];
}

/**
 * Convert StartDevOptions bindings to the flat StartDevWorkerInput["bindings"] format.
 * Only supports the binding types available in StartDevOptions (the subset that can be
 * passed via CLI/API).
 */
export function convertStartDevOptionsToBindings(
	inputBindings: StartDevOptionsBindings
): StartDevWorkerOptions["bindings"] {
	const output: StartDevWorkerOptions["bindings"] = {};

	// vars (plain_text and json)
	if (inputBindings.vars) {
		for (const [key, value] of Object.entries(inputBindings.vars)) {
			if (typeof value === "string") {
				output[key] = { type: "plain_text", value };
			} else {
				output[key] = { type: "json", value };
			}
		}
	}

	// kv namespaces
	if (inputBindings.kv) {
		for (const kv of inputBindings.kv) {
			output[kv.binding] = {
				type: "kv_namespace",
				id: kv.id,
			};
		}
	}

	// durable objects
	if (inputBindings.durableObjects) {
		for (const durable of inputBindings.durableObjects) {
			output[durable.name] = {
				type: "durable_object_namespace",
				class_name: durable.class_name,
				script_name: durable.script_name,
				environment: durable.environment,
			};
		}
	}

	// services
	if (inputBindings.services) {
		for (const service of inputBindings.services) {
			output[service.binding] = {
				type: "service",
				service: service.service,
				environment: service.environment,
				entrypoint: service.entrypoint,
			};
		}
	}

	// r2 buckets
	if (inputBindings.r2) {
		for (const r2 of inputBindings.r2) {
			output[r2.binding] = {
				type: "r2_bucket",
				bucket_name: r2.bucket_name,
				jurisdiction: r2.jurisdiction,
			};
		}
	}

	// ai
	if (inputBindings.ai) {
		output[inputBindings.ai.binding] = {
			type: "ai",
		};
	}

	// version_metadata
	if (inputBindings.version_metadata) {
		output[inputBindings.version_metadata.binding] = {
			type: "version_metadata",
		};
	}

	// d1 databases
	if (inputBindings.d1Databases) {
		for (const d1 of inputBindings.d1Databases) {
			output[d1.binding] = {
				type: "d1",
				database_id: d1.database_id,
				database_name: d1.database_name,
				database_internal_env: d1.database_internal_env,
			};
		}
	}

	return output;
}

export function extractBindingsOfType<
	Type extends NonNullable<StartDevWorkerOptions["bindings"]>[string]["type"],
>(
	type: Type,
	bindings: StartDevWorkerOptions["bindings"]
): (Extract<Binding, { type: Type }> & {
	binding: string;
	/* ugh why durable objects :( */ name: string;
})[] {
	return Object.entries(bindings ?? {})
		.filter(
			(binding): binding is [string, Extract<Binding, { type: Type }>] =>
				binding[1].type === type
		)
		.map((binding) => ({
			...binding[1],
			binding: binding[0],
			name: binding[0],
		})) as (Extract<Binding, { type: Type }> & {
		binding: string;
		/* ugh why durable objects :( */ name: string;
	})[];
}
