import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { getEmailRoutingDns } from "./client";
import { zoneArgs } from "./index";
import { resolveZoneId } from "./utils";

export const emailRoutingDnsGetCommand = createCommand({
	metadata: {
		description: "Show DNS records required for Email Routing",
		status: "open beta",
		owner: "Product: Email Service",
	},
	args: {
		...zoneArgs,
	},
	async handler(args, { config }) {
		const zoneId = await resolveZoneId(config, args);
		const records = await getEmailRoutingDns(config, zoneId);

		if (records.length === 0) {
			logger.log("No DNS records found.");
			return;
		}

		logger.table(
			records.map((r) => ({
				type: r.type,
				name: r.name,
				content: r.content,
				priority: r.priority !== undefined ? String(r.priority) : "",
				ttl: String(r.ttl),
			}))
		);
	},
});
