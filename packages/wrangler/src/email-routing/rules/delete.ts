import { createCommand } from "../../core/create-command";
import { confirm } from "../../dialogs";
import { logger } from "../../logger";
import { deleteEmailRoutingRule } from "../client";
import { domainArgs } from "../index";
import { resolveZoneId } from "../utils";

export const emailRoutingRulesDeleteCommand = createCommand({
	metadata: {
		description: "Delete an Email Routing rule",
		status: "open beta",
		owner: "Product: Email Service",
	},
	args: {
		...domainArgs,
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
	positionalArgs: ["domain", "rule-id"],
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
