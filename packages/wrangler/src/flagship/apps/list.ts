import { dim } from "@cloudflare/cli-shared-helpers/colors";
import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { listApps } from "../client";

export const flagshipAppsListCommand = createCommand({
	metadata: {
		description: "List Flagship apps",
		status: "open beta",
		owner: "Product: Flagship",
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},
	args: {
		json: {
			type: "boolean",
			default: false,
			description: "Return output as JSON",
		},
	},
	async handler({ json }, { config }) {
		const apps = await listApps(config);
		if (json) {
			logger.json(apps);
			return;
		}
		if (apps.length === 0) {
			logger.log(
				`No Flagship apps yet. Create one with ${dim("wrangler flagship apps create <name>")}.`
			);
			return;
		}
		logger.table(
			apps.map((app) => ({
				name: app.name,
				id: app.id,
				updated: app.updated_at,
				by: app.updated_by,
			}))
		);
	},
});
