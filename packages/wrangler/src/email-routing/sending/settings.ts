import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { getEmailSendingSettings } from "../client";
import { resolveDomain } from "../utils";

export const emailSendingSettingsCommand = createCommand({
	metadata: {
		description: "Get Email Sending settings for a zone",
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
		const { zoneId } = await resolveDomain(config, args.domain, args.zoneId);
		const settings = await getEmailSendingSettings(config, zoneId);

		logger.log(`Email Sending for ${settings.name}:`);
		logger.log(`  Enabled:  ${settings.enabled}`);
		logger.log(`  Status:   ${settings.status}`);
		logger.log(`  Created:  ${settings.created}`);
		logger.log(`  Modified: ${settings.modified}`);

		const subdomains = settings.subdomains;
		if (Array.isArray(subdomains) && subdomains.length > 0) {
			logger.log(`  Subdomains:`);
			for (const s of subdomains) {
				logger.log(
					`    - ${s.name} (enabled: ${s.enabled}, status: ${s.status ?? "unknown"})`
				);
			}
		}
	},
});
