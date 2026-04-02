import { createCommand } from "../../core/create-command";
import { confirm } from "../../dialogs";
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
		force: {
			type: "boolean",
			alias: "y",
			description: "Skip confirmation",
			default: false,
		},
	},
	positionalArgs: ["rule-id"],
	async handler(args, { config }) {
		const zoneId = await resolveZoneId(config, args);

		if (!args.force) {
			const confirmed = await confirm(
				`Are you sure you want to delete routing rule '${args.ruleId}'?`,
				{ fallbackValue: false }
			);
			if (!confirmed) {
				logger.log("Not deleting.");
				return;
			}
		}

		await deleteEmailRoutingRule(config, zoneId, args.ruleId);

		logger.log(`Deleted routing rule: ${args.ruleId}`);
	},
});
