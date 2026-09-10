import { extractConfigBindings } from "@cloudflare/deploy-helpers";
import type {
	Binding,
	EnvBindings,
	PreviewBaseConfig,
} from "@cloudflare/deploy-helpers";
import type { Config, PreviewsConfig } from "@cloudflare/workers-utils";

export const REPLACE_ME = "<REPLACE_ME>";

export type BindingReference = {
	name: string;
	type: string;
};

export type ProposedPreviewsConfig = {
	config: PreviewsConfig;
	omittedBindings: BindingReference[];
};

/** Converts Preview Base API data into local Preview configuration. */
export function convertPreviewBaseToPreviewsConfig(
	baseConfig: PreviewBaseConfig
): ProposedPreviewsConfig {
	const convertedBindings = convertBindings(baseConfig.env ?? {}, false);
	return {
		...convertedBindings,
		config: {
			...convertTopLevelSettings(
				{
					observability: baseConfig.observability,
					logpush: baseConfig.logpush,
					limits: baseConfig.limits,
					placement: baseConfig.placement,
					cache: baseConfig.cache,
					tail_consumers: baseConfig.tail_consumers?.map(({ name }) => ({
						service: name,
					})),
				},
				false
			),
			...convertedBindings.config,
		},
	};
}

/** Creates local Preview configuration without copying production values. */
export function convertProductionToPreviewsConfig(
	config: Config
): ProposedPreviewsConfig {
	const convertedBindings = convertBindings(
		extractConfigBindings({ ...config, assets: undefined, previews: config }),
		true
	);
	return {
		...convertedBindings,
		config: {
			...convertTopLevelSettings(
				{
					define: config.define,
					observability: config.observability,
					logpush: config.logpush,
					limits: config.limits,
					placement: config.placement,
					cache: config.cache,
					containers: config.containers,
					tail_consumers: config.tail_consumers,
					streaming_tail_consumers: config.streaming_tail_consumers,
				},
				true
			),
			...convertedBindings.config,
		},
	};
}

export function convertTopLevelSettings(
	settings: Pick<
		PreviewsConfig,
		| "define"
		| "observability"
		| "logpush"
		| "limits"
		| "placement"
		| "cache"
		| "containers"
		| "tail_consumers"
		| "streaming_tail_consumers"
	>,
	usePlaceholderValue: boolean
): PreviewsConfig {
	const converted: PreviewsConfig = {};
	for (const setting of Object.keys(settings) as Array<keyof typeof settings>) {
		switch (setting) {
			case "define": {
				const define = settings.define;
				if (define === undefined) {
					break;
				}
				converted.define = Object.fromEntries(
					Object.keys(define).map((name) => [
						name,
						usePlaceholderValue ? REPLACE_ME : define[name],
					])
				);
				break;
			}
			case "observability": {
				const observability = settings.observability;
				if (observability === undefined) {
					break;
				}
				converted.observability = {
					enabled: observability.enabled,
					head_sampling_rate: observability.head_sampling_rate,
					redact_query_string: observability.redact_query_string,
					...(observability.logs !== undefined && {
						logs: {
							enabled: observability.logs.enabled,
							head_sampling_rate: observability.logs.head_sampling_rate,
							invocation_logs: observability.logs.invocation_logs,
							persist: observability.logs.persist,
							...(observability.logs.destinations !== undefined && {
								destinations: usePlaceholderValue
									? Array.from(
											{
												length: observability.logs.destinations.length,
											},
											() => REPLACE_ME
										)
									: observability.logs.destinations,
							}),
						},
					}),
					...(observability.traces !== undefined && {
						traces: {
							enabled: observability.traces.enabled,
							head_sampling_rate: observability.traces.head_sampling_rate,
							persist: observability.traces.persist,
							...(observability.traces.destinations !== undefined && {
								destinations: usePlaceholderValue
									? Array.from(
											{
												length: observability.traces.destinations.length,
											},
											() => REPLACE_ME
										)
									: observability.traces.destinations,
							}),
						},
					}),
				};
				break;
			}
			case "logpush":
				if (!usePlaceholderValue && settings.logpush !== undefined) {
					converted.logpush = settings.logpush;
				}
				break;
			case "limits":
				if (!usePlaceholderValue && settings.limits !== undefined) {
					converted.limits = {
						cpu_ms: settings.limits.cpu_ms,
						subrequests: settings.limits.subrequests,
					};
				}
				break;
			case "placement": {
				const placement = settings.placement;
				if (placement === undefined) {
					break;
				}
				if (placement.mode === "smart") {
					converted.placement = {
						mode: placement.mode,
						...(placement.hint !== undefined && {
							hint: usePlaceholderValue ? REPLACE_ME : placement.hint,
						}),
					};
				} else if (placement.mode === "off") {
					converted.placement = { mode: placement.mode };
				} else if ("region" in placement) {
					converted.placement = {
						mode: placement.mode,
						region: usePlaceholderValue ? REPLACE_ME : placement.region,
					};
				} else if ("host" in placement) {
					converted.placement = {
						mode: placement.mode,
						host: usePlaceholderValue ? REPLACE_ME : placement.host,
					};
				} else if ("hostname" in placement) {
					converted.placement = {
						mode: placement.mode,
						hostname: usePlaceholderValue ? REPLACE_ME : placement.hostname,
					};
				}
				break;
			}
			case "cache":
				if (!usePlaceholderValue && settings.cache !== undefined) {
					converted.cache = {
						enabled: settings.cache.enabled,
						cross_version_cache: settings.cache.cross_version_cache,
					};
				}
				break;
			case "containers":
				break;
			case "tail_consumers":
				if (settings.tail_consumers !== undefined) {
					converted.tail_consumers = settings.tail_consumers.map(
						({ service }) => ({
							service: usePlaceholderValue ? REPLACE_ME : service,
						})
					);
				}
				break;
			case "streaming_tail_consumers":
				break;
			default: {
				const exhaustiveCheck: never = setting;
				throw new Error(`Unexpected Preview setting: ${exhaustiveCheck}`);
			}
		}
	}
	return converted;
}

export function convertBindings(
	bindings: EnvBindings,
	usePlaceholderValue: boolean
): ProposedPreviewsConfig {
	const config = new Map<string, unknown>();
	const omittedBindings: BindingReference[] = [];

	for (const [name, binding] of Object.entries(bindings)) {
		const converted = convertBinding(name, binding, usePlaceholderValue);
		if (converted === null) {
			omittedBindings.push({ name, type: binding.type });
		} else {
			for (const [field, value] of Object.entries(converted)) {
				const current = config.get(field);
				if (current === undefined) {
					config.set(field, value);
					continue;
				}
				// Flat binding lists append because EnvBindings already has unique names
				if (Array.isArray(current) && Array.isArray(value)) {
					config.set(field, [...current, ...value]);
					continue;
				}
				// Merge maps by key and append nested binding lists.
				// Other overlaps are duplicate singletons.
				if (
					typeof current === "object" &&
					current !== null &&
					!Array.isArray(current) &&
					typeof value === "object" &&
					value !== null &&
					!Array.isArray(value)
				) {
					const merged = new Map(Object.entries(current));
					for (const [key, next] of Object.entries(value)) {
						const existing = merged.get(key);
						if (existing === undefined) {
							merged.set(key, next);
						} else if (Array.isArray(existing) && Array.isArray(next)) {
							merged.set(key, [...existing, ...next]);
						} else {
							throw new Error(
								`Preview ${field} binding is defined more than once`
							);
						}
					}
					config.set(field, Object.fromEntries(merged));
					continue;
				}
				throw new Error(`Preview ${field} binding is defined more than once`);
			}
		}
	}

	return {
		config: Object.fromEntries(config) as PreviewsConfig,
		omittedBindings,
	};
}

/** Converts one binding, optionally replacing its values with placeholders. */
export function convertBinding(
	name: string,
	binding: Binding,
	usePlaceholderValue: boolean
): PreviewsConfig | null {
	switch (binding.type) {
		case "inherit":
			return null;
		case "plain_text":
			if (binding.text === undefined) {
				return null;
			}
			return {
				vars: {
					[name]: usePlaceholderValue ? REPLACE_ME : binding.text,
				},
			};
		case "secret_text":
			return null;
		case "json":
			if (binding.json === undefined) {
				return null;
			}
			return {
				vars: {
					[name]: usePlaceholderValue ? REPLACE_ME : binding.json,
				},
			};
		case "wasm_module":
			return null;
		case "text_blob":
			return null;
		case "browser":
			return { browser: { binding: name } };
		case "ai":
			if (binding.staging !== undefined) {
				return null;
			}
			return {
				ai: {
					binding: name,
				},
			};
		case "images":
			return { images: { binding: name } };
		case "stream":
			return { stream: { binding: name } };
		case "version_metadata":
			return { version_metadata: { binding: name } };
		case "data_blob":
			return null;
		case "ai_search_namespace":
			return null;
		case "ai_search":
			return null;
		case "websearch":
			return null;
		case "agent_memory":
			return null;
		case "kv_namespace":
			if (binding.namespace_id === undefined) {
				return null;
			}
			return {
				kv_namespaces: [
					{
						binding: name,
						id: usePlaceholderValue ? REPLACE_ME : binding.namespace_id,
					},
				],
			};
		case "media":
			return { media: { binding: name } };
		case "send_email":
			return {
				send_email: [
					{
						name,
						...(binding.destination_address !== undefined && {
							destination_address: usePlaceholderValue
								? REPLACE_ME
								: binding.destination_address,
						}),
						...(binding.allowed_destination_addresses !== undefined && {
							allowed_destination_addresses: usePlaceholderValue
								? binding.allowed_destination_addresses.map(() => REPLACE_ME)
								: binding.allowed_destination_addresses,
						}),
						...(binding.allowed_sender_addresses !== undefined && {
							allowed_sender_addresses: usePlaceholderValue
								? binding.allowed_sender_addresses.map(() => REPLACE_ME)
								: binding.allowed_sender_addresses,
						}),
					},
				],
			};
		case "durable_object_namespace":
			if (
				binding.class_name === undefined ||
				binding.environment !== undefined
			) {
				return null;
			}
			return {
				durable_objects: {
					bindings: [
						{
							name,
							class_name: usePlaceholderValue ? REPLACE_ME : binding.class_name,
							...(binding.script_name !== undefined && {
								script_name: usePlaceholderValue
									? REPLACE_ME
									: binding.script_name,
							}),
						},
					],
				},
			};
		case "workflow":
			if (
				binding.workflow_name === undefined ||
				binding.class_name === undefined
			) {
				return null;
			}
			return {
				workflows: [
					{
						binding: name,
						name: usePlaceholderValue ? REPLACE_ME : binding.workflow_name,
						class_name: usePlaceholderValue ? REPLACE_ME : binding.class_name,
						...(binding.script_name !== undefined && {
							script_name: usePlaceholderValue
								? REPLACE_ME
								: binding.script_name,
						}),
					},
				],
			};
		case "queue":
			if (binding.queue_name === undefined) {
				return null;
			}
			return {
				queues: {
					producers: [
						{
							binding: name,
							queue: usePlaceholderValue ? REPLACE_ME : binding.queue_name,
							delivery_delay: binding.delivery_delay,
						},
					],
				},
			};
		case "r2_bucket":
			if (
				binding.bucket_name === undefined ||
				binding.jurisdiction !== undefined
			) {
				return null;
			}
			return {
				r2_buckets: [
					{
						binding: name,
						bucket_name: usePlaceholderValue ? REPLACE_ME : binding.bucket_name,
					},
				],
			};
		case "d1": {
			const databaseId = binding.database_id ?? binding.id;
			if (databaseId === undefined) {
				return null;
			}
			return {
				d1_databases: [
					{
						binding: name,
						database_id: usePlaceholderValue ? REPLACE_ME : databaseId,
					},
				],
			};
		}
		case "vectorize":
			if (binding.index_name === undefined) {
				return null;
			}
			return {
				vectorize: [
					{
						binding: name,
						index_name: usePlaceholderValue ? REPLACE_ME : binding.index_name,
					},
				],
			};
		case "hyperdrive":
			if (binding.id === undefined) {
				return null;
			}
			return {
				hyperdrive: [
					{
						binding: name,
						id: usePlaceholderValue ? REPLACE_ME : binding.id,
					},
				],
			};
		case "service":
			if (
				binding.service === undefined ||
				Object.hasOwn(binding, "cross_account_grant")
			) {
				return null;
			}
			return {
				services: [
					{
						binding: name,
						service: usePlaceholderValue ? REPLACE_ME : binding.service,
						...(binding.environment !== undefined && {
							environment: usePlaceholderValue
								? REPLACE_ME
								: binding.environment,
						}),
						...(binding.entrypoint !== undefined && {
							entrypoint: usePlaceholderValue ? REPLACE_ME : binding.entrypoint,
						}),
					},
				],
			};
		case "analytics_engine":
			return {
				analytics_engine_datasets: [
					{
						binding: name,
						...(binding.dataset !== undefined && {
							dataset: usePlaceholderValue ? REPLACE_ME : binding.dataset,
						}),
					},
				],
			};
		case "dispatch_namespace":
			if (binding.namespace === undefined) {
				return null;
			}
			return {
				dispatch_namespaces: [
					{
						binding: name,
						namespace: usePlaceholderValue ? REPLACE_ME : binding.namespace,
						...(binding.outbound !== undefined && {
							outbound: {
								service: usePlaceholderValue
									? REPLACE_ME
									: binding.outbound.worker.service,
								...(binding.outbound.worker.environment !== undefined && {
									environment: usePlaceholderValue
										? REPLACE_ME
										: binding.outbound.worker.environment,
								}),
								parameters: usePlaceholderValue
									? Array.from(
											{ length: binding.outbound.params?.length ?? 0 },
											() => REPLACE_ME
										)
									: (binding.outbound.params?.map(({ name }) => name) ?? []),
							},
						}),
					},
				],
			};
		case "mtls_certificate":
			if (binding.certificate_id === undefined) {
				return null;
			}
			return {
				mtls_certificates: [
					{
						binding: name,
						certificate_id: usePlaceholderValue
							? REPLACE_ME
							: binding.certificate_id,
					},
				],
			};
		case "pipelines":
			if (binding.stream === undefined && binding.pipeline === undefined) {
				return null;
			}
			return {
				pipelines: [
					{
						binding: name,
						...(binding.stream !== undefined && {
							stream: usePlaceholderValue ? REPLACE_ME : binding.stream,
						}),
						...(binding.pipeline !== undefined && {
							pipeline: usePlaceholderValue ? REPLACE_ME : binding.pipeline,
						}),
					},
				],
			};
		case "secrets_store_secret":
			if (binding.store_id === undefined || binding.secret_name === undefined) {
				return null;
			}
			return {
				secrets_store_secrets: [
					{
						binding: name,
						store_id: usePlaceholderValue ? REPLACE_ME : binding.store_id,
						secret_name: usePlaceholderValue ? REPLACE_ME : binding.secret_name,
					},
				],
			};
		case "artifacts":
			if (binding.namespace === undefined) {
				return null;
			}
			return {
				artifacts: [
					{
						binding: name,
						namespace: usePlaceholderValue ? REPLACE_ME : binding.namespace,
					},
				],
			};
		case "unsafe_hello_world":
			return null;
		case "flagship":
			if (binding.app_id === undefined) {
				return null;
			}
			return {
				flagship: [
					{
						binding: name,
						app_id: usePlaceholderValue ? REPLACE_ME : binding.app_id,
					},
				],
			};
		case "ratelimit":
			if (binding.namespace_id === undefined || binding.simple === undefined) {
				return null;
			}
			return {
				ratelimits: [
					{
						name,
						namespace_id: usePlaceholderValue
							? REPLACE_ME
							: binding.namespace_id,
						simple: binding.simple,
					},
				],
			};
		case "vpc_service":
			if (binding.service_id === undefined) {
				return null;
			}
			return {
				vpc_services: [
					{
						binding: name,
						service_id: usePlaceholderValue ? REPLACE_ME : binding.service_id,
					},
				],
			};
		case "vpc_network":
			return null;
		case "worker_loader":
			return { worker_loaders: [{ binding: name }] };
		case "logfwdr":
			return null;
		case "assets":
			return null;
		default:
			return null;
	}
}
