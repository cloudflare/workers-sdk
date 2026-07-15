import { isNonInteractiveOrCI } from "@cloudflare/workers-utils";
import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { getWidget, type Widget } from "./client";

function formatWidget(widget: Widget): string {
	const rows: [string, string][] = [
		["Sitekey", widget.sitekey],
		["Name", widget.name],
		["Mode", widget.mode],
		["Domains", widget.domains.join(", ")],
		["Clearance level", widget.clearance_level],
		["Bot fight mode", widget.bot_fight_mode ? "yes" : "no"],
		["Region", widget.region],
		["Off-label", widget.offlabel ? "yes" : "no"],
		["Ephemeral ID", widget.ephemeral_id ? "yes" : "no"],
		["Secret", widget.secret],
		["Created", widget.created_on],
		["Modified", widget.modified_on],
	];
	const widest = Math.max(...rows.map(([k]) => k.length));
	return rows.map(([k, v]) => `  ${k.padEnd(widest)}   ${v}`).join("\n");
}

export const turnstileWidgetGetCommand = createCommand({
	metadata: {
		description: "Get a Turnstile widget",
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
		json: {
			type: "boolean",
			default: false,
			description: "Print the widget as JSON instead of a formatted view",
		},
	},
	positionalArgs: ["sitekey"],
	async handler(args, { config }) {
		const widget = await getWidget(config, args.sitekey);
		if (args.json) {
			logger.log(JSON.stringify(widget, null, 2));
			return;
		}
		logger.log(formatWidget(widget));
	},
});
