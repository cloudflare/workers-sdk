import { fetchListResult } from "./cfetch";
import { createCommand } from "./core/create-command";
import { logger } from "./logger";
import { requireAuth } from "./user";
import type { ComplianceConfig } from "./environment-variables/misc-variables";

export interface Script {
	id: string;
	etag: string;
	created_on: string;
	modified_on: string;
	usage_model?: string;
	compatibility_date?: string;
	compatibility_flags?: string[];
}

export const listCommand = createCommand({
	metadata: {
		description: "List all Workers in your account",
		status: "stable",
		owner: "Product: Workflows",
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},
	args: {
		json: {
			type: "boolean",
			description: "Return output as clean JSON",
			default: false,
		},
	},
	async handler({ json }, { config }) {
		const accountId = await requireAuth(config);
		const workers: Array<Script> = await listWorkers(config, accountId);

		if (json) {
			logger.log(JSON.stringify(workers, null, 2));
		} else {
			if (workers.length === 0) {
				logger.log("No Workers found in this account.");
			} else {
				logger.table(
					workers.map((worker) =>
						Object.fromEntries(
							Object.entries(worker).map(([k, v]) => [k, String(v ?? "")])
						)
					)
				);
			}
		}
	},
});

export const listWorkers = async (
	complianceConfig: ComplianceConfig,
	accountId: string
): Promise<Array<Script>> => {
	return await fetchListResult<Script>(
		complianceConfig,
		`/accounts/${accountId}/workers/scripts`
	);
};
