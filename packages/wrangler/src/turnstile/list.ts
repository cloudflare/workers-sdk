import { isNonInteractiveOrCI } from "@cloudflare/workers-utils";
import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { listWidgets, type Widget } from "./client";

function widgetRowForTable(widget: Widget) {
	return {
		sitekey: widget.sitekey,
		name: widget.name,
		mode: widget.mode,
		domains: widget.domains.join(", "),
		clearance_level: widget.clearance_level,
		bot_fight_mode: widget.bot_fight_mode ? "yes" : "no",
		region: widget.region,
		created_on: widget.created_on,
	};
}

export const turnstileWidgetListCommand = createCommand({
	metadata: {
		description: "List Turnstile widgets",
		status: "alpha",
		owner: "Product: Turnstile",
	},
	behaviour: {
		supportTemporary: true,
		printBanner: (args) => !args.json && !isNonInteractiveOrCI(),
	},
	args: {
		json: {
			type: "boolean",
			default: false,
			description: "Print widgets as JSON instead of a table",
		},
	},
	async handler(args, { config }) {
		const widgets = await listWidgets(config);

		if (args.json) {
			logger.log(JSON.stringify(widgets, null, 2));
			return;
		}

		if (widgets.length === 0) {
			logger.log("No Turnstile widgets found.");
			return;
		}

		const label = widgets.length === 1 ? "widget" : "widgets";
		logger.log(`Found ${widgets.length} ${label}:`);
		logger.table(widgets.map(widgetRowForTable));
	},
});
