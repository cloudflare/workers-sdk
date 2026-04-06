import { APIError } from "@cloudflare/workers-utils";
import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { getEmailRoutingCatchAll, getEmailRoutingRule } from "../client";
import { domainArgs } from "../index";
import { resolveZoneId } from "../utils";

export const emailRoutingRulesGetCommand = createCommand({
	metadata: {
		description:
			"Get a specific Email Routing rule (use 'catch-all' as the rule ID to get the catch-all rule)",
		status: "open beta",
		owner: "Product: Email Service",
	},
	args: {
		...domainArgs,
		"rule-id": {
			type: "string",
			demandOption: true,
			description:
				"The ID of the routing rule, or 'catch-all' for the catch-all rule",
		},
	},
	positionalArgs: ["domain", "rule-id"],
	async handler(args, { config }) {
		const zoneId = await resolveZoneId(config, args);

		if (args.ruleId === "catch-all") {
			const rule = await getEmailRoutingCatchAll(config, zoneId);

			logger.log(`Catch-all rule:`);
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

		let rule;
		try {
			rule = await getEmailRoutingRule(config, zoneId, args.ruleId);
		} catch (e) {
			// The catch-all rule appears in the rules list but can only be
			// fetched via the dedicated catch-all endpoint. If the regular
			// endpoint returns "Invalid rule operation" (code 2020), try the
			// catch-all endpoint before giving up.
			if (!(e instanceof APIError && e.code === 2020)) {
				throw e;
			}

			const catchAllRule = await getEmailRoutingCatchAll(config, zoneId);
			if (catchAllRule.tag === args.ruleId || catchAllRule.id === args.ruleId) {
				logger.log(`Catch-all rule:`);
				logger.log(`  Enabled: ${catchAllRule.enabled}`);
				logger.log(`  Actions:`);
				for (const a of catchAllRule.actions) {
					if (a.value && a.value.length > 0) {
						logger.log(`    - ${a.type}: ${a.value.join(", ")}`);
					} else {
						logger.log(`    - ${a.type}`);
					}
				}
				return;
			}
			throw e;
		}

		logger.log(`Rule: ${rule.id}`);
		logger.log(`  Name:     ${rule.name || "(none)"}`);
		logger.log(`  Enabled:  ${rule.enabled}`);
		logger.log(`  Priority: ${rule.priority}`);
		logger.log(`  Matchers:`);
		for (const m of rule.matchers) {
			if (m.field && m.value) {
				logger.log(`    - ${m.type} ${m.field} = ${m.value}`);
			} else {
				logger.log(`    - ${m.type}`);
			}
		}
		logger.log(`  Actions:`);
		for (const a of rule.actions) {
			if (a.value && a.value.length > 0) {
				logger.log(`    - ${a.type}: ${a.value.join(", ")}`);
			} else {
				logger.log(`    - ${a.type}`);
			}
		}
	},
});
