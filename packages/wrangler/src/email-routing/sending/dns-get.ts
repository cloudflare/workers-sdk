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

		for (const r of records) {
			logger.log(`${r.type || "DNS"} record:`);
			logger.log(`  Name:     ${r.name || ""}`);
			logger.log(`  Content:  ${r.content || ""}`);
			if (r.priority !== undefined) {
				logger.log(`  Priority: ${r.priority}`);
			}
			if (r.ttl !== undefined) {
				logger.log(`  TTL:      ${r.ttl}`);
			}
			logger.log("");
		}
	},
});
