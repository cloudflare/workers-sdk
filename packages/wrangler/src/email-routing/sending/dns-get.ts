import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { getEmailSendingSubdomainDns } from "../client";
import { zoneArgs } from "../index";
import { resolveZoneId } from "../utils";

export const emailSendingDnsGetCommand = createCommand({
	metadata: {
		description: "Get DNS records for an Email Sending subdomain",
		status: "open beta",
		owner: "Product: Email Service",
	},
	args: {
		...zoneArgs,
		"subdomain-id": {
			type: "string",
			demandOption: true,
			description: "The sending subdomain identifier (tag)",
		},
	},
	positionalArgs: ["subdomain-id"],
	async handler(args, { config }) {
		const zoneId = await resolveZoneId(config, args);
		const records = await getEmailSendingSubdomainDns(
			config,
			zoneId,
			args.subdomainId
		);

		if (records.length === 0) {
			logger.log("No DNS records found for this sending subdomain.");
			return;
		}

		logger.table(
			records.map((r) => ({
				type: r.type || "",
				name: r.name || "",
				content: r.content || "",
				priority: r.priority !== undefined ? String(r.priority) : "",
				ttl: r.ttl !== undefined ? String(r.ttl) : "",
			}))
		);
	},
});
