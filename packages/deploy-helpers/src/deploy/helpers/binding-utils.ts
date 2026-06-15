import type {
	Binding,
	Config,
	ConfigBindingFieldName,
} from "@cloudflare/workers-utils";

function assertNever(_value: never) {}

interface ConvertBindingsOptions {
	/**
	 * Use preview IDs (preview_id, preview_bucket_name, preview_database_id) instead of production IDs when resolving a binding ID.
	 * This means that the rest of Wrangler does not need to be aware of preview IDs, and can just use regular IDs.
	 */
	usePreviewIds?: boolean;
	/**
	 * Exclude bindings that Pages doesn't support
	 */
	pages?: boolean;
}

/**
 * Convert Config to the Record<string, Binding> format for consistent internal use.
 */
export function convertConfigToBindings(
	config: Partial<Pick<Config, ConfigBindingFieldName>>,
	options?: ConvertBindingsOptions
): Record<string, Binding> {
	const { usePreviewIds = false, pages = false } = options ?? {};
	const output: Record<string, Binding> = {};

	type Entries<T> = { [K in keyof T]: [K, T[K]] }[keyof T][];
	type ConfigIterable = Entries<Required<Pick<Config, ConfigBindingFieldName>>>;
	const configIterable = Object.entries(config) as ConfigIterable;

	for (const [type, info] of configIterable) {
		if (info === undefined) {
			continue;
		}

		switch (type) {
			case "vars": {
				for (const [key, value] of Object.entries(info)) {
					if (typeof value === "string") {
						output[key] = { type: "plain_text", value };
					} else {
						output[key] = { type: "json", value };
					}
				}
				break;
			}
			case "kv_namespaces": {
				for (const { binding, ...x } of info) {
					output[binding] = {
						type: "kv_namespace",
						...x,
						id: usePreviewIds ? (x.preview_id ?? x.id) : x.id,
					};
				}
				break;
			}
			case "send_email": {
				if (pages) {
					break;
				}
				for (const { name, ...x } of info) {
					output[name] = { type: "send_email", ...x };
				}
				break;
			}
			case "wasm_modules": {
				if (pages) {
					break;
				}
				for (const [key, value] of Object.entries(info)) {
					if (typeof value === "string") {
						output[key] = { type: "wasm_module", source: { path: value } };
					} else {
						output[key] = { type: "wasm_module", source: { contents: value } };
					}
				}
				break;
			}
			case "text_blobs": {
				if (pages) {
					break;
				}
				for (const [key, value] of Object.entries(info)) {
					output[key] = { type: "text_blob", source: { path: value } };
				}
				break;
			}
			case "data_blobs": {
				if (pages) {
					break;
				}
				for (const [key, value] of Object.entries(info)) {
					if (typeof value === "string") {
						output[key] = { type: "data_blob", source: { path: value } };
					} else {
						output[key] = { type: "data_blob", source: { contents: value } };
					}
				}
				break;
			}
			case "browser": {
				const { binding, ...x } = info;
				output[binding] = { type: "browser", ...x };
				break;
			}
			case "durable_objects": {
				for (const { name, ...x } of info.bindings ?? []) {
					output[name] = { type: "durable_object_namespace", ...x };
				}
				break;
			}
			case "workflows": {
				for (const { binding, ...x } of info) {
					output[binding] = { type: "workflow", ...x };
				}
				break;
			}
			case "queues": {
				for (const { binding, ...x } of info.producers ?? []) {
					output[binding] = {
						type: "queue",
						queue_name: x.queue,
						...x,
					};
				}
				break;
			}
			case "r2_buckets": {
				for (const { binding, ...x } of info) {
					output[binding] = {
						type: "r2_bucket",
						...x,
						bucket_name: usePreviewIds
							? (x.preview_bucket_name ?? x.bucket_name)
							: x.bucket_name,
					};
				}
				break;
			}
			case "d1_databases": {
				for (const { binding, ...x } of info) {
					output[binding] = {
						type: "d1",
						...x,
						database_id: usePreviewIds
							? (x.preview_database_id ?? x.database_id)
							: x.database_id,
					};
				}
				break;
			}
			case "services": {
				for (const { binding, ...x } of info) {
					output[binding] = { type: "service", ...x };
				}
				break;
			}
			case "analytics_engine_datasets": {
				for (const { binding, ...x } of info) {
					output[binding] = { type: "analytics_engine", ...x };
				}
				break;
			}
			case "dispatch_namespaces": {
				if (pages) {
					break;
				}
				for (const { binding, ...x } of info) {
					output[binding] = { type: "dispatch_namespace", ...x };
				}
				break;
			}
			case "mtls_certificates": {
				for (const { binding, ...x } of info) {
					output[binding] = { type: "mtls_certificate", ...x };
				}
				break;
			}
			case "logfwdr": {
				if (pages) {
					break;
				}
				for (const { name, ...x } of info.bindings ?? []) {
					output[name] = { type: "logfwdr", ...x };
				}
				break;
			}
			case "ai": {
				const { binding, ...x } = info;
				output[binding] = { type: "ai", ...x };
				break;
			}
			case "images": {
				const { binding, ...x } = info;
				output[binding] = { type: "images", ...x };
				break;
			}
			case "stream": {
				const { binding, ...x } = info;
				output[binding] = { type: "stream", ...x };
				break;
			}
			case "version_metadata": {
				const { binding, ...x } = info;
				output[binding] = { type: "version_metadata", ...x };
				break;
			}
			case "hyperdrive": {
				for (const { binding, ...x } of info) {
					output[binding] = { type: "hyperdrive", ...x };
				}
				break;
			}
			case "vectorize": {
				for (const { binding, ...x } of info) {
					output[binding] = { type: "vectorize", ...x };
				}
				break;
			}
			case "ai_search_namespaces": {
				for (const { binding, ...x } of info) {
					output[binding] = { type: "ai_search_namespace", ...x };
				}
				break;
			}
			case "ai_search": {
				for (const { binding, ...x } of info) {
					output[binding] = { type: "ai_search", ...x };
				}
				break;
			}
			case "websearch": {
				const { binding, ...x } = info;
				output[binding] = { type: "websearch", ...x };
				break;
			}
			case "agent_memory": {
				for (const { binding, ...x } of info) {
					output[binding] = { type: "agent_memory", ...x };
				}
				break;
			}
			case "unsafe": {
				if (pages) {
					break;
				}
				for (const { type: unsafeType, name, ...data } of info.bindings ?? []) {
					output[name] = { type: `unsafe_${unsafeType}`, ...data };
				}
				break;
			}
			case "assets": {
				if (pages) {
					break;
				}
				if (info.binding) {
					output[info.binding] = { type: "assets" };
				}
				break;
			}
			case "pipelines": {
				if (pages) {
					break;
				}
				for (const { binding, ...x } of info) {
					output[binding] = { type: "pipeline", ...x };
				}
				break;
			}
			case "secrets_store_secrets": {
				for (const { binding, ...x } of info) {
					output[binding] = { type: "secrets_store_secret", ...x };
				}
				break;
			}
			case "artifacts": {
				for (const { binding, ...x } of info) {
					output[binding] = { type: "artifacts", ...x };
				}
				break;
			}
			case "unsafe_hello_world": {
				if (pages) {
					break;
				}
				for (const { binding, ...x } of info) {
					output[binding] = { type: "unsafe_hello_world", ...x };
				}
				break;
			}
			case "flagship": {
				for (const { binding, ...x } of info) {
					output[binding] = { type: "flagship", ...x };
				}
				break;
			}
			case "ratelimits": {
				for (const { name, ...x } of info) {
					output[name] = { type: "ratelimit", ...x };
				}
				break;
			}
			case "worker_loaders": {
				for (const { binding, ...x } of info) {
					output[binding] = { type: "worker_loader", ...x };
				}
				break;
			}
			case "vpc_services": {
				for (const { binding, ...x } of info) {
					output[binding] = { type: "vpc_service", ...x };
				}
				break;
			}
			case "vpc_networks": {
				for (const { binding, ...x } of info) {
					output[binding] = { type: "vpc_network", ...x };
				}
				break;
			}
			case "media": {
				const { binding, ...x } = info;
				output[binding] = { type: "media", ...x };
				break;
			}
			default:
				assertNever(type);
		}
	}

	return output;
}

export function isUnsafeBindingType(type: string): type is `unsafe_${string}` {
	return type.startsWith("unsafe_");
}

/**
 * What configuration key does this binding use for referring to it's binding name?
 */
const nameBindings = [
	"durable_object_namespace",
	"logfwdr",
	"ratelimit",
	"unsafe_ratelimit",
	"send_email",
] as const;

function getBindingKey(type: Binding["type"]) {
	if ((nameBindings as readonly string[]).includes(type)) {
		return "name";
	}
	return "binding";
}

type FlatBinding<Type> = Extract<Binding, { type: Type }> &
	(Type extends (typeof nameBindings)[number]
		? {
				name: string;
			}
		: {
				binding: string;
			});

export function extractBindingsOfType<Type extends Binding["type"]>(
	type: Type,
	bindings: Record<string, Binding> | undefined
): FlatBinding<Type>[] {
	return Object.entries(bindings ?? {})
		.filter(
			(binding): binding is [string, Extract<Binding, { type: Type }>] =>
				binding[1].type === type
		)
		.map((binding) => ({
			...binding[1],
			[getBindingKey(type)]: binding[0],
		})) as FlatBinding<Type>[];
}

/**
 * Get bindings from a Config object in the standard Record<string, Binding> format.
 */
export function getBindings(
	config: Config | undefined,
	options?: {
		pages?: boolean;
	}
): Record<string, Binding> {
	if (!config) {
		return {};
	}
	return convertConfigToBindings(config, {
		usePreviewIds: false,
		pages: options?.pages,
	});
}
