import { createNamespace } from "../core/create-command";

export const vpcNamespace = createNamespace({
	metadata: {
		description: "🌐 Manage VPC",
		status: "open beta",
		owner: "Product: WVPC",
		category: "Compute & AI",
	},
});

export const vpcServiceNamespace = createNamespace({
	metadata: {
		description: "🔗 Manage VPC services",
		status: "stable",
		owner: "Product: WVPC",
	},
});

export enum ServiceType {
	Http = "http",
}

export interface ServicePortOptions {
	tcpPort?: number;
	appProtocol?: string;
	httpPort?: number;
	httpsPort?: number;
}

export interface TcpServiceConfig {
	name: string;
	tcp_port?: number;
	app_protocol?: string;
}

export interface HttpServiceConfig {
	name: string;
	http_port?: number;
	https_port?: number;
}

export interface Network {
	tunnel_id: string;
}

export interface ResolverNetwork {
	tunnel_id: string;
	resolver_ips?: string[];
}

export interface ServiceHost {
	ipv4?: string;
	ipv6?: string;
	hostname?: string;
	network?: Network;
	resolver_network?: ResolverNetwork;
}

export interface ConnectivityService {
	service_id: string;
	type: ServiceType;
	name: string;
	tcp_port?: number;
	app_protocol?: string;
	http_port?: number;
	https_port?: number;
	host: ServiceHost;
	created_at: string;
	updated_at: string;
}

export interface ConnectivityServiceRequest {
	name: string;
	type: ServiceType;
	tcp_port?: number;
	app_protocol?: string;
	http_port?: number;
	https_port?: number;
	host: ServiceHost;
}

export interface ConnectivityServiceListParams {
	service_type?: ServiceType;
}

export const serviceOptions = {
	name: {
		type: "string",
		demandOption: true,
		group: "Required Configuration",
		description: "The name of the VPC service",
	},
	type: {
		type: "string",
		demandOption: true,
		choices: ["http"],
		group: "Required Configuration",
		description: "The type of the VPC service",
	},
	"http-port": {
		type: "number",
		description: "HTTP port (default: 80)",
		group: "Port Configuration",
	},
	"https-port": {
		type: "number",
		description: "HTTPS port number (default: 443)",
		group: "Port Configuration",
	},
	ipv4: {
		type: "string",
		description: "IPv4 address for the host [conflicts with --ipv6]",
		conflicts: ["hostname", "resolver-ips", "ipv6"],
		group: "IP Configuration [conflicts with --hostname, --resolver-ips]",
	},
	ipv6: {
		type: "string",
		description: "IPv6 address for the host [conflicts with --ipv4]",
		conflicts: ["hostname", "resolver-ips", "ipv4"],
		group: "IP Configuration [conflicts with --hostname, --resolver-ips]",
	},
	hostname: {
		type: "string",
		description: "Hostname for the host",
		conflicts: ["ipv4", "ipv6"],
		group: "Hostname Configuration [conflicts with --ipv4, --ipv6]",
	},
	"resolver-ips": {
		type: "string",
		description: "Comma-separated list of resolver IPs",
		implies: ["hostname"],
		conflicts: ["ipv4", "ipv6"],
		group: "Hostname Configuration [conflicts with --ipv4, --ipv6]",
	},
	"tunnel-id": {
		type: "string",
		demandOption: true,
		group: "Required Configuration",
		description: "UUID of the Cloudflare tunnel",
	},
} as const;
