import type {
	ParsedInputWorkerConfig,
	ParsedOutputWorkerConfig,
} from "@cloudflare/config";
import type { Binding } from "@cloudflare/workers-utils";

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
			case "web-search":
				bindings[name] = {
					type: "websearch",
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
