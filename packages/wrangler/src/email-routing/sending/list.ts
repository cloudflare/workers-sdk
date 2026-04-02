import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { listEmailSendingZones } from "../client";

export const emailSendingListCommand = createCommand({
	metadata: {
		description: "List zones with Email Sending",
		status: "open beta",
		owner: "Product: Email Service",
	},
	args: {},
	async handler(_args, { config }) {
		const zones = await listEmailSendingZones(config);

		if (zones.length === 0) {
			logger.log("No zones found with Email Sending in this account.");
			return;
		}

		const results = zones.map((zone) => ({
			zone: zone.name,
			"zone id": zone.id,
			enabled: zone.enabled ? "yes" : "no",
		}));

		logger.table(results);
	},
});
