import { createCommand } from "../../../core/create-command";
import { confirm } from "../../../dialogs";
import { logger } from "../../../logger";
import { requireAuth } from "../../../user";
import { deleteStream } from "../../client";
import { resolveStream } from "../resolve";

export const pipelinesStreamsDeleteCommand = createCommand({
	metadata: {
		description: "Delete a stream",
		owner: "Product: Pipelines",
		status: "open beta",
	},
	positionalArgs: ["stream"],
	args: {
		stream: {
			describe: "The ID or name of the stream to delete",
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

		const stream = await resolveStream(config, args.stream);

		if (!args.force) {
			const confirmedDelete = await confirm(
				`Are you sure you want to delete the stream '${stream.name}' (${stream.id})?`,
				{ fallbackValue: false }
			);
			if (!confirmedDelete) {
				logger.log("Delete cancelled.");
				return;
			}
		}

		await deleteStream(config, stream.id);

		logger.log(
			`✨ Successfully deleted stream '${stream.name}' with id '${stream.id}'.`
		);
	},
});
