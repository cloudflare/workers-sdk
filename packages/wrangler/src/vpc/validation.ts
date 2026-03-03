import { UserError } from "@cloudflare/workers-utils";
import { ServiceType } from "./index";
import type { ConnectivityServiceRequest, ServiceHost } from "./index";

export interface ServiceArgs {
	name: string;
	type: ServiceType;
	tcpPort?: number;
	httpPort?: number;
	httpsPort?: number;
	ipv4?: string;
	ipv6?: string;
	hostname?: string;
	tunnelId: string;
	resolverIps?: string;
}

export function validateRequest(args: ServiceArgs) {
	// Validate host configuration - must have either IP addresses or hostname, not both
	const hasIpAddresses = Boolean(args.ipv4 || args.ipv6);
	const hasHostname = Boolean(args.hostname);

	if (!hasIpAddresses && !hasHostname) {
		throw new UserError(
			"Must specify either IP addresses (--ipv4/--ipv6) or hostname (--hostname)"
		);
	}
}

export function buildRequest(args: ServiceArgs): ConnectivityServiceRequest {
	// Parse resolver IPs if provided
	let resolverIpsList: string[] | undefined = undefined;
	if (args.resolverIps) {
		resolverIpsList = args.resolverIps.split(",").map((ip) => ip.trim());
	}

	// Build the host configuration
	const host: ServiceHost = {
		ipv4: args.ipv4,
		ipv6: args.ipv6,
		hostname: args.hostname,
	};

	if (args.hostname) {
		host.resolver_network = {
			tunnel_id: args.tunnelId,
			...(resolverIpsList && { resolver_ips: resolverIpsList }),
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
	if (args.type === ServiceType.Tcp) {
		request.tcp_port = args.tcpPort;
	} else if (args.type === ServiceType.Http) {
		request.http_port = args.httpPort;
		request.https_port = args.httpsPort;
	}

	return request;
}
