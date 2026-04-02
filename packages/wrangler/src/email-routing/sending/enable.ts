import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { enableEmailSending } from "../client";
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
	},
	positionalArgs: ["domain"],
	async handler(args, { config }) {
		const { zoneId, isSubdomain, domain } = await resolveDomain(
			config,
			args.domain
		);
		const name = isSubdomain ? domain : undefined;
		const settings = await enableEmailSending(config, zoneId, name);

		logger.log(
			`Email Sending enabled for ${settings.name} (status: ${settings.status})`
		);
	},
});
