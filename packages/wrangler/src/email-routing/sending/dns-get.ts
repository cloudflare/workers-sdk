import { UserError } from "@cloudflare/workers-utils";
import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import {
	getEmailSendingDns,
	getEmailSendingSettings,
	getEmailSendingSubdomainDns,
} from "../client";
import { resolveDomain } from "../utils";
import type { EmailSendingDnsRecord } from "../index";

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
		const { zoneId, isSubdomain } = await resolveDomain(
			config,
			args.domain,
			args.zoneId
		);

		let records: EmailSendingDnsRecord[];

		if (!isSubdomain) {
			// Zone-level sending domain uses /email/sending/dns
			records = await getEmailSendingDns(config, zoneId);
		} else {
			// Subdomain — find the tag from settings and use the subdomain DNS endpoint
			const settings = await getEmailSendingSettings(config, zoneId);
			const match = settings.subdomains?.find((s) => s.name === args.domain);
			if (!match) {
				throw new UserError(
					`No sending subdomain found for \`${args.domain}\`. Run \`wrangler email sending settings ${args.domain}\` to see configured domains.`
				);
			}
			records = await getEmailSendingSubdomainDns(config, zoneId, match.tag);
		}

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
