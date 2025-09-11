import { UserError } from "../errors";
import { ServiceType } from "./index";
import type {
	ConnectivityServiceRequest,
	ServiceHost,
	ServicePortOptions,
} from "./index";

export interface ServiceArgs {
	name: string;
	type?: ServiceType;
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

function inferServiceType(options: ServicePortOptions): ServiceType {
	const hasTcpOptions = Boolean(options.tcpPort || options.appProtocol);
	const hasHttpOptions = Boolean(options.httpPort || options.httpsPort);

	if (!hasTcpOptions && !hasHttpOptions) {
		throw new Error(
			"Must specify either TCP options (--tcp-port/--app-protocol) or HTTP options (--http-port/--https-port)"
		);
	}

	return hasTcpOptions ? ServiceType.Tcp : ServiceType.Http;
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
	let resolverIpsList: string[] = [];
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
			resolver_ips: resolverIpsList,
		};
	} else {
		host.network = {
			tunnel_id: args.tunnelId,
		};
	}

	const serviceType = inferServiceType({
		tcpPort: args.tcpPort,
		appProtocol: args.appProtocol,
		httpPort: args.httpPort,
		httpsPort: args.httpsPort,
	});

	// Build the complete request
	const request: ConnectivityServiceRequest = {
		name: args.name,
		type: serviceType,
		host,
	};

	// Add service-specific fields
	if (serviceType == ServiceType.Tcp) {
		request.tcp_port = args.tcpPort;
		if (args.appProtocol) {
			request.app_protocol = args.appProtocol;
		}
	} else if (serviceType == ServiceType.Http) {
		if (args.httpPort) {
			request.http_port = args.httpPort;
		}
		if (args.httpsPort) {
			request.https_port = args.httpsPort;
		}
	}

	return request;
}
