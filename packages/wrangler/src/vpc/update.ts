import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { updateService } from "./client";
import { displayServiceDetails } from "./shared";
import { buildRequest, validateRequest } from "./validation";
import { serviceOptions, type ServiceType } from "./index";

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
			appProtocol: args.appProtocol,
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

		logger.log(`✅ Updated VPC service: ${service.service_id}`);
		displayServiceDetails(service);
	},
});
