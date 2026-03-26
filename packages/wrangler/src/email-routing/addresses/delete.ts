import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { deleteEmailRoutingAddress } from "../client";

export const emailRoutingAddressesDeleteCommand = createCommand({
	metadata: {
		description: "Delete an Email Routing destination address",
		status: "open-beta",
		owner: "Product: Email Service",
	},
	args: {
		"address-id": {
			type: "string",
			demandOption: true,
			description: "The ID of the destination address to delete",
		},
	},
	positionalArgs: ["address-id"],
	async handler(args, { config }) {
		await deleteEmailRoutingAddress(config, args.addressId);

		logger.log(`Deleted destination address: ${args.addressId}`);
	},
});
