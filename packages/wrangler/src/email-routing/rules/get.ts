import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { getEmailRoutingRule } from "../client";
import { zoneArgs } from "../index";
import { resolveZoneId } from "../utils";

export const emailRoutingRulesGetCommand = createCommand({
	metadata: {
		description: "Get a specific Email Routing rule",
		status: "open-beta",
		owner: "Product: Email Routing",
	},
	args: {
		...zoneArgs,
		"rule-id": {
			type: "string",
			demandOption: true,
			description: "The ID of the routing rule",
		},
	},
	positionalArgs: ["rule-id"],
	async handler(args, { config }) {
		const zoneId = await resolveZoneId(config, args);
		const rule = await getEmailRoutingRule(config, zoneId, args.ruleId);

		logger.log(`Rule: ${rule.id}`);
		logger.log(`  Name:     ${rule.name || "(none)"}`);
		logger.log(`  Enabled:  ${rule.enabled}`);
		logger.log(`  Priority: ${rule.priority}`);
		logger.log(`  Matchers:`);
		for (const m of rule.matchers) {
			if (m.field && m.value) {
				logger.log(`    - ${m.type} ${m.field} = ${m.value}`);
			} else {
				logger.log(`    - ${m.type}`);
			}
		}
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
