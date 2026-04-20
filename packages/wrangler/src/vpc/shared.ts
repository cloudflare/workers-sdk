import { logger } from "../logger";
import { ServiceType } from "./index";
import type { ConnectivityService } from "./index";

export function displayServiceDetails(service: ConnectivityService) {
	logger.log(`   Name: ${service.name}`);
	logger.log(`   Type: ${service.type}`);

	// Display service-specific details
	if (service.type === ServiceType.Tcp) {
		if (service.tcp_port) {
			logger.log(`   TCP Port: ${service.tcp_port}`);
		}
		if (service.app_protocol) {
			logger.log(`   App Protocol: ${service.app_protocol}`);
		}
	} else if (service.type === ServiceType.Http) {
		if (service.http_port) {
			logger.log(`   HTTP Port: ${service.http_port}`);
		}
		if (service.https_port) {
			logger.log(`   HTTPS Port: ${service.https_port}`);
		}
	}

	// Display TLS settings
	if (service.tls_settings) {
		logger.log(
			`   Cert Verification Mode: ${service.tls_settings.cert_verification_mode}`
		);
	}

	// Display host details
	if (service.host.ipv4) {
		logger.log(`   IPv4: ${service.host.ipv4}`);
	}
	if (service.host.ipv6) {
		logger.log(`   IPv6: ${service.host.ipv6}`);
	}
	if (service.host.hostname) {
		logger.log(`   Hostname: ${service.host.hostname}`);
	}

	// Display network details
	if (service.host.network) {
		logger.log(`   Tunnel ID: ${service.host.network.tunnel_id}`);
	} else if (service.host.resolver_network) {
		logger.log(`   Tunnel ID: ${service.host.resolver_network.tunnel_id}`);
		if (service.host.resolver_network.resolver_ips) {
			logger.log(
				`   Resolver IPs: ${service.host.resolver_network.resolver_ips.join(", ")}`
			);
		}
	}
}

export function formatServiceForTable(service: ConnectivityService) {
	// Build port info based on service type
	let ports = "";
	if (service.type === "tcp") {
		if (service.tcp_port) {
			ports = `TCP:${service.tcp_port}`;
			if (service.app_protocol) {
				ports += ` (${service.app_protocol})`;
			}
		}
	} else if (service.type === "http") {
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
