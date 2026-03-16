import { UserError } from "@cloudflare/workers-utils";
import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { updateEmailRoutingCatchAll } from "../client";
import { zoneArgs } from "../index";
import { resolveZoneId } from "../utils";

export const emailRoutingCatchAllUpdateCommand = createCommand({
	metadata: {
		description: "Update the Email Routing catch-all rule",
		status: "open-beta",
		owner: "Product: Email Routing",
	},
	args: {
		...zoneArgs,
		enabled: {
			type: "boolean",
			description: "Whether the catch-all rule is enabled",
		},
		"action-type": {
			type: "string",
			demandOption: true,
			description: "Action type (forward or drop)",
			choices: ["forward", "drop"],
		},
		"action-value": {
			type: "string",
			array: true,
			description:
				"Destination address(es) to forward to (required if action-type is forward)",
		},
	},
	validateArgs: (args) => {
		if (
			args.actionType === "forward" &&
			(!args.actionValue || args.actionValue.length === 0)
		) {
			throw new UserError(
				"--action-value is required when --action-type is 'forward'"
			);
		}
	},
	async handler(args, { config }) {
		const zoneId = await resolveZoneId(config, args);
		const rule = await updateEmailRoutingCatchAll(config, zoneId, {
			actions: [
				{
					type: args.actionType,
					value: args.actionValue,
				},
			],
			matchers: [{ type: "all" }],
			enabled: args.enabled,
		});

		logger.log(`Updated catch-all rule:`);
		logger.log(`  Enabled: ${rule.enabled}`);
		logger.log(`  Actions:`);
		for (const a of rule.actions) {
			if (a.value && a.value.length > 0) {
				logger.log(`    - ${a.type}: ${a.value.join(", ")}`);
			} else {
				logger.log(`    - ${a.type}`);
			}
		}
	},
});
