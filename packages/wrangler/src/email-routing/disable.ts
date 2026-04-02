import { createCommand } from "../core/create-command";
import { confirm } from "../dialogs";
import { logger } from "../logger";
import { disableEmailRouting } from "./client";
import { resolveZoneId } from "./utils";
import { domainArgs } from "./index";

export const emailRoutingDisableCommand = createCommand({
	metadata: {
		description: "Disable Email Routing for a zone",
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
				"Are you sure you want to disable Email Routing for this zone?",
				{ fallbackValue: false }
			);
			if (!confirmed) {
				logger.log("Not disabling.");
				return;
			}
		}

		const settings = await disableEmailRouting(config, zoneId);

		logger.log(
			`Email Routing disabled for ${settings.name} (status: ${settings.status})`
		);
	},
});
