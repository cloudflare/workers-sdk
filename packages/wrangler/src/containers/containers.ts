import { cancel, endSection, startSection } from "@cloudflare/cli";
import { inputPrompt } from "@cloudflare/cli/interactive";
import { ApiError, ApplicationsService } from "@cloudflare/containers-shared";
import { UserError } from "@cloudflare/workers-utils";
import YAML from "yaml";
import { fillOpenAPIConfiguration } from "../cloudchamber/common";
import { wrap } from "../cloudchamber/helpers/wrap";
import { createCommand } from "../core/create-command";
import { isNonInteractiveOrCI } from "../is-interactive";
import { logger } from "../logger";
import { containersScope } from "./index";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
import type { Config } from "@cloudflare/workers-utils";

export function deleteYargs(args: CommonYargsArgv) {
	return args.positional("ID", {
		describe: "id of the containers to delete",
		type: "string",
		demandOption: true,
	});
}

export async function deleteCommand(
	deleteArgs: StrictYargsOptionsToInterface<typeof deleteYargs>,
	_config: Config
) {
	// API gateway has path restrictions so if someone provides a string that isn't ID shaped, we get a weird error instead of a 404
	const uuidRegex =
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
	if (!uuidRegex.test(deleteArgs.ID)) {
		throw new UserError(
			`Expected a container ID but got ${deleteArgs.ID}. Use \`wrangler containers list\` to view your containers and corresponding IDs.`
		);
	}

	startSection("Delete your container");

	if (!isNonInteractiveOrCI()) {
		const yes = await inputPrompt({
			question:
				"Are you sure that you want to delete these containers? The associated DO container will lose access to the containers.",
			type: "confirm",
			label: "",
		});
		if (!yes) {
			cancel("The operation has been cancelled");
			return;
		}
	}

	try {
		await ApplicationsService.deleteApplication(deleteArgs.ID);
	} catch (err) {
		if (!(err instanceof Error)) {
			throw err;
		}

		if (err instanceof ApiError) {
			if (err.status === 400 || err.status === 404) {
				throw new UserError(
					`There has been an error deleting the container.\n${err.body.error}`
				);
			}

			throw new Error(
				`There has been an unknown error deleting the container.\n${JSON.stringify(err.body)}`
			);
		}

		throw new Error(
			`There has been an internal error deleting your containers.\n${err.message}`
		);
	}

	endSection("Your container has been deleted");
}

export function infoYargs(args: CommonYargsArgv) {
	return args.positional("ID", {
		describe: "id of the containers to view",
		type: "string",
	});
}

export async function infoCommand(
	infoArgs: StrictYargsOptionsToInterface<typeof infoYargs>,
	_config: Config
) {
	if (!infoArgs.ID) {
		throw new Error(
			"You must provide an ID. Use 'wrangler containers list` to view your containers."
		);
	}
	if (isNonInteractiveOrCI()) {
		const application = await ApplicationsService.getApplication(infoArgs.ID);
		logger.json(application);
		return;
	}
	const [application, err] = await wrap(
		ApplicationsService.getApplication(infoArgs.ID)
	);
	if (err) {
		throw new UserError(
			`There has been an internal error requesting your containers.\n ${err.message}`
		);
	}

	const applicationDetails = {
		label: `${application.name} (${application.created_at})`,
		details: YAML.stringify(application).split("\n"),
		value: application.id,
	};
	await inputPrompt({
		type: "list",
		question: "Container",
		options: [applicationDetails],
		label: "Exiting",
	});
}

export const containersInfoCommand = createCommand({
	metadata: {
		description: "Get information about a specific container",
		status: "open beta",
		owner: "Product: Cloudchamber",
	},
	behaviour: {
		printBanner: () => !isNonInteractiveOrCI(),
	},
	args: {
		ID: {
			describe: "ID of the container to view",
			type: "string",
			demandOption: true,
		},
	},
	positionalArgs: ["ID"],
	async handler(args, { config }) {
		await fillOpenAPIConfiguration(config, containersScope);
		await infoCommand(args, config);
	},
});

export const containersDeleteCommand = createCommand({
	metadata: {
		description: "Delete a container",
		status: "open beta",
		owner: "Product: Cloudchamber",
	},
	args: {
		ID: {
			describe: "ID of the container to delete",
			type: "string",
			demandOption: true,
		},
	},
	positionalArgs: ["ID"],
	async handler(args, { config }) {
		await fillOpenAPIConfiguration(config, containersScope);
		await deleteCommand(args, config);
	},
});
