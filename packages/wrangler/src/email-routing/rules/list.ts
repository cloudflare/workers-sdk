import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { listEmailRoutingRules } from "../client";
import { zoneArgs } from "../index";
import { resolveZoneId } from "../utils";

export const emailRoutingRulesListCommand = createCommand({
	metadata: {
		description: "List Email Routing rules",
		status: "open-beta",
		owner: "Product: Email Service",
	},
	args: {
		...zoneArgs,
	},
	async handler(args, { config }) {
		const zoneId = await resolveZoneId(config, args);
		const rules = await listEmailRoutingRules(config, zoneId);

		if (rules.length === 0) {
			logger.log("No routing rules found.");
			return;
		}

		logger.table(
			rules.map((r) => ({
				id: r.id,
				name: r.name || "",
				enabled: r.enabled ? "yes" : "no",
				matchers: r.matchers
					.map((m) => (m.field && m.value ? `${m.field}:${m.value}` : m.type))
					.join(", "),
				actions: r.actions
					.map((a) => (a.value ? `${a.type}:${a.value.join(",")}` : a.type))
					.join(", "),
				priority: String(r.priority),
			}))
		);
	},
});
