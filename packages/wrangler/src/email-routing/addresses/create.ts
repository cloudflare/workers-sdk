import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { createEmailRoutingAddress } from "../client";

export const emailRoutingAddressesCreateCommand = createCommand({
	metadata: {
		description: "Create an Email Routing destination address",
		status: "open beta",
		owner: "Product: Email Service",
	},
	args: {
		email: {
			type: "string",
			demandOption: true,
			description: "Destination email address",
		},
	},
	positionalArgs: ["email"],
	async handler(args, { config }) {
		const address = await createEmailRoutingAddress(config, args.email);

		logger.log(`Created destination address: ${address.email}`);
		logger.log(`  ID: ${address.id}`);
		// The API does not send a verification email for addresses that are
		// already verified on the account (e.g. the account owner's email).
		if (address.verified) {
			logger.log(`  Verified: ${address.verified}`);
		} else {
			logger.log(
				`  A verification email has been sent. The address must be verified before it can be used.`
			);
		}
	},
});
