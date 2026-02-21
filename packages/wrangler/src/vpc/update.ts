import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { updateService } from "./client";
import { buildRequest, validateRequest } from "./validation";
import { serviceOptions, ServiceType } from "./index";

export const vpcServiceUpdateCommand = createCommand({
	metadata: {
		description: "Update a VPC service",
		status: "stable",
		owner: "Product: WVPC",
	},
	args: {
		"service-id": {
			type: "string",
			demandOption: true,
			description: "The ID of the VPC service to update",
		},
		...serviceOptions,
	},
	positionalArgs: ["service-id"],
	validateArgs: (args) => {
		// Validate arguments - this will throw UserError if validation fails
		validateRequest({
			name: args.name,
			type: args.type as ServiceType,
			tcpPort: args.tcpPort,
			httpPort: args.httpPort,
			httpsPort: args.httpsPort,
			ipv4: args.ipv4,
			ipv6: args.ipv6,
			hostname: args.hostname,
			tunnelId: args.tunnelId,
			resolverIps: args.resolverIps,
		});
	},
	async handler(args, { config }) {
		logger.log(`🚧 Updating VPC service '${args.serviceId}'`);

		const request = buildRequest({
			name: args.name,
			type: args.type as ServiceType,
			tcpPort: args.tcpPort,
			httpPort: args.httpPort,
			httpsPort: args.httpsPort,
			ipv4: args.ipv4,
			ipv6: args.ipv6,
			hostname: args.hostname,
			tunnelId: args.tunnelId,
			resolverIps: args.resolverIps,
		});

		const service = await updateService(config, args.serviceId, request);

		logger.log(`✅ Updated VPC service: ${service.service_id}`);
		logger.log(`   Name: ${service.name}`);
		logger.log(`   Type: ${service.type}`);

		// Display service-specific details
		if (service.type === ServiceType.Tcp) {
			logger.log(`   TCP Port: ${service.tcp_port}`);
		} else if (service.type === ServiceType.Http) {
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
	},
});
