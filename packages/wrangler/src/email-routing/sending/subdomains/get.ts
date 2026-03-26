import { createCommand } from "../../../core/create-command";
import { logger } from "../../../logger";
import { getEmailSendingSubdomain } from "../../client";
import { zoneArgs } from "../../index";
import { resolveZoneId } from "../../utils";

export const emailSendingSubdomainsGetCommand = createCommand({
	metadata: {
		description: "Get a specific Email Sending subdomain",
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
		const subdomain = await getEmailSendingSubdomain(
			config,
			zoneId,
			args.subdomainId
		);

		logger.log(`Sending subdomain: ${subdomain.name}`);
		logger.log(`  Tag:              ${subdomain.tag}`);
		logger.log(
			`  Sending enabled:  ${subdomain.email_sending_enabled}`
		);
		logger.log(
			`  DKIM selector:    ${subdomain.email_sending_dkim_selector || "(none)"}`
		);
		logger.log(
			`  Return path:      ${subdomain.email_sending_return_path_domain || "(none)"}`
		);
		logger.log(`  Created:          ${subdomain.created || "(unknown)"}`);
		logger.log(`  Modified:         ${subdomain.modified || "(unknown)"}`);
	},
});
