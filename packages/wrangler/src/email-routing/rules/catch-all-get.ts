import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { getEmailRoutingCatchAll } from "../client";
import { zoneArgs } from "../index";
import { resolveZoneId } from "../utils";

export const emailRoutingCatchAllGetCommand = createCommand({
	metadata: {
		description: "Get the Email Routing catch-all rule",
		status: "open-beta",
		owner: "Product: Email Routing",
	},
	args: {
		...zoneArgs,
	},
	async handler(args, { config }) {
		const zoneId = await resolveZoneId(config, args);
		const rule = await getEmailRoutingCatchAll(config, zoneId);

		logger.log(`Catch-all rule:`);
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
