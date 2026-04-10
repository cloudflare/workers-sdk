import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { listEmailRoutingRules } from "../client";
import { domainArgs } from "../index";
import { resolveZoneId } from "../utils";

export const emailRoutingRulesListCommand = createCommand({
	metadata: {
		description: "List Email Routing rules",
		status: "open beta",
		owner: "Product: Email Service",
	},
	args: {
		...domainArgs,
	},
	positionalArgs: ["domain"],
	async handler(args, { config }) {
		const zoneId = await resolveZoneId(config, args);
		const rules = await listEmailRoutingRules(config, zoneId);

		const catchAll = rules.find((r) =>
			r.matchers.some((m) => m.type === "all")
		);
		const regularRules = rules.filter(
			(r) => !r.matchers.some((m) => m.type === "all")
		);

		if (regularRules.length === 0 && !catchAll) {
			logger.log("No routing rules found.");
		} else if (regularRules.length === 0) {
			logger.log("No custom routing rules found.");
		} else {
			for (const r of regularRules) {
				const matchers = r.matchers
					.map((m) => (m.field && m.value ? `${m.field}:${m.value}` : m.type))
					.join(", ");
				const actions = r.actions
					.map((a) => (a.value ? `${a.type}:${a.value.join(",")}` : a.type))
					.join(", ");

				logger.log(`Rule: ${r.id}`);
				logger.log(`  Name:     ${r.name || "(none)"}`);
				logger.log(`  Enabled:  ${r.enabled}`);
				logger.log(`  Matchers: ${matchers}`);
				logger.log(`  Actions:  ${actions}`);
				logger.log(`  Priority: ${r.priority}`);
				logger.log("");
			}
		}

		if (catchAll) {
			const actions = catchAll.actions
				.map((a) => (a.value ? `${a.type}:${a.value.join(",")}` : a.type))
				.join(", ");
			logger.log("");
			logger.log(
				`Catch-all rule: ${catchAll.enabled ? "enabled" : "disabled"}, action: ${actions}`
			);
			logger.log(
				`  (use \`wrangler email routing rules get catch-all\` to view details)`
			);
		}
	},
});
