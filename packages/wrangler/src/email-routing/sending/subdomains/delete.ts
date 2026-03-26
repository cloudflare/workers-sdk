import { createCommand } from "../../../core/create-command";
import { logger } from "../../../logger";
import { deleteEmailSendingSubdomain } from "../../client";
import { zoneArgs } from "../../index";
import { resolveZoneId } from "../../utils";

export const emailSendingSubdomainsDeleteCommand = createCommand({
	metadata: {
		description: "Delete an Email Sending subdomain",
		status: "open-beta",
		owner: "Product: Email Routing",
	},
	args: {
		...zoneArgs,
		"subdomain-id": {
			type: "string",
			demandOption: true,
			description: "The sending subdomain identifier (tag) to delete",
		},
	},
	positionalArgs: ["subdomain-id"],
	async handler(args, { config }) {
		const zoneId = await resolveZoneId(config, args);
		await deleteEmailSendingSubdomain(config, zoneId, args.subdomainId);

		logger.log(`Deleted sending subdomain: ${args.subdomainId}`);
	},
});
