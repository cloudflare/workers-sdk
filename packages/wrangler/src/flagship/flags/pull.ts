import { dim } from "@cloudflare/cli-shared-helpers/colors";
import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { requireAuth } from "../../user";
import { listAllFlags, toFlagInput } from "../client";
import { usingLocalFlagshipAPI } from "../store";

export const flagshipFlagsPullCommand = createCommand({
	metadata: {
		description:
			"Pull feature flags from a Flagship app into the local flag store",
		status: "open beta",
		owner: "Product: Flagship",
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},
	args: {
		"app-id": {
			type: "string",
			demandOption: true,
			description: "The ID of the app to pull flags from",
		},
		"persist-to": {
			type: "string",
			description: "Specify directory to use for local persistence",
			requiresArg: true,
		},
		json: {
			type: "boolean",
			default: false,
			description: "Return output as JSON",
		},
	},
	positionalArgs: ["app-id"],
	async handler({ appId, persistTo, json }, { config }) {
		const accountId = await requireAuth(config);
		const flags = await listAllFlags(config, appId);

		const localOnly = await usingLocalFlagshipAPI(
			persistTo,
			config,
			appId,
			async (admin) => {
				const pulledKeys = new Set(flags.map((flag) => flag.key));
				const existing = await admin.listFlags();
				await admin.putFlags(flags.map(toFlagInput), accountId);
				return existing
					.map((flag) => flag.key)
					.filter((key) => !pulledKeys.has(key));
			}
		);

		if (json) {
			logger.json({
				appId,
				pulled: flags.map((flag) => flag.key),
				localOnly,
			});
			return;
		}

		logger.log(
			`Pulled ${flags.length} flag${flags.length === 1 ? "" : "s"} from ${appId} into the local flag store.`
		);
		if (localOnly.length > 0) {
			logger.log(
				dim(
					`\nLeft ${localOnly.length} local-only flag${localOnly.length === 1 ? "" : "s"} untouched: ${localOnly.join(", ")}`
				)
			);
			logger.log(
				dim(
					"These do not exist in the remote app, either because they were created locally or because they were deleted remotely."
				)
			);
		}
	},
});
