import { createCommand } from "../../core/create-command";
import { confirm } from "../../dialogs";
import { logger } from "../../logger";
import { deleteEmailRoutingAddress } from "../client";

export const emailRoutingAddressesDeleteCommand = createCommand({
	metadata: {
		description: "Delete an Email Routing destination address",
		status: "open beta",
		owner: "Product: Email Service",
	},
	args: {
		"address-id": {
			type: "string",
			demandOption: true,
			description: "The ID of the destination address to delete",
		},
		force: {
			type: "boolean",
			alias: "y",
			description: "Skip confirmation",
			default: false,
		},
	},
	positionalArgs: ["address-id"],
	async handler(args, { config }) {
		if (!args.force) {
			const confirmed = await confirm(
				`Are you sure you want to delete destination address '${args.addressId}'?`,
				{ fallbackValue: false }
			);
			if (!confirmed) {
				logger.log("Not deleting.");
				return;
			}
		}

		await deleteEmailRoutingAddress(config, args.addressId);

		logger.log(`Deleted destination address: ${args.addressId}`);
	},
});
