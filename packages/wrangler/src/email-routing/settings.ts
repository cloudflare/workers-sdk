import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { getEmailRoutingSettings } from "./client";
import { resolveZoneId } from "./utils";
import { domainArgs } from "./index";

export const emailRoutingSettingsCommand = createCommand({
	metadata: {
		description: "Get Email Routing settings for a zone",
		status: "open beta",
		owner: "Product: Email Service",
	},
	args: {
		...domainArgs,
	},
	positionalArgs: ["domain"],
	async handler(args, { config }) {
		const zoneId = await resolveZoneId(config, args);
		const settings = await getEmailRoutingSettings(config, zoneId);

		logger.log(`Email Routing for ${settings.name}:`);
		logger.log(`  Enabled:  ${settings.enabled}`);
		logger.log(`  Status:   ${settings.status}`);
		logger.log(`  Created:  ${settings.created}`);
		logger.log(`  Modified: ${settings.modified}`);
		logger.log(`  Tag:      ${settings.tag}`);
	},
});
