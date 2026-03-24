import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { getService } from "./client";
import { displayServiceDetails } from "./shared";

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
		displayServiceDetails(service);

		logger.log(`   Created: ${new Date(service.created_at).toLocaleString()}`);
		logger.log(`   Modified: ${new Date(service.updated_at).toLocaleString()}`);
	},
});
