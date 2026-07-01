import { createCommand } from "../core/create-command";
import { isNonInteractiveOrCI } from "../is-interactive";
import { logger } from "../logger";
import { createWidget, WidgetRegions } from "./client";
import { sharedWidgetOptions } from ".";

export const turnstileWidgetCreateCommand = createCommand({
	metadata: {
		description: "Create a Turnstile widget",
		status: "alpha",
		owner: "Product: Turnstile",
	},
	behaviour: {
		supportTemporary: true,
		printBanner: (args) => !args.json && !isNonInteractiveOrCI(),
	},
	args: {
		name: {
			type: "string",
			demandOption: true,
			description: "Human-readable widget name",
		},
		...sharedWidgetOptions({ required: true }),
		region: {
			type: "string",
			choices: WidgetRegions,
			description:
				"Region where this widget can be used. Cannot be changed after creation.",
		},
		json: {
			type: "boolean",
			default: false,
			description: "Print the created widget as JSON only",
		},
	},
	positionalArgs: ["name"],
	async handler(args, { config }) {
		// Append a `(Wrangler)` suffix to the widget name so wrangler-created
		// widgets are attributable in the dashboard's widget list and in the
		// Turnstile analytics UI (parallel to how the dashboard's Spin flow
		// tags widgets with `(Spin)`). The regex matches trailing suffixes
		// with optional whitespace to avoid double-appending if a caller
		// deliberately included the marker themselves.
		const attributed = /\s\(Wrangler\)\s*$/.test(args.name)
			? args.name
			: `${args.name.trim()} (Wrangler)`;

		const widget = await createWidget(config, {
			name: attributed,
			domains: args.domain,
			mode: args.mode,
			bot_fight_mode: args.botFightMode,
			clearance_level: args.clearanceLevel,
			ephemeral_id: args.ephemeralId,
			offlabel: args.offlabel,
			region: args.region,
		});

		if (args.json) {
			logger.log(JSON.stringify(widget, null, 2));
			return;
		}

		logger.log(`✅ Created Turnstile widget '${widget.name}'`);
		logger.log(`   sitekey: ${widget.sitekey}`);
		logger.log(`   secret:  ${widget.secret}`);
		logger.log("");
		logger.log(
			"The sitekey is public; embed it in your frontend. The secret must stay on your backend and is used for siteverify:"
		);
		logger.log(
			"   POST https://challenges.cloudflare.com/turnstile/v0/siteverify"
		);
		logger.log('        { secret: "<secret>", response: "<turnstile-token>" }');
		logger.log("");
		logger.log(
			`To retrieve the secret later: \`wrangler turnstile widget get ${widget.sitekey}\`. It's redacted from \`list\` and \`update\` output but always available via \`get\`.`
		);
	},
});
