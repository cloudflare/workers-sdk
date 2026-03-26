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
		logger.log(
			`  A verification email has been sent. The address must be verified before it can be used.`
		);
	},
});
