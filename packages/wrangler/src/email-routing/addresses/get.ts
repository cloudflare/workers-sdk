import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { getEmailRoutingAddress } from "../client";

export const emailRoutingAddressesGetCommand = createCommand({
	metadata: {
		description: "Get a specific Email Routing destination address",
		status: "open beta",
		owner: "Product: Email Service",
	},
	args: {
		"address-id": {
			type: "string",
			demandOption: true,
			description: "The ID of the destination address",
		},
	},
	positionalArgs: ["address-id"],
	async handler(args, { config }) {
		const address = await getEmailRoutingAddress(config, args.addressId);

		logger.log(`Destination address: ${address.email}`);
		logger.log(`  ID:       ${address.id}`);
		logger.log(`  Verified: ${address.verified || "pending"}`);
		logger.log(`  Created:  ${address.created}`);
		logger.log(`  Modified: ${address.modified}`);
	},
});
