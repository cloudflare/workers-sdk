import { createCommand } from "../core/create-command";
import { confirm } from "../dialogs";
import { logger } from "../logger";
import { unlockEmailRoutingDns } from "./client";
import { resolveZoneId } from "./utils";
import { domainArgs } from "./index";

export const emailRoutingDnsUnlockCommand = createCommand({
	metadata: {
		description: "Unlock MX records for Email Routing",
		status: "open beta",
		owner: "Product: Email Service",
	},
	args: {
		...domainArgs,
		force: {
			type: "boolean",
			alias: "y",
			description: "Skip confirmation",
			default: false,
		},
	},
	positionalArgs: ["domain"],
	async handler(args, { config }) {
		const zoneId = await resolveZoneId(config, args);

		if (!args.force) {
			const confirmed = await confirm(
				"Are you sure you want to unlock MX records? This allows external MX records to be set.",
				{ fallbackValue: false }
			);
			if (!confirmed) {
				logger.log("Not unlocking.");
				return;
			}
		}

		const settings = await unlockEmailRoutingDns(config, zoneId);

		logger.log(
			`MX records unlocked for ${settings.name} (enabled: ${settings.enabled})`
		);
	},
});
