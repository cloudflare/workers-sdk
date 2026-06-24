import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { resolveDomain, resolveSendingSubdomain } from "../utils";

export const emailSendingSettingsCommand = createCommand({
	metadata: {
		description: "Get Email Sending settings for a domain",
		status: "open beta",
		owner: "Product: Email Service",
	},
	args: {
		domain: {
			type: "string",
			demandOption: true,
			description: "Domain to get sending settings for (e.g. example.com)",
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

		logger.log(`Email Sending for ${subdomain.name}:`);
		logger.log(`  Enabled:            ${subdomain.enabled}`);
		logger.log(`  Tag:                ${subdomain.tag}`);
		logger.log(`  Created:            ${subdomain.created ?? ""}`);
		logger.log(`  Modified:           ${subdomain.modified ?? ""}`);
		logger.log(`  DKIM selector:      ${subdomain.dkim_selector ?? ""}`);
		logger.log(`  Return-path domain: ${subdomain.return_path_domain ?? ""}`);
	},
});
