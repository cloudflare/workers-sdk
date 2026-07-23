import { UserError } from "@cloudflare/workers-utils";
import { createCommand } from "../../../core/create-command";
import { logger } from "../../../logger";
import { getFlag, toFlagInput, updateFlag } from "../../client";
import { renderFlag } from "../../render";
import { sortedRules } from "./shared";
import type { Rule } from "../../client";

export const flagshipFlagsRulesReorderCommand = createCommand({
	metadata: {
		description: "Reorder targeting rules for a feature flag",
		status: "open beta",
		owner: "Product: Flagship",
		examples: [
			{
				command:
					"wrangler flagship flags rules reorder <APP_ID> new-checkout --order 2,1,3",
				description:
					"Make existing priority 2 run first, existing priority 1 run second, and existing priority 3 run third",
			},
		],
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},
	args: {
		"app-id": {
			type: "string",
			demandOption: true,
			description: "The ID of the app",
		},
		key: {
			type: "string",
			demandOption: true,
			description: "The key of the flag",
		},
		order: {
			type: "string",
			demandOption: true,
			description:
				"Comma-separated existing rule priorities in their new order, for example 2,1,3",
		},
		json: {
			type: "boolean",
			default: false,
			description: "Return output as JSON",
		},
	},
	positionalArgs: ["app-id", "key"],
	async handler(args, { config }) {
		const { appId, key } = args;
		const current = await getFlag(config, appId, key);
		const rules = reorderRules(current.rules, args.order);
		const flag = await updateFlag(config, appId, key, {
			...toFlagInput(current),
			rules,
		});
		if (args.json) {
			logger.json(flag);
			return;
		}
		logger.log(`✅ Reordered rules for flag\n`);
		logger.log(renderFlag(flag));
	},
});

function reorderRules(rules: Rule[], rawOrder: string): Rule[] {
	const order = rawOrder.split(",").map((part) => Number(part.trim()));
	if (
		order.length === 0 ||
		order.some((priority) => !Number.isInteger(priority) || priority < 1)
	) {
		throw new UserError(
			'Invalid --order. Expected comma-separated rule priorities, for example "2,1,3".',
			{ telemetryMessage: "flagship rule reorder invalid order" }
		);
	}
	const byPriority = new Map(rules.map((rule) => [rule.priority, rule]));
	const existing = sortedRules(rules).map((rule) => rule.priority);
	if (order.length !== rules.length || new Set(order).size !== order.length) {
		throw new UserError(
			`--order must contain each existing rule priority exactly once. Existing priorities: ${existing.join(", ")}.`,
			{ telemetryMessage: "flagship rule reorder incomplete order" }
		);
	}
	for (const priority of order) {
		if (!byPriority.has(priority)) {
			throw new UserError(
				`No rule with priority ${priority}. Existing priorities: ${existing.join(", ")}.`,
				{ telemetryMessage: "flagship rule reorder unknown priority" }
			);
		}
	}
	return order.map((priority, index) => {
		const rule = byPriority.get(priority);
		if (!rule) {
			throw new UserError(`No rule with priority ${priority}.`, {
				telemetryMessage: "flagship rule reorder unknown priority",
			});
		}
		return { ...rule, priority: index + 1 };
	});
}
