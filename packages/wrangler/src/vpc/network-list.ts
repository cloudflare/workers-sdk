import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { listNetworks } from "./network-client";
import { formatNetworkForTable } from "./network-shared";

export const vpcNetworkListCommand = createCommand({
	metadata: {
		description: "List VPC networks",
		status: "open beta",
		owner: "Product: WVPC",
	},
	args: {},
	async handler(_args, { config }) {
		logger.log(`📋 Listing VPC networks`);

		const networks = await listNetworks(config);

		if (networks.length === 0) {
			logger.log("No VPC networks found");
			return;
		}

		logger.table(networks.map(formatNetworkForTable));
	},
});
