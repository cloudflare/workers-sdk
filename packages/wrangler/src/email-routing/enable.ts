import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { enableEmailRouting } from "./client";
import { zoneArgs } from "./index";
import { resolveZoneId } from "./utils";

export const emailRoutingEnableCommand = createCommand({
	metadata: {
		description: "Enable Email Routing for a zone",
		status: "open-beta",
		owner: "Product: Email Routing",
	},
	args: {
		...zoneArgs,
	},
	async handler(args, { config }) {
		const zoneId = await resolveZoneId(config, args);
		const settings = await enableEmailRouting(config, zoneId);

		logger.log(
			`Email Routing enabled for ${settings.name} (status: ${settings.status})`
		);
	},
});
