import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { createEmailSendingSubdomain } from "../client";
import { resolveDomain } from "../utils";

export const emailSendingEnableCommand = createCommand({
	metadata: {
		description: "Enable Email Sending for a zone or subdomain",
		status: "open beta",
		owner: "Product: Email Service",
	},
	args: {
		domain: {
			type: "string",
			demandOption: true,
			description:
				"Domain to enable sending for (e.g. example.com or notifications.example.com)",
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
		const subdomain = await createEmailSendingSubdomain(config, zoneId, domain);

		logger.log(
			`Email Sending enabled for ${subdomain.name} (enabled: ${subdomain.enabled})`
		);
	},
});
