import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { updateService } from "./client";
import { validateAndBuildRequest } from "./validation";
import { serviceOptions, ServiceType, wvpcBetaWarning } from "./index";

export const wvpcServiceUpdateCommand = createCommand({
	metadata: {
		description: "Update a WVPC connectivity service",
		status: "private-beta",
		owner: "Product: WVPC",
	},
	args: {
		"service-id": {
			type: "string",
			demandOption: true,
			description: "The ID of the connectivity service to update",
		},
		...serviceOptions(),
	},
	positionalArgs: ["service-id"],
	async handler(args, { config }) {
		logger.log(wvpcBetaWarning);
		logger.log(`🚧 Updating WVPC connectivity service '${args.serviceId}'`);

		// Validate arguments and build request
		const request = validateAndBuildRequest({
			name: args.name,
			type: args.type as ServiceType,
			tcpPort: args.tcpPort,
			appProtocol: args.appProtocol,
			httpPort: args.httpPort,
			httpsPort: args.httpsPort,
			ipv4: args.ipv4,
			ipv6: args.ipv6,
			hostname: args.hostname,
			tunnelId: args.tunnelId,
			resolverIps: args.resolverIps,
		});

		const service = await updateService(config, args.serviceId, request);

		logger.log(`✅ Updated WVPC connectivity service: ${service.service_id}`);
		logger.log(`   Name: ${service.service_config.name}`);
		logger.log(`   Type: ${service.service_config.type}`);

		// Display service-specific details
		if (service.service_config.type === ServiceType.Tcp) {
			if (service.service_config.tcp_port) {
				logger.log(`   TCP Port: ${service.service_config.tcp_port}`);
			}
			if (service.service_config.app_protocol) {
				logger.log(`   Protocol: ${service.service_config.app_protocol}`);
			}
		} else if (service.service_config.type === ServiceType.Http) {
			if (service.service_config.http_port) {
				logger.log(`   HTTP Port: ${service.service_config.http_port}`);
			}
			if (service.service_config.https_port) {
				logger.log(`   HTTPS Port: ${service.service_config.https_port}`);
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
			logger.log(
				`   Resolver IPs: ${service.host.resolver_network.resolver_ips.join(", ")}`
			);
		}
	},
});
