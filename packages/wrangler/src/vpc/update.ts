import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { getService, updateService } from "./client";
import { displayServiceDetails } from "./shared";
import { buildRequest, toServiceArgs, validateRequest } from "./validation";
import { serviceOptions, tlsUpdateOptions } from "./index";

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
		...tlsUpdateOptions,
	},
	positionalArgs: ["service-id"],
	validateArgs: (args) => {
		validateRequest(toServiceArgs(args));
	},
	async handler(args, { config }) {
		logger.log(`🚧 Updating VPC service '${args.serviceId}'`);

		const serviceArgs = toServiceArgs(args);
		const existing = await getService(config, args.serviceId);
		const request = buildRequest(serviceArgs, existing);
		const service = await updateService(config, args.serviceId, request);

		logger.log(`✅ Updated VPC service: ${service.service_id}`);
		displayServiceDetails(service);
	},
});
