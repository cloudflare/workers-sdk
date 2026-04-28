import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { listEmailRoutingZones } from "./client";

export const emailRoutingListCommand = createCommand({
	metadata: {
		description: "List zones with Email Routing",
		status: "open beta",
		owner: "Product: Email Service",
	},
	args: {},
	async handler(_args, { config }) {
		const zones = await listEmailRoutingZones(config);

		if (zones.length === 0) {
			logger.log("No zones found with Email Routing in this account.");
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
