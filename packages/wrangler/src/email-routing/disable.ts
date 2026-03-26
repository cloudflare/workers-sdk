import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { disableEmailRouting } from "./client";
import { zoneArgs } from "./index";
import { resolveZoneId } from "./utils";

export const emailRoutingDisableCommand = createCommand({
	metadata: {
		description: "Disable Email Routing for a zone",
		status: "open beta",
		owner: "Product: Email Service",
	},
	args: {
		...zoneArgs,
	},
	async handler(args, { config }) {
		const zoneId = await resolveZoneId(config, args);
		await disableEmailRouting(config, zoneId);

		logger.log(`Email Routing disabled for zone ${zoneId}.`);
	},
});
