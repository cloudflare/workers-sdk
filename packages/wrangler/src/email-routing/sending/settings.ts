import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { getEmailSendingSettings } from "../client";
import { zoneArgs } from "../index";
import { resolveZoneId } from "../utils";

export const emailSendingSettingsCommand = createCommand({
	metadata: {
		description: "Get Email Sending settings for a zone",
		status: "open beta",
		owner: "Product: Email Service",
	},
	args: {
		...zoneArgs,
	},
	async handler(args, { config }) {
		const zoneId = await resolveZoneId(config, args);
		const settings = await getEmailSendingSettings(config, zoneId);

		logger.log(`Email Sending for ${settings.name}:`);
		logger.log(`  Enabled:  ${settings.enabled}`);
		logger.log(`  Status:   ${settings.status}`);
		logger.log(`  Created:  ${settings.created}`);
		logger.log(`  Modified: ${settings.modified}`);
	},
});
