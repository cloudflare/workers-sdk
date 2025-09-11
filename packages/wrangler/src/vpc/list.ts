import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { listServices } from "./client";
import { formatServiceForTable } from "./shared";

export const vpcServiceListCommand = createCommand({
	metadata: {
		description: "List VPC connectivity services",
		status: "stable",
		owner: "Product: WVPC",
	},
	args: {},
	async handler(args, { config }) {
		logger.log(`📋 Listing VPC connectivity services`);

		const services = await listServices(config);

		if (services.length === 0) {
			logger.log("No VPC connectivity services found");
			return;
		}

		logger.table(services.map(formatServiceForTable));
	},
});
