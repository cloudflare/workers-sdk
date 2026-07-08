import {
	UserError,
	type RawConfig,
	type Exports,
} from "@cloudflare/workers-utils";
import { isParsedUnsafeBinding } from "./schema";
import type { ParsedInputWorkerConfig } from "./schema";
import type { Json } from "./utils";

/**
 * Convert a parsed `@cloudflare/config` config into a Wrangler `RawConfig`.
 *
 * The caller is responsible for unwrapping any function/promise wrapper around
 * the config and validating it against `InputWorkerSchema` before passing it in.
 *
 * @param config The parsed (post-validation) config.
 * @returns The corresponding Wrangler `RawConfig`.
 */
export function convertToWranglerConfig(
	config: ParsedInputWorkerConfig
): RawConfig {
	const result: RawConfig = {};

	convertTopLevel(config, result);
	convertBindingsAndAssets(config, result);
	convertExports(config, result);
	convertDomains(config, result);
	convertTriggers(config, result);
	convertTailConsumers(config, result);

	return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// TOP-LEVEL FIELDS
// ═══════════════════════════════════════════════════════════════════════════

function convertTopLevel(
	config: ParsedInputWorkerConfig,
	result: RawConfig
): void {
	if (config.name !== undefined) {
		result.name = config.name;
	}
	if (typeof config.entrypoint === "string") {
		result.main = config.entrypoint;
	}
	if (config.accountId !== undefined) {
		result.account_id = config.accountId;
	}
	if (config.compatibilityDate !== undefined) {
		result.compatibility_date = config.compatibilityDate;
	}
	if (config.compatibilityFlags !== undefined) {
		result.compatibility_flags = config.compatibilityFlags;
	}
	if (config.workersDev !== undefined) {
		result.workers_dev = config.workersDev;
	}
	if (config.previewUrls !== undefined) {
		result.preview_urls = config.previewUrls;
	}
	if (config.logpush !== undefined) {
		result.logpush = config.logpush;
	}
	if (config.complianceRegion !== undefined) {
		result.compliance_region =
			config.complianceRegion === "fedramp-high" ? "fedramp_high" : "public";
	}
	if (config.firstPartyWorker !== undefined) {
		result.first_party_worker = config.firstPartyWorker;
	}
	if (config.placement !== undefined) {
		// `placement` shapes match 1:1 between the two configs.
		result.placement = config.placement;
	}
	if (config.limits !== undefined) {
		const limits: NonNullable<RawConfig["limits"]> = {};
		if (config.limits.cpuMs !== undefined) {
			limits.cpu_ms = config.limits.cpuMs;
		}
		if (config.limits.subrequests !== undefined) {
			limits.subrequests = config.limits.subrequests;
		}
		result.limits = limits;
	}
	if (config.observability !== undefined) {
		result.observability = convertObservability(config.observability);
	}
	if (config.cache !== undefined) {
		type RawCacheConfig = NonNullable<RawConfig["cache"]>;
		const cache: RawCacheConfig = {
			enabled: config.cache.enabled,
		};
		if (config.cache.crossVersionCache !== undefined) {
			cache.cross_version_cache = config.cache.crossVersionCache;
		}
		result.cache = cache;
	}
	if (config.unsafe !== undefined) {
		result.unsafe = convertUnsafeTopLevel(config.unsafe);
	}
}

function convertObservability(
	observability: NonNullable<ParsedInputWorkerConfig["observability"]>
): NonNullable<RawConfig["observability"]> {
	const out: NonNullable<RawConfig["observability"]> = {};
	if (observability.enabled !== undefined) {
		out.enabled = observability.enabled;
	}
	if (observability.headSamplingRate !== undefined) {
		out.head_sampling_rate = observability.headSamplingRate;
	}
	if (observability.logs !== undefined) {
		const logs: NonNullable<NonNullable<RawConfig["observability"]>["logs"]> =
			{};
		const { logs: src } = observability;
		if (src.enabled !== undefined) {
			logs.enabled = src.enabled;
		}
		if (src.headSamplingRate !== undefined) {
			logs.head_sampling_rate = src.headSamplingRate;
		}
		if (src.invocationLogs !== undefined) {
			logs.invocation_logs = src.invocationLogs;
		}
		if (src.persist !== undefined) {
			logs.persist = src.persist;
		}
		if (src.destinations !== undefined) {
			logs.destinations = src.destinations;
		}
		out.logs = logs;
	}
	if (observability.traces !== undefined) {
		const traces: NonNullable<
			NonNullable<RawConfig["observability"]>["traces"]
		> = {};
		const { traces: src } = observability;
		if (src.enabled !== undefined) {
			traces.enabled = src.enabled;
		}
		if (src.headSamplingRate !== undefined) {
			traces.head_sampling_rate = src.headSamplingRate;
		}
		if (src.persist !== undefined) {
			traces.persist = src.persist;
		}
		if (src.destinations !== undefined) {
			traces.destinations = src.destinations;
		}
		out.traces = traces;
	}
	return out;
}

function convertUnsafeTopLevel(
	unsafe: NonNullable<ParsedInputWorkerConfig["unsafe"]>
): NonNullable<RawConfig["unsafe"]> {
	const out: NonNullable<RawConfig["unsafe"]> = {};
	if (unsafe.metadata !== undefined) {
		out.metadata = unsafe.metadata;
	}
	if (unsafe.capnp !== undefined) {
		if ("compiledSchema" in unsafe.capnp && unsafe.capnp.compiledSchema) {
			out.capnp = { compiled_schema: unsafe.capnp.compiledSchema };
		} else if ("basePath" in unsafe.capnp && unsafe.capnp.basePath) {
			out.capnp = {
				base_path: unsafe.capnp.basePath,
				source_schemas: unsafe.capnp.sourceSchemas ?? [],
			};
		}
	}
	return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// BINDINGS + ASSETS
// ═══════════════════════════════════════════════════════════════════════════

function convertBindingsAndAssets(
	config: ParsedInputWorkerConfig,
	result: RawConfig
): void {
	let assetsBindingName: string | undefined;

	const env = config.env ?? {};

	// Accumulators for array bindings.
	const kvNamespaces: NonNullable<RawConfig["kv_namespaces"]> = [];
	const d1Databases: NonNullable<RawConfig["d1_databases"]> = [];
	const r2Buckets: NonNullable<RawConfig["r2_buckets"]> = [];
	const vectorize: NonNullable<RawConfig["vectorize"]> = [];
	const mtlsCertificates: NonNullable<RawConfig["mtls_certificates"]> = [];
	const hyperdrive: NonNullable<RawConfig["hyperdrive"]> = [];
	const pipelines: NonNullable<RawConfig["pipelines"]> = [];
	const flagship: NonNullable<RawConfig["flagship"]> = [];
	const aiSearch: NonNullable<RawConfig["ai_search"]> = [];
	const aiSearchNamespaces: NonNullable<RawConfig["ai_search_namespaces"]> = [];
	const agentMemory: NonNullable<RawConfig["agent_memory"]> = [];
	const analyticsEngineDatasets: NonNullable<
		RawConfig["analytics_engine_datasets"]
	> = [];
	const artifacts: NonNullable<RawConfig["artifacts"]> = [];
	const dispatchNamespaces: NonNullable<RawConfig["dispatch_namespaces"]> = [];
	const secretsStoreSecrets: NonNullable<RawConfig["secrets_store_secrets"]> =
		[];
	const sendEmail: NonNullable<RawConfig["send_email"]> = [];
	const vpcServices: NonNullable<RawConfig["vpc_services"]> = [];
	const vpcNetworks: NonNullable<RawConfig["vpc_networks"]> = [];
	const workerLoaders: NonNullable<RawConfig["worker_loaders"]> = [];
	const ratelimits: NonNullable<RawConfig["ratelimits"]> = [];
	const services: NonNullable<RawConfig["services"]> = [];
	const durableObjectBindings: NonNullable<
		NonNullable<RawConfig["durable_objects"]>["bindings"]
	> = [];
	const workflows: NonNullable<RawConfig["workflows"]> = [];
	const queueProducers: NonNullable<
		NonNullable<RawConfig["queues"]>["producers"]
	> = [];
	const logfwdrBindings: NonNullable<
		NonNullable<RawConfig["logfwdr"]>["bindings"]
	> = [];
	const unsafeBindings: NonNullable<
		NonNullable<RawConfig["unsafe"]>["bindings"]
	> = [];
	const vars: Record<string, string | Json> = {};
	const secretsRequired: string[] = [];

	for (const [name, binding] of Object.entries(env)) {
		if (isParsedUnsafeBinding(binding)) {
			unsafeBindings.push({
				...binding,
				name,
				type: binding.type.slice("unsafe:".length),
			});
			continue;
		}

		switch (binding.type) {
			case "agent-memory": {
				agentMemory.push(
					omitUndefined({
						binding: name,
						namespace: binding.namespace,
						remote: binding.remote,
					})
				);
				break;
			}
			case "ai": {
				result.ai = omitUndefined({ binding: name, remote: binding.remote });
				break;
			}
			case "ai-search": {
				aiSearch.push(
					omitUndefined({
						binding: name,
						instance_name: binding.name,
						remote: binding.remote,
					})
				);
				break;
			}
			case "ai-search-namespace": {
				aiSearchNamespaces.push(
					omitUndefined({
						binding: name,
						namespace: binding.namespace,
						remote: binding.remote,
					})
				);
				break;
			}
			case "analytics-engine-dataset": {
				analyticsEngineDatasets.push(
					omitUndefined({ binding: name, dataset: binding.name })
				);
				break;
			}
			case "artifacts": {
				artifacts.push(
					omitUndefined({
						binding: name,
						namespace: binding.namespace,
						remote: binding.remote,
					})
				);
				break;
			}
			case "assets": {
				assetsBindingName = name;
				break;
			}
			case "browser": {
				result.browser = omitUndefined({
					binding: name,
					remote: binding.remote,
				});
				break;
			}
			case "d1": {
				d1Databases.push(
					omitUndefined({
						binding: name,
						database_id: binding.id,
						database_name: binding.name,
						remote: binding.remote,
					})
				);
				break;
			}
			case "dispatch-namespace": {
				const entry: (typeof dispatchNamespaces)[number] = {
					binding: name,
					namespace: binding.namespace,
				};
				if (binding.outbound) {
					entry.outbound = omitUndefined({
						service: binding.outbound.workerName,
						parameters: binding.outbound.parameters,
					});
				}
				if (binding.remote !== undefined) {
					entry.remote = binding.remote;
				}
				dispatchNamespaces.push(entry);
				break;
			}
			case "durable-object": {
				durableObjectBindings.push({
					name,
					class_name: binding.exportName,
					script_name: binding.workerName,
				});
				break;
			}
			case "flagship": {
				flagship.push(
					omitUndefined({
						binding: name,
						app_id: binding.id,
						remote: binding.remote,
					})
				);
				break;
			}
			case "hyperdrive": {
				hyperdrive.push(
					omitUndefined({
						binding: name,
						id: binding.id,
						localConnectionString: binding.localConnectionString,
					})
				);
				break;
			}
			case "images": {
				result.images = omitUndefined({
					binding: name,
					remote: binding.remote,
				});
				break;
			}
			case "json": {
				vars[name] = binding.value as Json;
				break;
			}
			case "kv": {
				kvNamespaces.push(
					omitUndefined({
						binding: name,
						id: binding.id,
						remote: binding.remote,
					})
				);
				break;
			}
			case "logfwdr": {
				logfwdrBindings.push({ name, destination: binding.destination });
				break;
			}
			case "media": {
				result.media = omitUndefined({
					binding: name,
					remote: binding.remote,
				});
				break;
			}
			case "mtls-certificate": {
				mtlsCertificates.push(
					omitUndefined({
						binding: name,
						certificate_id: binding.id,
						remote: binding.remote,
					})
				);
				break;
			}
			case "pipeline": {
				pipelines.push(
					omitUndefined({
						binding: name,
						stream: binding.name,
						remote: binding.remote,
					})
				);
				break;
			}
			case "queue": {
				queueProducers.push(
					omitUndefined({
						binding: name,
						queue: binding.name,
						delivery_delay: binding.deliveryDelay,
						remote: binding.remote,
					})
				);
				break;
			}
			case "rate-limit": {
				ratelimits.push({
					name,
					namespace_id: binding.namespace,
					simple: binding.simple,
				});
				break;
			}
			case "r2": {
				r2Buckets.push(
					omitUndefined({
						binding: name,
						bucket_name: binding.name,
						jurisdiction: binding.jurisdiction,
						remote: binding.remote,
					})
				);
				break;
			}
			case "secret": {
				secretsRequired.push(name);
				break;
			}
			case "secrets-store-secret": {
				secretsStoreSecrets.push({
					binding: name,
					store_id: binding.storeId,
					secret_name: binding.secretName,
				});
				break;
			}
			case "send-email": {
				sendEmail.push(
					omitUndefined({
						name,
						destination_address: binding.destinationAddress,
						allowed_destination_addresses: binding.allowedDestinationAddresses,
						allowed_sender_addresses: binding.allowedSenderAddresses,
						remote: binding.remote,
					})
				);
				break;
			}
			case "stream": {
				result.stream = omitUndefined({
					binding: name,
					remote: binding.remote,
				});
				break;
			}
			case "text": {
				vars[name] = binding.value;
				break;
			}
			case "vectorize": {
				vectorize.push(
					omitUndefined({
						binding: name,
						index_name: binding.name,
						remote: binding.remote,
					})
				);
				break;
			}
			case "version-metadata": {
				result.version_metadata = { binding: name };
				break;
			}
			case "vpc-service": {
				vpcServices.push(
					omitUndefined({
						binding: name,
						service_id: binding.id,
						remote: binding.remote,
					})
				);
				break;
			}
			case "vpc-network": {
				// The schema's `superRefine` guarantees exactly one of `tunnelId`
				// or `networkId` is defined, so an `else` branch on the
				// `tunnelId` check is sufficient.
				if (binding.tunnelId !== undefined) {
					vpcNetworks.push(
						omitUndefined({
							binding: name,
							tunnel_id: binding.tunnelId,
							remote: binding.remote,
						})
					);
				} else if (binding.networkId !== undefined) {
					vpcNetworks.push(
						omitUndefined({
							binding: name,
							network_id: binding.networkId,
							remote: binding.remote,
						})
					);
				}
				break;
			}
			case "web-search": {
				result.websearch = omitUndefined({
					binding: name,
					remote: binding.remote,
				});
				break;
			}
			case "worker": {
				services.push(
					omitUndefined({
						binding: name,
						service: binding.workerName,
						entrypoint: binding.exportName,
						props: binding.props,
						remote: binding.remote,
					})
				);
				break;
			}
			case "worker-loader": {
				workerLoaders.push({ binding: name });
				break;
			}
			// TODO: re-enable when workflow bindings return.
			// case "workflow": {
			// 	workflows.push(
			// 		omitUndefined({
			// 			binding: name,
			// 			class_name: binding.exportName,
			// 			script_name: binding.workerName,
			// 			remote: binding.remote,
			// 		})
			// 	);
			// 	break;
			// }
		}
	}

	// Attach accumulated array bindings if non-empty.
	if (kvNamespaces.length) {
		result.kv_namespaces = kvNamespaces;
	}
	if (d1Databases.length) {
		result.d1_databases = d1Databases;
	}
	if (r2Buckets.length) {
		result.r2_buckets = r2Buckets;
	}
	if (vectorize.length) {
		result.vectorize = vectorize;
	}
	if (mtlsCertificates.length) {
		result.mtls_certificates = mtlsCertificates;
	}
	if (hyperdrive.length) {
		result.hyperdrive = hyperdrive;
	}
	if (pipelines.length) {
		result.pipelines = pipelines;
	}
	if (flagship.length) {
		result.flagship = flagship;
	}
	if (aiSearch.length) {
		result.ai_search = aiSearch;
	}
	if (aiSearchNamespaces.length) {
		result.ai_search_namespaces = aiSearchNamespaces;
	}
	if (agentMemory.length) {
		result.agent_memory = agentMemory;
	}
	if (analyticsEngineDatasets.length) {
		result.analytics_engine_datasets = analyticsEngineDatasets;
	}
	if (artifacts.length) {
		result.artifacts = artifacts;
	}
	if (dispatchNamespaces.length) {
		result.dispatch_namespaces = dispatchNamespaces;
	}
	if (secretsStoreSecrets.length) {
		result.secrets_store_secrets = secretsStoreSecrets;
	}
	if (sendEmail.length) {
		result.send_email = sendEmail;
	}
	if (vpcServices.length) {
		result.vpc_services = vpcServices;
	}
	if (vpcNetworks.length) {
		result.vpc_networks = vpcNetworks;
	}
	if (workerLoaders.length) {
		result.worker_loaders = workerLoaders;
	}
	if (ratelimits.length) {
		result.ratelimits = ratelimits;
	}
	if (services.length) {
		result.services = services;
	}
	if (durableObjectBindings.length) {
		result.durable_objects = { bindings: durableObjectBindings };
	}
	if (workflows.length) {
		result.workflows = workflows;
	}
	if (queueProducers.length) {
		result.queues = { ...(result.queues ?? {}), producers: queueProducers };
	}
	if (logfwdrBindings.length) {
		result.logfwdr = { bindings: logfwdrBindings };
	}
	if (unsafeBindings.length) {
		result.unsafe = { ...(result.unsafe ?? {}), bindings: unsafeBindings };
	}
	if (Object.keys(vars).length) {
		result.vars = vars;
	}
	if (secretsRequired.length) {
		result.secrets = { required: secretsRequired };
	}

	// Merge top-level `assets` config with the assets binding name.
	if (config.assets !== undefined || assetsBindingName !== undefined) {
		const assets: NonNullable<RawConfig["assets"]> = {};
		if (assetsBindingName !== undefined) {
			assets.binding = assetsBindingName;
		}
		if (config.assets?.htmlHandling !== undefined) {
			assets.html_handling = config.assets.htmlHandling;
		}
		if (config.assets?.notFoundHandling !== undefined) {
			assets.not_found_handling = config.assets.notFoundHandling;
		}
		if (config.assets?.runWorkerFirst !== undefined) {
			assets.run_worker_first = config.assets.runWorkerFirst;
		}
		result.assets = assets;
	}
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS (Workers + Durable Objects)
// ═══════════════════════════════════════════════════════════════════════════

function convertExports(
	config: ParsedInputWorkerConfig,
	result: RawConfig
): void {
	const exports = config.exports;
	if (!exports) {
		return;
	}

	const converted: Exports = {};
	const unknownExports: typeof exports = {};
	for (const [exportName, value] of Object.entries(exports)) {
		if (value.type === "worker") {
			converted[exportName] = value;
			continue;
		}

		if (value.type !== "durable-object") {
			unknownExports[exportName] = value;
			continue;
		}
		switch (value.state) {
			case undefined:
			case "created": {
				converted[exportName] = {
					type: "durable-object",
					storage: value.storage,
				};
				break;
			}
			case "deleted": {
				converted[exportName] = {
					type: "durable-object",
					state: "deleted",
				};
				break;
			}
			case "renamed": {
				converted[exportName] = {
					type: "durable-object",
					state: "renamed",
					renamed_to: value.renamedTo,
				};
				break;
			}
			case "transferred": {
				converted[exportName] = {
					type: "durable-object",
					state: "transferred",
					transferred_to: value.transferredTo,
				};
				break;
			}
			case "expecting-transfer": {
				converted[exportName] = {
					type: "durable-object",
					state: "expecting-transfer",
					storage: value.storage,
					transfer_from: value.transferFrom,
				};
				break;
			}
		}
	}
	if (Object.keys(unknownExports).length > 0) {
		throw new UserError(
			"Unknown export types found: " +
				Object.entries(unknownExports)
					.map(([exportName, { type }]) => `- ${exportName} : ${type}`)
					.join("\n"),
			{
				telemetryMessage: "Unknown export types found",
			}
		);
	}

	if (Object.keys(converted).length > 0) {
		result.exports = converted;
	}
}

// ═══════════════════════════════════════════════════════════════════════════
// TRIGGERS (scheduled + fetch + queue consumer)
// ═══════════════════════════════════════════════════════════════════════════

function convertTriggers(
	config: ParsedInputWorkerConfig,
	result: RawConfig
): void {
	const triggers = config.triggers;
	if (!triggers || triggers.length === 0) {
		return;
	}

	const crons: string[] = [];
	const routes: NonNullable<RawConfig["routes"]> = result.routes
		? [...result.routes]
		: [];
	const queueConsumers: NonNullable<
		NonNullable<RawConfig["queues"]>["consumers"]
	> = result.queues?.consumers ? [...result.queues.consumers] : [];

	for (const trigger of triggers) {
		switch (trigger.type) {
			case "scheduled": {
				crons.push(trigger.schedule);
				break;
			}
			case "fetch": {
				if (trigger.zone === undefined) {
					routes.push(trigger.pattern);
				} else if (trigger.zone.includes(".")) {
					routes.push({ pattern: trigger.pattern, zone_name: trigger.zone });
				} else {
					routes.push({ pattern: trigger.pattern, zone_id: trigger.zone });
				}
				break;
			}
			case "queue": {
				queueConsumers.push(
					omitUndefined({
						queue: trigger.name,
						dead_letter_queue: trigger.deadLetterQueue,
						max_batch_size: trigger.maxBatchSize,
						max_batch_timeout: trigger.maxBatchTimeout,
						max_concurrency: trigger.maxConcurrency,
						max_retries: trigger.maxRetries,
						retry_delay: trigger.retryDelay,
						visibility_timeout_ms: trigger.visibilityTimeoutMs,
					})
				);
				break;
			}
		}
	}

	if (crons.length) {
		result.triggers = { crons };
	}
	if (routes.length) {
		result.routes = routes;
	}
	if (queueConsumers.length) {
		result.queues = { ...(result.queues ?? {}), consumers: queueConsumers };
	}
}

// ═══════════════════════════════════════════════════════════════════════════
// DOMAINS (top-level domains -> custom-domain routes)
// ═══════════════════════════════════════════════════════════════════════════

function convertDomains(
	config: ParsedInputWorkerConfig,
	result: RawConfig
): void {
	if (!config.domains || config.domains.length === 0) {
		return;
	}
	const routes: NonNullable<RawConfig["routes"]> = result.routes
		? [...result.routes]
		: [];
	for (const domain of config.domains) {
		routes.push({ pattern: domain, custom_domain: true });
	}
	result.routes = routes;
}

// ═══════════════════════════════════════════════════════════════════════════
// TAIL CONSUMERS
// ═══════════════════════════════════════════════════════════════════════════

function convertTailConsumers(
	config: ParsedInputWorkerConfig,
	result: RawConfig
): void {
	const consumers = config.tailConsumers;
	if (!consumers || consumers.length === 0) {
		return;
	}
	const tail: NonNullable<RawConfig["tail_consumers"]> = [];
	const streaming: NonNullable<RawConfig["streaming_tail_consumers"]> = [];
	for (const consumer of consumers) {
		if (consumer.streaming) {
			streaming.push({ service: consumer.workerName });
		} else {
			tail.push({ service: consumer.workerName });
		}
	}
	if (tail.length) {
		result.tail_consumers = tail;
	}
	if (streaming.length) {
		result.streaming_tail_consumers = streaming;
	}
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Strip keys whose value is `undefined`. Returns a new object preserving the
 * input's value type.
 */
function omitUndefined<T extends Record<string, unknown>>(obj: T): T {
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(obj)) {
		if (value !== undefined) {
			out[key] = value;
		}
	}
	return out as T;
}
