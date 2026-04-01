import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { listEmailRoutingRules } from "../client";
import { zoneArgs } from "../index";
import { resolveZoneId } from "../utils";

export const emailRoutingRulesListCommand = createCommand({
	metadata: {
		description: "List Email Routing rules",
		status: "open beta",
		owner: "Product: Email Service",
	},
	args: {
		...zoneArgs,
	},
	async handler(args, { config }) {
		const zoneId = await resolveZoneId(config, args);
		const rules = await listEmailRoutingRules(config, zoneId);

		const catchAll = rules.find((r) =>
			r.matchers.some((m) => m.type === "all")
		);
		const regularRules = rules.filter(
			(r) => !r.matchers.some((m) => m.type === "all")
		);

		if (regularRules.length === 0) {
			logger.log("No routing rules found.");
		} else {
			logger.table(
				regularRules.map((r) => ({
					id: r.id,
					name: r.name || "",
					enabled: r.enabled ? "yes" : "no",
					matchers: r.matchers
						.map((m) =>
							m.field && m.value ? `${m.field}:${m.value}` : m.type
						)
						.join(", "),
					actions: r.actions
						.map((a) =>
							a.value ? `${a.type}:${a.value.join(",")}` : a.type
						)
						.join(", "),
					priority: String(r.priority),
				}))
			);
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
