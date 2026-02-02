import { createCommand } from "../../core/create-command";
import { confirm } from "../../dialogs";
import { logger } from "../../logger";
import { deleteIndex } from "./client";
import { deprecatedV1DefaultFlag } from "./common";

export const vectorizeDeleteCommand = createCommand({
	metadata: {
		description: "Delete a Vectorize index",
		status: "stable",
		owner: "Product: Vectorize",
	},
	behaviour: {
		printBanner: true,
		provideConfig: true,
	},
	args: {
		name: {
			type: "string",
			demandOption: true,
			description: "The name of the Vectorize index",
		},
		force: {
			type: "boolean",
			alias: "y",
			default: false,
			description: "Skip confirmation",
		},
		"deprecated-v1": {
			type: "boolean",
			default: deprecatedV1DefaultFlag,
			description: "Delete a deprecated Vectorize V1 index.",
		},
	},
	positionalArgs: ["name"],
	async handler({ name, force, deprecatedV1 }, { config }) {
		logger.log(`Deleting Vectorize index ${name}`);
		if (!force) {
			const confirmedDeletion = await confirm(
				`OK to delete the index '${name}'?`
			);
			if (!confirmedDeletion) {
				logger.log("Deletion cancelled.");
				return;
			}
		}

		await deleteIndex(config, name, deprecatedV1);
		logger.log(`✅ Deleted index ${name}`);
	},
});
