import { UserError } from "../errors";
import type {
	ConnectivityServiceRequest,
	ServiceHost,
	ServiceType,
} from "./index";

export interface ValidationArgs {
	name: string;
	type: ServiceType;
	tcpPort?: number;
	appProtocol?: string;
	httpPort?: number;
	httpsPort?: number;
	ipv4?: string;
	ipv6?: string;
	hostname?: string;
	tunnelId: string;
	resolverIps?: string;
}

function validateUuid(uuid: string): boolean {
	const uuidRegex =
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
	return uuidRegex.test(uuid);
}

function validateIpAddress(ip: string, type: "ipv4" | "ipv6"): boolean {
	if (type === "ipv4") {
		const ipv4Regex =
			/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
		return ipv4Regex.test(ip);
	} else {
		// Basic IPv6 validation - could be more comprehensive
		const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$/;
		return ipv6Regex.test(ip) || ip.includes("::");
	}
}

export function validateAndBuildRequest(
	args: ValidationArgs
): ConnectivityServiceRequest {
	// Validate tunnel ID format
	if (!validateUuid(args.tunnelId)) {
		throw new UserError(`Invalid tunnel ID format. Must be a valid UUID.`);
	}

	// Validate service type specific arguments
	if (args.type === "tcp") {
		if (!args.tcpPort) {
			throw new UserError("TCP port is required when service type is 'tcp'");
		}
		if (args.tcpPort < 1 || args.tcpPort > 65535) {
			throw new UserError("TCP port must be between 1 and 65535");
		}
		if (args.httpPort || args.httpsPort) {
			throw new UserError("HTTP/HTTPS ports are not valid for TCP services");
		}
	} else if (args.type === "http") {
		if (args.tcpPort || args.appProtocol) {
			throw new UserError(
				"TCP port and app protocol are not valid for HTTP services"
			);
		}
		if (args.httpPort && (args.httpPort < 1 || args.httpPort > 65535)) {
			throw new UserError("HTTP port must be between 1 and 65535");
		}
		if (args.httpsPort && (args.httpsPort < 1 || args.httpsPort > 65535)) {
			throw new UserError("HTTPS port must be between 1 and 65535");
		}
	}

	// Validate host configuration - must have either IP addresses or hostname, not both
	const hasIpAddresses = Boolean(args.ipv4 || args.ipv6);
	const hasHostname = Boolean(args.hostname);

	if (!hasIpAddresses && !hasHostname) {
		throw new UserError(
			"Must specify either IP addresses (--ipv4/--ipv6) or hostname (--hostname)"
		);
	}

	if (hasIpAddresses && hasHostname) {
		throw new UserError(
			"Cannot specify both IP addresses and hostname. Choose one."
		);
	}

	// Validate IP address formats
	if (args.ipv4 && !validateIpAddress(args.ipv4, "ipv4")) {
		throw new UserError(`Invalid IPv4 address format: ${args.ipv4}`);
	}

	if (args.ipv6 && !validateIpAddress(args.ipv6, "ipv6")) {
		throw new UserError(`Invalid IPv6 address format: ${args.ipv6}`);
	}

	// Validate hostname configuration
	if (hasHostname && !args.resolverIps) {
		throw new UserError(
			"Resolver IPs are required when using hostname (--resolver-ips)"
		);
	}

	if (!hasHostname && args.resolverIps) {
		throw new UserError("Resolver IPs can only be used with hostname");
	}

	// Parse resolver IPs if provided
	let resolverIpsList: string[] = [];
	if (args.resolverIps) {
		resolverIpsList = args.resolverIps.split(",").map((ip) => ip.trim());
		for (const ip of resolverIpsList) {
			if (!validateIpAddress(ip, "ipv4") && !validateIpAddress(ip, "ipv6")) {
				throw new UserError(`Invalid resolver IP address: ${ip}`);
			}
		}
	}

	// Build the host configuration
	const host: ServiceHost = {
		ipv4: args.ipv4,
		ipv6: args.ipv6,
		hostname: args.hostname,
	};

	if (hasHostname) {
		host.resolver_network = {
			tunnel_id: args.tunnelId,
			resolver_ips: resolverIpsList,
		};
	} else {
		host.network = {
			tunnel_id: args.tunnelId,
		};
	}

	// Build the complete request
	const request: ConnectivityServiceRequest = {
		name: args.name,
		type: args.type,
		host,
	};

	// Add service-specific fields
	if (args.type === "tcp") {
		request.tcp_port = args.tcpPort;
		if (args.appProtocol) {
			request.app_protocol = args.appProtocol;
		}
	} else if (args.type === "http") {
		if (args.httpPort) {
			request.http_port = args.httpPort;
		}
		if (args.httpsPort) {
			request.https_port = args.httpsPort;
		}
	}

	return request;
}
