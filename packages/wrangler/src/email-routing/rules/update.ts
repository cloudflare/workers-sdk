import { UserError } from "@cloudflare/workers-utils";
import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { updateEmailRoutingCatchAll, updateEmailRoutingRule } from "../client";
import { domainArgs } from "../index";
import { resolveZoneId } from "../utils";

export const emailRoutingRulesUpdateCommand = createCommand({
	metadata: {
		description:
			"Update an Email Routing rule (use 'catch-all' as the rule ID to update the catch-all rule)",
		status: "open beta",
		owner: "Product: Email Service",
	},
	args: {
		...domainArgs,
		"rule-id": {
			type: "string",
			demandOption: true,
			description:
				"The ID of the routing rule to update, or 'catch-all' for the catch-all rule",
		},
		name: {
			type: "string",
			description: "Rule name",
		},
		enabled: {
			type: "boolean",
			description: "Whether the rule is enabled",
		},
		"match-type": {
			type: "string",
			description:
				"Matcher type (e.g. literal). Required for regular rules, ignored for catch-all.",
		},
		"match-field": {
			type: "string",
			description:
				"Matcher field (e.g. to). Required for regular rules, ignored for catch-all.",
		},
		"match-value": {
			type: "string",
			description:
				"Matcher value (e.g. user@example.com). Required for regular rules, ignored for catch-all.",
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
			description: "Rule priority (ignored for catch-all)",
		},
	},
	positionalArgs: ["domain", "rule-id"],
	validateArgs: (args) => {
		if (args.ruleId === "catch-all") {
			// Catch-all only supports forward and drop
			if (args.actionType !== "forward" && args.actionType !== "drop") {
				throw new UserError(
					"Catch-all rule only supports 'forward' or 'drop' action types"
				);
			}
			if (
				args.actionType === "forward" &&
				(!args.actionValue || args.actionValue.length === 0)
			) {
				throw new UserError(
					"--action-value is required when --action-type is 'forward'"
				);
			}
		} else {
			// Regular rules require matcher args
			if (!args.matchType) {
				throw new UserError(
					"--match-type is required when updating a regular rule"
				);
			}
			if (!args.matchField) {
				throw new UserError(
					"--match-field is required when updating a regular rule"
				);
			}
			if (!args.matchValue) {
				throw new UserError(
					"--match-value is required when updating a regular rule"
				);
			}
			if (
				args.actionType !== "drop" &&
				(!args.actionValue || args.actionValue.length === 0)
			) {
				throw new UserError(
					"--action-value is required when --action-type is not 'drop'"
				);
			}
		}
	},
	async handler(args, { config }) {
		const zoneId = await resolveZoneId(config, args);

		if (args.ruleId === "catch-all") {
			const rule = await updateEmailRoutingCatchAll(config, zoneId, {
				actions: [
					{
						type: args.actionType,
						value: args.actionValue,
					},
				],
				matchers: [{ type: "all" }],
				enabled: args.enabled,
				name: args.name,
			});

			logger.log(`Updated catch-all rule:`);
			logger.log(`  Enabled: ${rule.enabled}`);
			logger.log(`  Actions:`);
			for (const a of rule.actions) {
				if (a.value && a.value.length > 0) {
					logger.log(`    - ${a.type}: ${a.value.join(", ")}`);
				} else {
					logger.log(`    - ${a.type}`);
				}
			}
			return;
		}

		// validateArgs guarantees these are present for regular rules
		if (!args.matchType || !args.matchField || !args.matchValue) {
			throw new UserError(
				"--match-type, --match-field, and --match-value are required when updating a regular rule"
			);
		}

		const rule = await updateEmailRoutingRule(config, zoneId, args.ruleId, {
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

		logger.log(`Updated routing rule: ${rule.id}`);
		logger.log(`  Name:    ${rule.name || "(none)"}`);
		logger.log(`  Enabled: ${rule.enabled}`);
	},
});
