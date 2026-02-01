import { createCommand } from "../../../../core/create-command";
import { confirm } from "../../../../dialogs";
import { logger } from "../../../../logger";
import { requireAuth } from "../../../../user";
import { deleteSink, getSink } from "../../client";

export const pipelinesSinksDeleteCommand = createCommand({
	metadata: {
		description: "Delete a sink",
		owner: "Product: Pipelines",
		status: "open beta",
	},
	positionalArgs: ["sink"],
	args: {
		sink: {
			describe: "The ID of the sink to delete",
			type: "string",
			demandOption: true,
		},
		force: {
			describe: "Skip confirmation",
			type: "boolean",
			alias: "y",
			default: false,
		},
	},
	async handler(args, { config }) {
		await requireAuth(config);

		const sink = await getSink(config, args.sink);

		if (!args.force) {
			const confirmedDelete = await confirm(
				`Are you sure you want to delete the sink '${sink.name}' (${args.sink})?`,
				{ fallbackValue: false }
			);
			if (!confirmedDelete) {
				logger.log("Delete cancelled.");
				return;
			}
		}

		await deleteSink(config, args.sink);

		logger.log(
			`✨ Successfully deleted sink '${sink.name}' with id '${sink.id}'.`
		);
	},
});
