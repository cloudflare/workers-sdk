import { createNamespace } from "../core/create-command";

export const wvpcBetaWarning =
	"👷🏽 'wrangler wvpc ...' commands are currently in private beta. If your account isn't authorized, commands will fail.";

export const wvpcNamespace = createNamespace({
	metadata: {
		description: "🌐 Manage WVPC connectivity services",
		status: "private-beta",
		owner: "Product: WVPC",
	},
});

export const wvpcServiceNamespace = createNamespace({
	metadata: {
		description: "🔗 Manage WVPC connectivity services",
		status: "private-beta",
		owner: "Product: WVPC",
	},
});

export enum ServiceType {
	Tcp = "tcp",
	Http = "http",
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
	resolver_ips: string[];
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

export const serviceOptions = () =>
	({
		name: {
			type: "string",
			demandOption: true,
			description: "The name of the connectivity service",
		},
		type: {
			type: "string",
			choices: ["tcp", "http"],
			demandOption: true,
			description: "The type of service (tcp or http)",
		},
		"tcp-port": {
			type: "number",
			description: "TCP port number (required when type=tcp)",
		},
		"app-protocol": {
			type: "string",
			description: "Application protocol (e.g., postgresql, mysql)",
		},
		"http-port": {
			type: "number",
			description: "HTTP port number (default: 80)",
		},
		"https-port": {
			type: "number",
			description: "HTTPS port number (default: 443)",
		},
		ipv4: {
			type: "string",
			description: "IPv4 address for the host",
		},
		ipv6: {
			type: "string",
			description: "IPv6 address for the host",
		},
		hostname: {
			type: "string",
			description:
				"Hostname for the host (mutually exclusive with IP addresses)",
		},
		"tunnel-id": {
			type: "string",
			demandOption: true,
			description: "UUID of the Cloudflare tunnel",
		},
		"resolver-ips": {
			type: "string",
			description:
				"Comma-separated list of resolver IPs (required when using hostname)",
		},
	}) as const;
