import { UserError } from "@cloudflare/workers-utils";
import { createCommand } from "../core/create-command";
import { isNonInteractiveOrCI } from "../is-interactive";
import { logger } from "../logger";
import { getWidget, updateWidget } from "./client";
import { sharedWidgetOptions } from ".";

export const turnstileWidgetUpdateCommand = createCommand({
	metadata: {
		description: "Update a Turnstile widget",
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
		name: {
			type: "string",
			description: "New human-readable name for the widget",
		},
		...sharedWidgetOptions({ required: false }),
		json: {
			type: "boolean",
			default: false,
			description: "Print the updated widget as JSON only",
		},
	},
	positionalArgs: ["sitekey"],
	async handler(args, { config }) {
		const hasChanges =
			args.name !== undefined ||
			args.domain !== undefined ||
			args.mode !== undefined ||
			args.botFightMode !== undefined ||
			args.clearanceLevel !== undefined ||
			args.ephemeralId !== undefined ||
			args.offlabel !== undefined;
		if (!hasChanges) {
			throw new UserError(
				"No fields to update. Pass at least one of --name, --domain, --mode, --clearance-level, --bot-fight-mode, --ephemeral-id, --offlabel.",
				{ telemetryMessage: "turnstile widget update no fields" }
			);
		}

		// Turnstile PUT requires the full body (name, domains, mode). Fetch
		// the current widget so callers can change one field without losing
		// the rest.
		const current = await getWidget(config, args.sitekey);

		const updated = await updateWidget(config, args.sitekey, {
			name: args.name ?? current.name,
			domains: args.domain ?? current.domains,
			mode: args.mode ?? current.mode,
			bot_fight_mode: args.botFightMode ?? current.bot_fight_mode,
			clearance_level: args.clearanceLevel ?? current.clearance_level,
			ephemeral_id: args.ephemeralId ?? current.ephemeral_id,
			offlabel: args.offlabel ?? current.offlabel,
		});

		// Strip secret from output. The PUT response includes it, but `update`
		// is for config changes, not secret retrieval. Use `get` if you need
		// to see the secret.
		const { secret: _secret, ...withoutSecret } = updated;

		if (args.json) {
			logger.log(JSON.stringify(withoutSecret, null, 2));
			return;
		}

		logger.log(`✅ Updated Turnstile widget ${updated.sitekey}`);
		logger.log(JSON.stringify(withoutSecret, null, 2));
	},
});
