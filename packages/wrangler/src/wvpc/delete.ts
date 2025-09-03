import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { deleteService } from "./client";
import { wvpcBetaWarning } from "./index";

export const wvpcServiceDeleteCommand = createCommand({
	metadata: {
		description: "Delete a WVPC connectivity service",
		status: "private-beta",
		owner: "Product: WVPC",
	},
	args: {
		"service-id": {
			type: "string",
			demandOption: true,
			description: "The ID of the connectivity service to delete",
		},
	},
	positionalArgs: ["service-id"],
	async handler(args, { config }) {
		logger.log(wvpcBetaWarning);
		logger.log(`🗑️  Deleting WVPC connectivity service '${args.serviceId}'`);

		await deleteService(config, args.serviceId);

		logger.log(`✅ Deleted WVPC connectivity service: ${args.serviceId}`);
	},
});
