import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { disableEmailSending } from "../client";
import { zoneArgs } from "../index";
import { resolveZoneId } from "../utils";

export const emailSendingDisableCommand = createCommand({
	metadata: {
		description: "Disable Email Sending for a zone",
		status: "open beta",
		owner: "Product: Email Service",
	},
	args: {
		...zoneArgs,
	},
	async handler(args, { config }) {
		const zoneId = await resolveZoneId(config, args);
		const settings = await disableEmailSending(config, zoneId);

		logger.log(
			`Email Sending disabled for ${settings.name} (status: ${settings.status})`
		);
	},
});
