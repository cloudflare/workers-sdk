import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { createService } from "./client";
import { displayServiceDetails } from "./shared";
import { buildRequest, validateRequest } from "./validation";
import { serviceOptions, type ServiceType } from "./index";

export const vpcServiceCreateCommand = createCommand({
	metadata: {
		description: "Create a new VPC service",
		status: "stable",
		owner: "Product: WVPC",
	},
	args: {
		...serviceOptions,
	},
	positionalArgs: ["name"],
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
			certVerificationMode: args.certVerificationMode,
		});
	},
	async handler(args, { config }) {
		logger.log(`🚧 Creating VPC service '${args.name}'`);

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
			certVerificationMode: args.certVerificationMode,
		});

		const service = await createService(config, request);

		logger.log(`✅ Created VPC service: ${service.service_id}`);
		displayServiceDetails(service);
	},
});
