import { createCommand } from "../../../core/create-command";
import { confirm } from "../../../dialogs";
import { logger } from "../../../logger";
import { requireAuth } from "../../../user";
import { deleteSink } from "../../client";
import { resolveSink } from "../resolve";

export const pipelinesSinksDeleteCommand = createCommand({
	metadata: {
		description: "Delete a sink",
		owner: "Product: Pipelines",
		status: "open beta",
	},
	positionalArgs: ["sink"],
	args: {
		sink: {
			describe: "The ID or name of the sink to delete",
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

		const sink = await resolveSink(config, args.sink);

		if (!args.force) {
			const confirmedDelete = await confirm(
				`Are you sure you want to delete the sink '${sink.name}' (${sink.id})?`,
				{ fallbackValue: false }
			);
			if (!confirmedDelete) {
				logger.log("Delete cancelled.");
				return;
			}
		}

		await deleteSink(config, sink.id);

		logger.log(
			`✨ Successfully deleted sink '${sink.name}' with id '${sink.id}'.`
		);
	},
});
