import { createCommand } from "../../../core/create-command";
import { logger } from "../../../logger";
import { createEmailSendingSubdomain } from "../../client";
import { zoneArgs } from "../../index";
import { resolveZoneId } from "../../utils";

export const emailSendingSubdomainsCreateCommand = createCommand({
	metadata: {
		description: "Create an Email Sending subdomain",
		status: "open-beta",
		owner: "Product: Email Service",
	},
	args: {
		...zoneArgs,
		name: {
			type: "string",
			demandOption: true,
			description:
				"The subdomain name (e.g. sub.example.com). Must be within the zone.",
		},
	},
	positionalArgs: ["name"],
	async handler(args, { config }) {
		const zoneId = await resolveZoneId(config, args);
		const subdomain = await createEmailSendingSubdomain(
			config,
			zoneId,
			args.name
		);

		logger.log(`Created sending subdomain: ${subdomain.name}`);
		logger.log(`  Tag:             ${subdomain.tag}`);
		logger.log(
			`  Sending enabled: ${subdomain.email_sending_enabled}`
		);
		logger.log(
			`  DKIM selector:   ${subdomain.email_sending_dkim_selector || "(none)"}`
		);
		logger.log(
			`  Return path:     ${subdomain.email_sending_return_path_domain || "(none)"}`
		);
	},
});
