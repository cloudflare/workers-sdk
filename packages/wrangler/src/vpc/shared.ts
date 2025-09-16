import type { ConnectivityService } from "./index";

export function formatServiceForTable(service: ConnectivityService) {
	// Build port info based on service type
	let ports = "";
	if (service.type === "http") {
		const httpPorts = [];
		if (service.http_port) {
			httpPorts.push(`HTTP:${service.http_port}`);
		}
		if (service.https_port) {
			httpPorts.push(`HTTPS:${service.https_port}`);
		}
		ports = httpPorts.join(", ");
	}

	// Build host info
	let host = "";
	if (service.host.hostname) {
		host = service.host.hostname;
	} else {
		const ips = [];
		if (service.host.ipv4) {
			ips.push(service.host.ipv4);
		}
		if (service.host.ipv6) {
			ips.push(service.host.ipv6);
		}
		host = ips.join(", ");
	}

	// Get tunnel ID
	const tunnelId =
		service.host.network?.tunnel_id ||
		service.host.resolver_network?.tunnel_id ||
		"";

	return {
		id: service.service_id,
		name: service.name,
		type: service.type,
		ports,
		host,
		tunnel: tunnelId.substring(0, 8) + "...", // Truncate for table display
		created: new Date(service.created_at).toLocaleString(),
		modified: new Date(service.updated_at).toLocaleString(),
	};
}
