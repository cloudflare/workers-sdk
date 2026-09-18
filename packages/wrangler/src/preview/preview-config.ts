import { extractConfigBindings } from "@cloudflare/deploy-helpers";
import { UserError } from "@cloudflare/workers-utils";
import { omitNullish } from "../utils/omit-nullish";
import type {
	Binding,
	EnvBindings,
	PreviewBaseConfig,
} from "@cloudflare/deploy-helpers";
import type {
	Config,
	Environment,
	PreviewsConfig,
} from "@cloudflare/workers-utils";

export const REPLACE_ME = "<REPLACE_ME>";

export type PreviewTopLevelSettings = {
	[K in keyof Pick<
		Environment,
		| "define"
		| "observability"
		| "logpush"
		| "limits"
		| "placement"
		| "cache"
		| "containers"
		| "tail_consumers"
		| "streaming_tail_consumers"
		| "queues"
		| "triggers"
	>]: Environment[K] | undefined;
};

export type PreviewSettingConversion =
	| {
			config?: PreviewsConfig;
			bindingLimitationName?: string;
			blockDeploymentMessage?: never;
	  }
	| {
			config?: never;
			bindingLimitationName?: never;
			blockDeploymentMessage: string;
	  };

export type ProposedPreviewsConfig = {
	config: PreviewsConfig;
	messages: string[];
	blockingDeploymentMessages: string[];
};

/** Converts Preview Base API data into local Preview configuration. */
export function convertPreviewBaseToPreviewsConfig(
	baseConfig: PreviewBaseConfig
): ProposedPreviewsConfig {
	const convertedSettings = convertPreviewSettings(
		baseConfig.env ?? {},
		{
			define: undefined,
			observability: baseConfig.observability,
			logpush: baseConfig.logpush,
			limits: baseConfig.limits,
			placement: baseConfig.placement,
			cache: baseConfig.cache,
			containers: undefined,
			tail_consumers: baseConfig.tail_consumers?.map(({ name }) => ({
				service: name,
			})),
			streaming_tail_consumers: undefined,
			queues: {},
			triggers: {},
		},
		false
	);
	return convertedSettings;
}

/** Creates local Preview configuration without copying production values. */
export function convertProductionToPreviewsConfig(
	config: Config
): ProposedPreviewsConfig {
	const convertedSettings = convertPreviewSettings(
		extractConfigBindings({ ...config, previews: config }),
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
			queues: config.queues,
			triggers: config.triggers,
		},
		true
	);
	return convertedSettings;
}

/**
 * `getBindings` uses a different shape than `convertBinding` accepts, so project
 * production config into `previews` to extract API-shaped bindings.
 * TODO: Unify the binding representations and remove this projection.
 */
export function getProductionBindingsExpectedInPreview(
	config: Config
): EnvBindings {
	const bindings = extractConfigBindings({ ...config, previews: config });
	return Object.fromEntries(
		Object.entries(bindings).filter(
			([name, binding]) =>
				convertBinding(name, binding, true).config !== undefined
		)
	);
}

export function convertTopLevelSetting(
	settings: PreviewTopLevelSettings,
	setting: keyof PreviewTopLevelSettings,
	usePlaceholderValue: boolean
): PreviewSettingConversion {
	const converted: PreviewsConfig = {};
	switch (setting) {
		case "define": {
			const define = settings.define;
			if (
				define === undefined ||
				(usePlaceholderValue && Object.keys(define).length === 0)
			) {
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
			if (usePlaceholderValue) {
				break;
			}
			const observability = settings.observability;
			if (observability === undefined) {
				break;
			}
			converted.observability = omitNullish({
				enabled: observability.enabled,
				head_sampling_rate: observability.head_sampling_rate,
				redact_query_string: observability.redact_query_string,
				issues:
					observability.issues === undefined
						? undefined
						: omitNullish({
								enabled: observability.issues.enabled,
							}),
				logs:
					observability.logs === undefined
						? undefined
						: omitNullish({
								enabled: observability.logs.enabled,
								head_sampling_rate: observability.logs.head_sampling_rate,
								invocation_logs: observability.logs.invocation_logs,
								persist: observability.logs.persist,
								destinations:
									observability.logs.destinations === undefined
										? undefined
										: usePlaceholderValue
											? observability.logs.destinations.map(() => REPLACE_ME)
											: observability.logs.destinations,
							}),
				traces:
					observability.traces === undefined
						? undefined
						: omitNullish({
								enabled: observability.traces.enabled,
								head_sampling_rate: observability.traces.head_sampling_rate,
								persist: observability.traces.persist,
								destinations:
									observability.traces.destinations === undefined
										? undefined
										: usePlaceholderValue
											? observability.traces.destinations.map(() => REPLACE_ME)
											: observability.traces.destinations,
							}),
			});
			break;
		}
		case "logpush":
			if (!usePlaceholderValue && settings.logpush !== undefined) {
				converted.logpush = settings.logpush;
			}
			break;
		case "limits":
			if (!usePlaceholderValue && settings.limits !== undefined) {
				converted.limits = omitNullish({
					cpu_ms: settings.limits.cpu_ms,
					subrequests: settings.limits.subrequests,
				});
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
				converted.placement = omitNullish({
					mode: placement.mode,
					region: usePlaceholderValue ? REPLACE_ME : placement.region,
				});
			} else if ("host" in placement) {
				converted.placement = omitNullish({
					mode: placement.mode,
					host: usePlaceholderValue ? REPLACE_ME : placement.host,
				});
			} else if ("hostname" in placement) {
				converted.placement = omitNullish({
					mode: placement.mode,
					hostname: usePlaceholderValue ? REPLACE_ME : placement.hostname,
				});
			}
			break;
		}
		case "cache":
			if (!usePlaceholderValue && settings.cache !== undefined) {
				converted.cache = omitNullish({
					enabled: settings.cache.enabled,
					cross_version_cache: settings.cache.cross_version_cache,
				});
			}
			break;
		case "tail_consumers":
			if (settings.tail_consumers !== undefined) {
				converted.tail_consumers = settings.tail_consumers.map(
					({ service }) => ({
						service: usePlaceholderValue ? REPLACE_ME : service,
					})
				);
				if (
					settings.tail_consumers.some(
						({ environment }) => environment !== undefined
					)
				) {
					return {
						config: converted,
						bindingLimitationName: "Tail consumer environments",
					};
				}
			}
			break;
		case "containers":
			if (settings.containers !== undefined && settings.containers.length > 0) {
				return {
					blockDeploymentMessage:
						"This Worker uses Containers. They are not included in the suggested Preview configuration.\nFollow the setup instructions so each Preview automatically gets a new, isolated Container app and state:\nhttps://developers.cloudflare.com/workers/previews/resources/#containers",
				};
			}
			break;
		case "streaming_tail_consumers":
			break;
		case "queues":
			if ((settings.queues?.consumers?.length ?? 0) > 0) {
				return { bindingLimitationName: "Queue consumers" };
			}
			break;
		case "triggers": {
			const hasCrons = (settings.triggers?.crons?.length ?? 0) > 0;
			const hasEvents = (settings.triggers?.events?.length ?? 0) > 0;
			if (hasCrons || hasEvents) {
				return {
					bindingLimitationName:
						hasCrons && hasEvents
							? "Cron and Artifacts event triggers"
							: hasCrons
								? "Cron triggers"
								: "Artifacts event triggers",
				};
			}
			break;
		}
		default: {
			const exhaustiveCheck: never = setting;
			throw new Error(`Unexpected Preview setting: ${exhaustiveCheck}`);
		}
	}
	return Object.keys(converted).length > 0 ? { config: converted } : {};
}

export function convertPreviewSettings(
	bindings: EnvBindings,
	settings: PreviewTopLevelSettings,
	usePlaceholderValue: boolean
): ProposedPreviewsConfig {
	const config = new Map<string, unknown>();
	const bindingLimitationNames = new Set<string>();
	const blockingDeploymentMessages = new Set<string>();

	const conversions = [
		...Object.entries(bindings).map(([name, binding]) =>
			convertBinding(name, binding, usePlaceholderValue)
		),
		...(Object.keys(settings) as Array<keyof PreviewTopLevelSettings>).map(
			(setting) =>
				convertTopLevelSetting(settings, setting, usePlaceholderValue)
		),
	];

	for (const converted of conversions) {
		if (converted.bindingLimitationName !== undefined) {
			bindingLimitationNames.add(converted.bindingLimitationName);
		}
		if (converted.blockDeploymentMessage !== undefined) {
			blockingDeploymentMessages.add(converted.blockDeploymentMessage);
		}
		if (converted.config !== undefined) {
			for (const [configField, configValue] of Object.entries(
				converted.config
			)) {
				const current = config.get(configField);
				if (current === undefined) {
					config.set(configField, configValue);
					continue;
				}
				// Flat binding lists append because EnvBindings already has unique names
				if (Array.isArray(current) && Array.isArray(configValue)) {
					config.set(configField, [...current, ...configValue]);
					continue;
				}
				// Merge maps by key and append nested binding lists.
				// Other overlaps are duplicate singletons.
				if (
					typeof current === "object" &&
					current !== null &&
					!Array.isArray(current) &&
					typeof configValue === "object" &&
					configValue !== null &&
					!Array.isArray(configValue)
				) {
					const merged = new Map(Object.entries(current));
					for (const [key, next] of Object.entries(configValue)) {
						const existing = merged.get(key);
						if (existing === undefined) {
							merged.set(key, next);
						} else if (Array.isArray(existing) && Array.isArray(next)) {
							merged.set(key, [...existing, ...next]);
						} else {
							throw new UserError(
								`Preview ${configField} binding is defined more than once. Rename one of the bindings so each Preview setting is produced only once.`,
								{
									telemetryMessage:
										"preview command duplicate previews binding",
								}
							);
						}
					}
					config.set(configField, Object.fromEntries(merged));
					continue;
				}
				throw new UserError(
					`Preview ${configField} binding is defined more than once. Rename one of the bindings so each Preview setting is produced only once.`,
					{
						telemetryMessage: "preview command duplicate previews binding",
					}
				);
			}
		}
	}

	return {
		config: Object.fromEntries(config) as PreviewsConfig,
		messages: [
			...(bindingLimitationNames.size === 0
				? []
				: [
						`These settings have limitations in Worker Previews: ${[
							...bindingLimitationNames,
						].join(
							", "
						)}.\nWrangler did not add them automatically. Review the limitations, then decide how you want to configure them for your Preview.\nLearn more: https://developers.cloudflare.com/workers/previews/limitations/`,
					]),
		],
		blockingDeploymentMessages: [...blockingDeploymentMessages],
	};
}

/** Converts one binding into Preview configuration or a policy outcome. */
export function convertBinding(
	name: string,
	binding: Binding,
	usePlaceholderValue: boolean
): PreviewSettingConversion {
	let config: PreviewsConfig | undefined;
	switch (binding.type) {
		case "plain_text":
			if (binding.text === undefined) {
				break;
			}
			config = {
				vars: {
					[name]: usePlaceholderValue ? REPLACE_ME : binding.text,
				},
			};
			break;
		case "json":
			if (binding.json === undefined) {
				break;
			}
			config = {
				vars: {
					[name]: usePlaceholderValue ? REPLACE_ME : binding.json,
				},
			};
			break;
		case "browser":
			config = { browser: { binding: name } };
			break;
		case "ai":
			config = {
				ai: {
					binding: name,
					...(binding.staging !== undefined && {
						staging: binding.staging,
					}),
				},
			};
			break;
		case "images":
			config = { images: { binding: name } };
			break;
		case "stream":
			config = { stream: { binding: name } };
			break;
		case "version_metadata":
			config = { version_metadata: { binding: name } };
			break;
		case "kv_namespace":
			if (binding.namespace_id === undefined) {
				break;
			}
			config = {
				kv_namespaces: [
					{
						binding: name,
						id: usePlaceholderValue ? REPLACE_ME : binding.namespace_id,
					},
				],
			};
			break;
		case "media":
			config = { media: { binding: name } };
			break;
		case "send_email":
			config = {
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
			break;
		case "durable_object_namespace":
			return {
				blockDeploymentMessage:
					"This Worker uses Durable Objects. They are not included in the suggested Preview configuration.\nFollow the setup instructions so each Preview automatically gets a new, isolated Durable Object namespace:\nhttps://developers.cloudflare.com/workers/previews/resources/#durable-objects",
			};
		case "workflow":
			return { bindingLimitationName: "Workflows" };
		case "queue":
			if (binding.queue_name === undefined) {
				break;
			}
			config = {
				queues: {
					producers: [
						omitNullish({
							binding: name,
							queue: usePlaceholderValue ? REPLACE_ME : binding.queue_name,
							delivery_delay: binding.delivery_delay,
						}),
					],
				},
			};
			break;
		case "r2_bucket":
			if (binding.bucket_name === undefined) {
				break;
			}
			config = {
				r2_buckets: [
					{
						binding: name,
						bucket_name: usePlaceholderValue ? REPLACE_ME : binding.bucket_name,
						jurisdiction: binding.jurisdiction,
					},
				],
			};
			break;
		case "d1": {
			const databaseId = binding.database_id ?? binding.id;
			if (databaseId === undefined) {
				break;
			}
			config = {
				d1_databases: [
					{
						binding: name,
						database_id: usePlaceholderValue ? REPLACE_ME : databaseId,
					},
				],
			};
			break;
		}
		case "vectorize":
			if (binding.index_name === undefined) {
				break;
			}
			config = {
				vectorize: [
					{
						binding: name,
						index_name: usePlaceholderValue ? REPLACE_ME : binding.index_name,
					},
				],
			};
			break;
		case "ai_search_namespace":
			if (binding.namespace === undefined) {
				break;
			}
			config = {
				ai_search_namespaces: [
					{
						binding: name,
						namespace: usePlaceholderValue ? REPLACE_ME : binding.namespace,
					},
				],
			};
			break;
		case "ai_search":
			if (binding.instance_name === undefined) {
				break;
			}
			config = {
				ai_search: [
					{
						binding: name,
						instance_name: usePlaceholderValue
							? REPLACE_ME
							: binding.instance_name,
					},
				],
			};
			break;
		case "hyperdrive":
			if (binding.id === undefined) {
				break;
			}
			config = {
				hyperdrive: [
					{
						binding: name,
						id: usePlaceholderValue ? REPLACE_ME : binding.id,
					},
				],
			};
			break;
		case "service":
			return { bindingLimitationName: "Service Bindings" };
		case "analytics_engine":
			config = {
				analytics_engine_datasets: [
					{
						binding: name,
						...(binding.dataset !== undefined && {
							dataset: usePlaceholderValue ? REPLACE_ME : binding.dataset,
						}),
					},
				],
			};
			break;
		case "dispatch_namespace":
			if (binding.namespace === undefined) {
				break;
			}
			config = {
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
									: (binding.outbound.params?.map(
											({ name: parameterName }) => parameterName
										) ?? []),
							},
						}),
					},
				],
			};
			break;
		case "mtls_certificate":
			if (binding.certificate_id === undefined) {
				break;
			}
			config = {
				mtls_certificates: [
					{
						binding: name,
						certificate_id: usePlaceholderValue
							? REPLACE_ME
							: binding.certificate_id,
					},
				],
			};
			break;
		case "pipelines":
			if (binding.stream === undefined && binding.pipeline === undefined) {
				break;
			}
			config = {
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
			break;
		case "secrets_store_secret":
			if (binding.store_id === undefined || binding.secret_name === undefined) {
				break;
			}
			config = {
				secrets_store_secrets: [
					{
						binding: name,
						store_id: usePlaceholderValue ? REPLACE_ME : binding.store_id,
						secret_name: usePlaceholderValue ? REPLACE_ME : binding.secret_name,
					},
				],
			};
			break;
		case "artifacts":
			if (binding.namespace === undefined) {
				break;
			}
			config = {
				artifacts: [
					{
						binding: name,
						namespace: usePlaceholderValue ? REPLACE_ME : binding.namespace,
					},
				],
			};
			break;
		case "flagship":
			if (binding.app_id === undefined) {
				break;
			}
			config = {
				flagship: [
					{
						binding: name,
						app_id: usePlaceholderValue ? REPLACE_ME : binding.app_id,
					},
				],
			};
			break;
		case "ratelimit":
			if (binding.namespace_id === undefined || binding.simple === undefined) {
				break;
			}
			config = {
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
			break;
		case "vpc_service":
			if (binding.service_id === undefined) {
				break;
			}
			config = {
				vpc_services: [
					{
						binding: name,
						service_id: usePlaceholderValue ? REPLACE_ME : binding.service_id,
					},
				],
			};
			break;
		case "worker_loader":
			config = { worker_loaders: [{ binding: name }] };
			break;
		default:
			break;
	}
	return config === undefined ? {} : { config };
}
