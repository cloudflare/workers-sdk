import { JsonFriendlyFatalError } from "@cloudflare/workers-utils";
import { isNonInteractiveOrCI } from "@cloudflare/workers-utils";
import { createCommand } from "../core/create-command";
import { confirm } from "../dialogs";
import { logger } from "../logger";
import { deleteWidget } from "./client";

export const turnstileWidgetDeleteCommand = createCommand({
	metadata: {
		description: "Delete a Turnstile widget",
		status: "alpha",
		owner: "Product: Turnstile",
	},
	behaviour: {
		supportTemporary: true,
		printBanner: (args) => !args.json && !isNonInteractiveOrCI(),
	},
	args: {
		sitekey: {
			type: "string",
			demandOption: true,
			description: "The sitekey of the widget",
		},
		"skip-confirmation": {
			type: "boolean",
			alias: "y",
			default: false,
			description: "Skip confirmation prompt",
		},
		json: {
			type: "boolean",
			default: false,
			description: "Return output as JSON. Requires --skip-confirmation.",
		},
	},
	positionalArgs: ["sitekey"],
	async handler({ sitekey, skipConfirmation, json }, { config }) {
		if (json && !skipConfirmation) {
			throw new JsonFriendlyFatalError(
				JSON.stringify({
					error:
						"Pass --skip-confirmation (-y) to skip the confirmation prompt when using --json.",
				}),
				{ telemetryMessage: "turnstile widget delete json requires skip" }
			);
		}
		if (!skipConfirmation) {
			const proceed = await confirm(
				`About to delete Turnstile widget ${sitekey}. This breaks any deployed Worker still using the widget's sitekey or secret. Continue?`,
				{ defaultValue: false, fallbackValue: false }
			);
			if (!proceed) {
				logger.log("Deletion cancelled.");
				return;
			}
		}

		await deleteWidget(config, sitekey);
		if (json) {
			logger.log(JSON.stringify({ sitekey, success: true }, null, 2));
			return;
		}
		logger.log(`✅ Deleted Turnstile widget ${sitekey}`);
	},
});
