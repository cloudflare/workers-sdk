import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { deleteService } from "./client";

export const vpcServiceDeleteCommand = createCommand({
	metadata: {
		description: "Delete a VPC service",
		status: "stable",
		owner: "Product: WVPC",
		logArgs: true,
	},
	args: {
		"service-id": {
			type: "string",
			demandOption: true,
			description: "The ID of the service to delete",
		},
	},
	positionalArgs: ["service-id"],
	async handler(args, { config }) {
		logger.log(`🗑️  Deleting VPC service '${args.serviceId}'`);

		await deleteService(config, args.serviceId);

		logger.log(`✅ Deleted VPC service: ${args.serviceId}`);
	},
});
