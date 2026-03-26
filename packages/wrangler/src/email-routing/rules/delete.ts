import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { deleteEmailRoutingRule } from "../client";
import { zoneArgs } from "../index";
import { resolveZoneId } from "../utils";

export const emailRoutingRulesDeleteCommand = createCommand({
	metadata: {
		description: "Delete an Email Routing rule",
		status: "open beta",
		owner: "Product: Email Service",
	},
	args: {
		...zoneArgs,
		"rule-id": {
			type: "string",
			demandOption: true,
			description: "The ID of the routing rule to delete",
		},
	},
	positionalArgs: ["rule-id"],
	async handler(args, { config }) {
		const zoneId = await resolveZoneId(config, args);
		await deleteEmailRoutingRule(config, zoneId, args.ruleId);

		logger.log(`Deleted routing rule: ${args.ruleId}`);
	},
});
