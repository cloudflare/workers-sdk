import { UserError } from "@cloudflare/workers-utils";
import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { getEmailSendingSettings, getEmailSendingSubdomainDns } from "../client";
import { resolveDomain } from "../utils";

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
	},
	positionalArgs: ["domain"],
	async handler(args, { config }) {
		const { zoneId } = await resolveDomain(config, args.domain);

		// Find the subdomain tag by matching the domain name in settings
		const settings = await getEmailSendingSettings(config, zoneId);
		const subdomains = (settings as Record<string, unknown>).subdomains as
			| Array<{ tag: string; name: string }>
			| undefined;

		const match = subdomains?.find((s) => s.name === args.domain);
		if (!match) {
			throw new UserError(
				`No sending domain found for \`${args.domain}\`. Run \`wrangler email sending settings ${args.domain}\` to see configured domains.`
			);
		}

		const records = await getEmailSendingSubdomainDns(
			config,
			zoneId,
			match.tag
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
