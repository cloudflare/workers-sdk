import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { getEmailSendingSubdomainDns } from "../client";
import { resolveDomain, resolveSendingSubdomain } from "../utils";

export const emailSendingDnsGetCommand = createCommand({
	metadata: {
		description: "Get DNS records for an Email Sending domain",
		status: "open beta",
		owner: "Product: Email Service",
	},
	args: {
		domain: {
			type: "string",
			demandOption: true,
			description:
				"Domain to get DNS records for (e.g. example.com or notifications.example.com)",
		},
		"zone-id": {
			type: "string",
			description: "Zone ID (optional, skips zone lookup if provided)",
		},
	},
	positionalArgs: ["domain"],
	async handler(args, { config }) {
		const { zoneId, domain } = await resolveDomain(
			config,
			args.domain,
			args.zoneId
		);

		const subdomain = await resolveSendingSubdomain(config, zoneId, domain);
		const records = await getEmailSendingSubdomainDns(
			config,
			zoneId,
			subdomain.tag
		);

		if (records.length === 0) {
			logger.log("No DNS records found for this sending domain.");
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
