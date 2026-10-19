import { format } from "node:util";
import { maybeStartOrUpdateRemoteProxySession } from "@cloudflare/remote-bindings";
import { getZoneFromRoute } from "@cloudflare/workers-utils";
import type { DevLogger } from "./logger";
import type {
	ParsedInputSettingsConfig,
	ParsedInputWorkerConfig,
	ParsedOutputWorkerConfig,
} from "@cloudflare/config";
import type {
	RemoteBindingsLogger,
	RemoteProxySessionData,
} from "@cloudflare/remote-bindings";
import type { Binding, ComplianceConfig } from "@cloudflare/workers-utils";

type WorkerConfig = ParsedInputWorkerConfig | ParsedOutputWorkerConfig;

/**
 * Convert native config bindings to the transport shape consumed by the
 * remote-bindings session API. Local-only bindings are intentionally omitted.
 */
export function getRemoteBindings(
	config: Pick<WorkerConfig, "env">
): Record<string, Binding> {
	const bindings: Record<string, Binding> = {};

	for (const [name, binding] of Object.entries(config.env ?? {})) {
		switch (binding.type) {
			case "agent-memory":
				bindings[name] = {
					type: "agent_memory",
					namespace: binding.namespace,
					remote: binding.dev?.remote,
				};
				break;
			case "ai":
				bindings[name] = { type: "ai", remote: binding.dev?.remote };
				break;
			case "analytics":
				bindings[name] = {
					type: "analytics",
					remote: binding.dev?.remote,
				};
				break;
			case "ai-search":
				bindings[name] = {
					type: "ai_search",
					instance_name: binding.name,
					remote: binding.dev?.remote,
				};
				break;
			case "ai-search-namespace":
				bindings[name] = {
					type: "ai_search_namespace",
					namespace: binding.namespace,
					remote: binding.dev?.remote,
				};
				break;
			case "artifacts":
				bindings[name] = {
					type: "artifacts",
					namespace: binding.namespace,
					remote: binding.dev?.remote,
				};
				break;
			case "browser":
				bindings[name] = { type: "browser", remote: binding.dev?.remote };
				break;
			case "d1":
				bindings[name] = {
					type: "d1",
					database_id: binding.id,
					database_name: binding.name,
					remote: binding.dev?.remote,
				};
				break;
			case "dispatch-namespace":
				bindings[name] = {
					type: "dispatch_namespace",
					namespace: binding.namespace,
					outbound: binding.outbound
						? {
								service: binding.outbound.worker,
								parameters: binding.outbound.parameters,
							}
						: undefined,
					remote: binding.dev?.remote,
				};
				break;
			case "flagship":
				bindings[name] = {
					type: "flagship",
					app_id: binding.id,
					remote: binding.dev?.remote,
				};
				break;
			case "images":
				bindings[name] = { type: "images", remote: binding.dev?.remote };
				break;
			case "kv":
				bindings[name] = {
					type: "kv_namespace",
					id: binding.id,
					remote: binding.dev?.remote,
				};
				break;
			case "media":
				bindings[name] = { type: "media", remote: binding.dev?.remote };
				break;
			case "mtls-certificate":
				bindings[name] = {
					type: "mtls_certificate",
					certificate_id: binding.id,
					remote: binding.dev?.remote,
				};
				break;
			case "pipeline":
				bindings[name] = {
					type: "pipeline",
					stream: binding.name,
					remote: binding.dev?.remote,
				};
				break;
			case "k2":
				bindings[name] = {
					type: "k2",
					stream: binding.stream,
					remote: binding.dev?.remote,
				};
				break;
			case "queue":
				bindings[name] = {
					type: "queue",
					queue_name: binding.name,
					delivery_delay: binding.deliveryDelay,
					remote: binding.dev?.remote,
				};
				break;
			case "r2":
				bindings[name] = {
					type: "r2_bucket",
					bucket_name: binding.name,
					jurisdiction: binding.jurisdiction,
					remote: binding.dev?.remote,
				};
				break;
			case "send-email": {
				const shared = {
					type: "send_email",
					allowed_sender_addresses: binding.allowedSenderAddresses,
					remote: binding.dev?.remote,
				} as const;

				if (binding.destinationAddress !== undefined) {
					bindings[name] = {
						...shared,
						destination_address: binding.destinationAddress,
					};
				} else if (binding.allowedDestinationAddresses !== undefined) {
					bindings[name] = {
						...shared,
						allowed_destination_addresses: binding.allowedDestinationAddresses,
					};
				} else {
					bindings[name] = shared;
				}
				break;
			}
			case "stream":
				bindings[name] = { type: "stream", remote: binding.dev?.remote };
				break;
			case "vectorize":
				bindings[name] = {
					type: "vectorize",
					index_name: binding.name,
					remote: binding.dev?.remote,
				};
				break;
			case "vpc-network":
				bindings[name] = {
					type: "vpc_network",
					tunnel_id: binding.tunnelId,
					network_id: binding.networkId,
					remote: binding.dev?.remote,
				};
				break;
			case "vpc-service":
				bindings[name] = {
					type: "vpc_service",
					service_id: binding.id,
					remote: binding.dev?.remote,
				};
				break;
			case "worker":
				bindings[name] = {
					type: "service",
					service: binding.worker,
					entrypoint: binding.exportName,
					props: binding.props,
					remote: binding.dev?.remote,
				};
				break;
		}
	}

	return bindings;
}

export function toApiComplianceRegion(
	region: ParsedInputSettingsConfig["complianceRegion"]
): ComplianceConfig["compliance_region"] {
	return region === "fedramp-high" ? "fedramp_high" : region;
}

/** Existing remote proxy sessions keyed by Worker name. */
const remoteProxySessionsDataMap = new Map<
	string,
	RemoteProxySessionData | null
>();

/**
 * Starts a remote proxy session for the Worker's remote bindings, or updates
 * the existing one, so that it is reused across Miniflare updates.
 *
 * @returns The session data, or `null` when remote bindings are disabled
 */
export async function getRemoteProxySessionData(
	config: Pick<WorkerConfig, "name" | "env">,
	options: {
		remoteBindings: boolean;
		settings: Pick<ParsedInputSettingsConfig, "accountId" | "complianceRegion">;
		root: string;
		cliDisplayName: string;
		logger: DevLogger;
	}
): Promise<RemoteProxySessionData | null> {
	if (!options.remoteBindings) {
		return null;
	}

	const remoteProxySessionData = await maybeStartOrUpdateRemoteProxySession(
		{
			name: config.name,
			bindings: getRemoteBindings(config),
			complianceRegion: toApiComplianceRegion(
				options.settings.complianceRegion
			),
			account_id: options.settings.accountId,
			profileDir: options.root,
		},
		remoteProxySessionsDataMap.get(config.name) ?? null,
		undefined,
		{
			cliDisplayName: options.cliDisplayName,
			logger: createRemoteBindingsLogger(options.logger),
		}
	);

	if (remoteProxySessionData) {
		remoteProxySessionsDataMap.set(config.name, remoteProxySessionData);
	}

	return remoteProxySessionData;
}

function createRemoteBindingsLogger(logger: DevLogger): RemoteBindingsLogger {
	const write = (
		level: "info" | "warn" | "error",
		args: Parameters<typeof console.log>
	) => logger[level](format(...args));

	return {
		loggerLevel: "log",
		debug() {},
		log: (...args) => write("info", args),
		info: (...args) => write("info", args),
		warn: (...args) => write("warn", args),
		error: (...args) => write("error", args),
		console(method, ...args) {
			if (method === "error") {
				write("error", args);
			} else if (method === "warn") {
				write("warn", args);
			} else if (method !== "debug" && method !== "trace") {
				write("info", args);
			}
		},
	};
}

/**
 * Gets the zone that local requests to the Worker should appear to come from.
 */
export function getWorkerZone(
	config: Pick<ParsedInputWorkerConfig, "domains" | "triggers">
): string | undefined {
	// Domains are converted to routes before fetch triggers, so this mirrors the
	// first-route selection used by Wrangler's Miniflare options.
	const domain = config.domains?.[0];
	if (domain !== undefined) {
		return getZoneFromRoute(
			typeof domain === "string" ? domain : domain.hostname
		);
	}

	const fetchTrigger = config.triggers?.find(
		(trigger) => trigger.type === "fetch"
	);
	if (fetchTrigger?.type !== "fetch") {
		return undefined;
	}

	return getZoneFromRoute(
		fetchTrigger.zone?.includes(".")
			? { pattern: fetchTrigger.pattern, zone_name: fetchTrigger.zone }
			: fetchTrigger.pattern
	);
}
