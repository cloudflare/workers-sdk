import { createNamespace } from "../core/create-command";
import { ClearanceLevels, WidgetModes } from "./client";

export const turnstileNamespace = createNamespace({
	metadata: {
		description: "🛡️ Manage Turnstile widgets",
		status: "alpha",
		owner: "Product: Turnstile",
		category: "Networking & security",
	},
});

export const turnstileWidgetNamespace = createNamespace({
	metadata: {
		description: "Manage Turnstile widgets",
		status: "alpha",
		owner: "Product: Turnstile",
	},
});

// Splits comma-separated values so `--domain a.com,b.com` is equivalent to
// `--domain a.com --domain b.com`. Yargs `array: true` alone preserves the
// comma as a literal character.
const splitCsv = (values: (string | number)[]): string[] =>
	values
		.flatMap((v) =>
			String(v)
				.split(",")
				.map((s) => s.trim())
		)
		.filter(Boolean);

export const sharedWidgetOptions = <R extends boolean>(options: {
	required: R;
}) =>
	({
		domain: {
			alias: "domains",
			type: "string",
			array: true,
			demandOption: options.required,
			coerce: splitCsv,
			description:
				"Allowed hostnames for this widget. Pass multiple times or comma-separate, e.g. --domain example.com --domain www.example.com.",
		},
		mode: {
			type: "string",
			choices: WidgetModes,
			demandOption: options.required,
			description: "Widget mode",
		},
		"clearance-level": {
			type: "string",
			choices: ClearanceLevels,
			description:
				"Challenge clearance level granted when this widget is embedded on a Cloudflare site",
		},
		"bot-fight-mode": {
			type: "boolean",
			description:
				"Issue computationally expensive challenges in response to malicious bots (Enterprise only)",
		},
		"ephemeral-id": {
			type: "boolean",
			description:
				"Return the Ephemeral ID in /siteverify responses (Enterprise only)",
		},
		offlabel: {
			type: "boolean",
			description:
				"Do not show any Cloudflare branding on the widget (Enterprise only)",
		},
	}) as const;
