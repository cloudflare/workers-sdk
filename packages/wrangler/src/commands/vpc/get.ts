import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { getService } from "./client";
import { ServiceType } from "./index";

export const vpcServiceGetCommand = createCommand({
	metadata: {
		description: "Get a VPC service",
		status: "stable",
		owner: "Product: WVPC",
	},
	args: {
		"service-id": {
			type: "string",
			demandOption: true,
			description: "The ID of the VPC service",
		},
	},
	positionalArgs: ["service-id"],
	async handler(args, { config }) {
		logger.log(`🔍 Getting VPC service '${args.serviceId}'`);

		const service = await getService(config, args.serviceId);

		logger.log(`✅ Retrieved VPC service: ${service.service_id}`);
		logger.log(`   Name: ${service.name}`);
		logger.log(`   Type: ${service.type}`);

		// Display service-specific details
		if (service.type === ServiceType.Http) {
			if (service.http_port) {
				logger.log(`   HTTP Port: ${service.http_port}`);
			}
			if (service.https_port) {
				logger.log(`   HTTPS Port: ${service.https_port}`);
			}
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

		logger.log(`   Created: ${new Date(service.created_at).toLocaleString()}`);
		logger.log(`   Modified: ${new Date(service.updated_at).toLocaleString()}`);
	},
});
