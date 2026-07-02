import { UserError } from "@cloudflare/workers-utils";
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
	behaviour: { supportTemporary: true },
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
	},
	positionalArgs: ["sitekey"],
	async handler({ sitekey, skipConfirmation }, { config }) {
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

		try {
			await deleteWidget(config, sitekey);
		} catch (err) {
			const cause = err instanceof Error ? err.message : String(err);
			throw new UserError(
				`Failed to delete Turnstile widget ${sitekey}: ${cause}`,
				{ telemetryMessage: "turnstile widget delete failed" }
			);
		}
		logger.log(`✅ Deleted Turnstile widget ${sitekey}`);
	},
});
