import type { ConnectivityNetwork } from "./index";

export function formatNetworkForTable(network: ConnectivityNetwork) {
	return {
		id: network.network_id,
		name: network.name,
		tunnel: network.tunnel_id.substring(0, 8) + "...",
		resolver_ips: network.resolver_ips?.join(", ") ?? "Default",
		created: new Date(network.created_at).toLocaleString(),
		modified: new Date(network.updated_at).toLocaleString(),
	};
}
