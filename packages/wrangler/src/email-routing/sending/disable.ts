import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { disableEmailSending } from "../client";
import { resolveDomain } from "../utils";

export const emailSendingDisableCommand = createCommand({
	metadata: {
		description: "Disable Email Sending for a zone or subdomain",
		status: "open beta",
		owner: "Product: Email Service",
	},
	args: {
		domain: {
			type: "string",
			demandOption: true,
			description:
				"Domain to disable sending for (e.g. example.com or notifications.example.com)",
		},
	},
	positionalArgs: ["domain"],
	async handler(args, { config }) {
		const { zoneId, isSubdomain, domain } = await resolveDomain(
			config,
			args.domain
		);
		const name = isSubdomain ? domain : undefined;
		const settings = await disableEmailSending(config, zoneId, name);

		if (settings) {
			logger.log(
				`Email Sending disabled for ${settings.name} (status: ${settings.status})`
			);
		} else {
			logger.log(`Email Sending disabled for ${domain}`);
		}
	},
});
