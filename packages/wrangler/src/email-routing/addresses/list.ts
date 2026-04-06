import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { listEmailRoutingAddresses } from "../client";

export const emailRoutingAddressesListCommand = createCommand({
	metadata: {
		description: "List Email Routing destination addresses",
		status: "open beta",
		owner: "Product: Email Service",
	},
	args: {},
	async handler(_args, { config }) {
		const addresses = await listEmailRoutingAddresses(config);

		if (addresses.length === 0) {
			logger.log("No destination addresses found.");
			return;
		}

		logger.table(
			addresses.map((a) => ({
				id: a.id,
				email: a.email,
				verified: a.verified || "pending",
				created: a.created,
			}))
		);
	},
});
