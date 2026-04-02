import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { enableEmailSending } from "../client";
import { zoneArgs } from "../index";
import { resolveZoneId } from "../utils";

export const emailSendingEnableCommand = createCommand({
	metadata: {
		description: "Enable Email Sending for a zone",
		status: "open beta",
		owner: "Product: Email Service",
	},
	args: {
		...zoneArgs,
	},
	async handler(args, { config }) {
		const zoneId = await resolveZoneId(config, args);
		const settings = await enableEmailSending(config, zoneId);

		logger.log(
			`Email Sending enabled for ${settings.name} (status: ${settings.status})`
		);
	},
});
