import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { unlockEmailRoutingDns } from "./client";
import { zoneArgs } from "./index";
import { resolveZoneId } from "./utils";

export const emailRoutingDnsUnlockCommand = createCommand({
	metadata: {
		description: "Unlock MX records for Email Routing",
		status: "open-beta",
		owner: "Product: Email Routing",
	},
	args: {
		...zoneArgs,
	},
	async handler(args, { config }) {
		const zoneId = await resolveZoneId(config, args);
		const settings = await unlockEmailRoutingDns(config, zoneId);

		logger.log(
			`MX records unlocked for ${settings.name} (status: ${settings.status})`
		);
	},
});
