import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { listServices } from "./client";
import { formatServiceForTable } from "./shared";
import { wvpcBetaWarning } from "./index";

export const wvpcServiceListCommand = createCommand({
	metadata: {
		description: "List WVPC connectivity services",
		status: "private-beta",
		owner: "Product: WVPC",
	},
	args: {
		"service-type": {
			type: "string",
			choices: ["tcp", "http"],
			description: "Filter by service type (tcp or http)",
		},
	},
	async handler(args, { config }) {
		logger.log(wvpcBetaWarning);
		logger.log(`📋 Listing WVPC connectivity services`);

		const services = await listServices(config);

		if (services.length === 0) {
			logger.log("No WVPC connectivity services found");
			return;
		}

		logger.table(services.map(formatServiceForTable));
	},
});
