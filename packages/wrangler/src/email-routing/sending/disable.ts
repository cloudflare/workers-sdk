import { createCommand } from "../../core/create-command";
import { confirm } from "../../dialogs";
import { logger } from "../../logger";
import { deleteEmailSendingSubdomain } from "../client";
import { resolveDomain, resolveSendingSubdomain } from "../utils";

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
		"zone-id": {
			type: "string",
			description: "Zone ID (optional, skips zone lookup if provided)",
		},
		force: {
			type: "boolean",
			alias: "y",
			description: "Skip confirmation",
			default: false,
		},
	},
	positionalArgs: ["domain"],
	async handler(args, { config }) {
		const { zoneId, domain } = await resolveDomain(
			config,
			args.domain,
			args.zoneId
		);

		if (!args.force) {
			const confirmed = await confirm(
				`Are you sure you want to disable Email Sending for ${domain}?`,
				{ fallbackValue: false }
			);
			if (!confirmed) {
				logger.log("Not disabling.");
				return;
			}
		}

		const subdomain = await resolveSendingSubdomain(config, zoneId, domain);
		await deleteEmailSendingSubdomain(config, zoneId, subdomain.tag);

		logger.log(`Email Sending disabled for ${subdomain.name}`);
	},
});
