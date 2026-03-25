import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { createService } from "./client";
import { displayServiceDetails } from "./shared";
import { buildRequest, toServiceArgs, validateRequest } from "./validation";
import { serviceOptions } from "./index";

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
		validateRequest(toServiceArgs(args));
	},
	async handler(args, { config }) {
		logger.log(`🚧 Creating VPC service '${args.name}'`);

		const serviceArgs = toServiceArgs(args);
		const request = buildRequest(serviceArgs);
		const service = await createService(config, request);

		logger.log(`✅ Created VPC service: ${service.service_id}`);
		displayServiceDetails(service);
	},
});
