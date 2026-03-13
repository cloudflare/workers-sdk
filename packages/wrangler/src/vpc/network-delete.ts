import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { deleteNetwork } from "./network-client";

export const vpcNetworkDeleteCommand = createCommand({
	metadata: {
		description: "Delete a VPC network",
		status: "open beta",
		owner: "Product: WVPC",
	},
	args: {
		"network-id": {
			type: "string",
			demandOption: true,
			description: "The ID of the network to delete",
		},
	},
	positionalArgs: ["network-id"],
	async handler(args, { config }) {
		logger.log(`🗑️  Deleting VPC network '${args.networkId}'`);

		await deleteNetwork(config, args.networkId);

		logger.log(`✅ Deleted VPC network: ${args.networkId}`);
	},
});
