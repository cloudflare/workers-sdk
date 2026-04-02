import { UserError } from "@cloudflare/workers-utils";
import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { createEmailRoutingRule } from "../client";
import { domainArgs } from "../index";
import { resolveZoneId } from "../utils";

export const emailRoutingRulesCreateCommand = createCommand({
	metadata: {
		description: "Create an Email Routing rule",
		status: "open beta",
		owner: "Product: Email Service",
	},
	args: {
		...domainArgs,
		name: {
			type: "string",
			description: "Rule name",
		},
		enabled: {
			type: "boolean",
			description: "Whether the rule is enabled",
			default: true,
		},
		"match-type": {
			type: "string",
			demandOption: true,
			description: "Matcher type (e.g. literal)",
		},
		"match-field": {
			type: "string",
			demandOption: true,
			description: "Matcher field (e.g. to)",
		},
		"match-value": {
			type: "string",
			demandOption: true,
			description: "Matcher value (e.g. user@example.com)",
		},
		"action-type": {
			type: "string",
			demandOption: true,
			description: "Action type (forward, drop, or worker)",
			choices: ["forward", "drop", "worker"],
		},
		"action-value": {
			type: "string",
			array: true,
			description:
				"Action value(s) (e.g. destination email address). Required for forward/worker actions.",
		},
		priority: {
			type: "number",
			description: "Rule priority",
		},
	},
	positionalArgs: ["domain"],
	validateArgs: (args) => {
		if (
			args.actionType !== "drop" &&
			(!args.actionValue || args.actionValue.length === 0)
		) {
			throw new UserError(
				"--action-value is required when --action-type is not 'drop'"
			);
		}
	},
	async handler(args, { config }) {
		const zoneId = await resolveZoneId(config, args);
		const rule = await createEmailRoutingRule(config, zoneId, {
			actions: [{ type: args.actionType, value: args.actionValue }],
			matchers: [
				{
					type: args.matchType,
					field: args.matchField,
					value: args.matchValue,
				},
			],
			name: args.name,
			enabled: args.enabled,
			priority: args.priority,
		});

		logger.log(`Created routing rule: ${rule.id}`);
		logger.log(`  Name:    ${rule.name || "(none)"}`);
		logger.log(`  Enabled: ${rule.enabled}`);
	},
});
