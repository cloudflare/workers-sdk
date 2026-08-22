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
					remote: binding.remote,
				};
				break;
			case "ai":
				bindings[name] = { type: "ai", remote: binding.remote };
				break;
			case "ai-search":
				bindings[name] = {
					type: "ai_search",
					instance_name: binding.name,
					remote: binding.remote,
				};
				break;
			case "ai-search-namespace":
				bindings[name] = {
					type: "ai_search_namespace",
					namespace: binding.namespace,
					remote: binding.remote,
				};
				break;
			case "artifacts":
				bindings[name] = {
					type: "artifacts",
					namespace: binding.namespace,
					remote: binding.remote,
				};
				break;
			case "browser":
				bindings[name] = { type: "browser", remote: binding.remote };
				break;
			case "d1":
				bindings[name] = {
					type: "d1",
					database_id: binding.id,
					database_name: binding.name,
					remote: binding.remote,
				};
				break;
			case "dispatch-namespace":
				bindings[name] = {
					type: "dispatch_namespace",
					namespace: binding.namespace,
					outbound: binding.outbound
						? {
								service: binding.outbound.workerName,
								parameters: binding.outbound.parameters,
							}
						: undefined,
					remote: binding.remote,
				};
				break;
			case "flagship":
				bindings[name] = {
					type: "flagship",
					app_id: binding.id,
					remote: binding.remote,
				};
				break;
			case "images":
				bindings[name] = { type: "images", remote: binding.remote };
				break;
			case "kv":
				bindings[name] = {
					type: "kv_namespace",
					id: binding.id,
					remote: binding.remote,
				};
				break;
			case "media":
				bindings[name] = { type: "media", remote: binding.remote };
				break;
			case "mtls-certificate":
				bindings[name] = {
					type: "mtls_certificate",
					certificate_id: binding.id,
					remote: binding.remote,
				};
				break;
			case "pipeline":
				bindings[name] = {
					type: "pipeline",
					stream: binding.name,
					remote: binding.remote,
				};
				break;
			case "queue":
				bindings[name] = {
					type: "queue",
					queue_name: binding.name,
					delivery_delay: binding.deliveryDelay,
					remote: binding.remote,
				};
				break;
			case "r2":
				bindings[name] = {
					type: "r2_bucket",
					bucket_name: binding.name,
					jurisdiction: binding.jurisdiction,
					remote: binding.remote,
				};
				break;
			case "send-email":
				// TODO: Add remote send-email binding support once its
				// cloudflare.config.ts type accurately models the valid address options.
				break;
			case "stream":
				bindings[name] = { type: "stream", remote: binding.remote };
				break;
			case "vectorize":
				bindings[name] = {
					type: "vectorize",
					index_name: binding.name,
					remote: binding.remote,
				};
				break;
			case "vpc-network":
				bindings[name] = {
					type: "vpc_network",
					tunnel_id: binding.tunnelId,
					network_id: binding.networkId,
					remote: binding.remote,
				};
				break;
			case "vpc-service":
				bindings[name] = {
					type: "vpc_service",
					service_id: binding.id,
					remote: binding.remote,
				};
				break;
			case "web-search":
				bindings[name] = {
					type: "websearch",
					remote: binding.remote,
				};
				break;
			case "worker":
				bindings[name] = {
					type: "service",
					service: binding.workerName,
					entrypoint: binding.exportName,
					props: binding.props,
					remote: binding.remote,
				};
				break;
		}
	}

	return bindings;
}
