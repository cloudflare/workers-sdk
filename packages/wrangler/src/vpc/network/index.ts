import { createNamespace } from "../../core/create-command";

export const vpcNetworkNamespace = createNamespace({
	metadata: {
		description: "🌐 Manage VPC networks",
		status: "open beta",
		owner: "Product: WVPC",
	},
});

export interface ConnectivityNetwork {
	network_id: string;
	name: string;
	tunnel_id: string;
	resolver_ips?: string[];
	created_at: string;
	updated_at: string;
}

export interface CreateConnectivityNetworkRequest {
	name: string;
	tunnel_id: string;
	resolver_ips?: string[];
}

export interface UpdateConnectivityNetworkRequest {
	name?: string;
	resolver_ips?: string[];
}
