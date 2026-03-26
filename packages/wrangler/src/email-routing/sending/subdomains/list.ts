import { createCommand } from "../../../core/create-command";
import { logger } from "../../../logger";
import { listEmailSendingSubdomains } from "../../client";
import { zoneArgs } from "../../index";
import { resolveZoneId } from "../../utils";

export const emailSendingSubdomainsListCommand = createCommand({
	metadata: {
		description: "List Email Sending subdomains",
		status: "open-beta",
		owner: "Product: Email Routing",
	},
	args: {
		...zoneArgs,
	},
	async handler(args, { config }) {
		const zoneId = await resolveZoneId(config, args);
		const subdomains = await listEmailSendingSubdomains(config, zoneId);

		if (subdomains.length === 0) {
			logger.log("No sending subdomains found.");
			return;
		}

		logger.table(
			subdomains.map((s) => ({
				tag: s.tag,
				name: s.name,
				"sending enabled": s.email_sending_enabled ? "yes" : "no",
				"dkim selector": s.email_sending_dkim_selector || "",
				"return path": s.email_sending_return_path_domain || "",
				created: s.created || "",
			}))
		);
	},
});
