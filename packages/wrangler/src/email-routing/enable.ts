import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { enableEmailRouting } from "./client";
import { resolveZoneId } from "./utils";
import { domainArgs } from "./index";

export const emailRoutingEnableCommand = createCommand({
	metadata: {
		description: "Enable Email Routing for a zone",
		status: "open beta",
		owner: "Product: Email Service",
	},
	args: {
		...domainArgs,
	},
	positionalArgs: ["domain"],
	async handler(args, { config }) {
		const zoneId = await resolveZoneId(config, args);
		const settings = await enableEmailRouting(config, zoneId);

		logger.log(
			`Email Routing enabled for ${settings.name} (status: ${settings.status})`
		);
	},
});
