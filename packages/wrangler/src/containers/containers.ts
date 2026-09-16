import {
	cancel,
	endSection,
	startSection,
} from "@cloudflare/cli-shared-helpers";
import { inputPrompt } from "@cloudflare/cli-shared-helpers/interactive";
import { ApiError, ApplicationsService } from "@cloudflare/containers-shared";
import { JsonFriendlyFatalError, UserError } from "@cloudflare/workers-utils";
import { isNonInteractiveOrCI } from "@cloudflare/workers-utils";
import YAML from "yaml";
import { fillOpenAPIConfiguration } from "../cloudchamber/common";
import { wrap } from "../cloudchamber/helpers/wrap";
import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { normalizeApplicationId } from "./application-id";
import { containersScope } from "./index";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
import type { Config } from "@cloudflare/workers-utils";

function validateApplicationId(id: string, command: "delete" | "info"): string {
	const applicationId = normalizeApplicationId(id);
	if (applicationId === undefined) {
		const message = `Expected an application ID but got ${id}. Use \`wrangler containers list\` to view your container applications and corresponding IDs.`;
		if (command === "delete") {
			throw new UserError(message, {
				telemetryMessage: "containers delete invalid application id",
			});
		}
		throw new UserError(message, {
			telemetryMessage: "containers info invalid application id",
		});
	}

	return applicationId;
}

export function deleteYargs(args: CommonYargsArgv) {
	return args.positional("ID", {
		describe: "ID of the container application to delete",
		type: "string",
		demandOption: true,
	});
}

export async function deleteCommand(
	deleteArgs: StrictYargsOptionsToInterface<typeof deleteYargs>,
	_config: Config
) {
	// API gateway has path restrictions so if someone provides a string that isn't ID shaped, we get a weird error instead of a 404
	const applicationId = validateApplicationId(deleteArgs.ID, "delete");

	startSection("Delete container application");

	if (!isNonInteractiveOrCI()) {
		const yes = await inputPrompt({
			question:
				"Are you sure that you want to delete this container application? Its associated Durable Objects will lose access to their containers.",
			type: "confirm",
			label: "",
		});
		if (!yes) {
			cancel("The operation has been cancelled");
			return;
		}
	}

	try {
		await ApplicationsService.deleteApplication(applicationId);
	} catch (err) {
		if (!(err instanceof Error)) {
			throw err;
		}

		if (err instanceof ApiError) {
			if (err.status === 400 || err.status === 404) {
				throw new UserError(
					`There has been an error deleting the container application.\n${err.body.error}`,
					{ telemetryMessage: "containers delete request failed" }
				);
			}

			throw new Error(
				`There has been an unknown error deleting the container application.\n${JSON.stringify(err.body)}`
			);
		}

		throw new Error(
			`There has been an internal error deleting the container application.\n${err.message}`
		);
	}

	endSection("The container application has been deleted");
}

export function infoYargs(args: CommonYargsArgv) {
	return args.positional("ID", {
		describe: "ID of the container application to view",
		type: "string",
	});
}

export async function infoCommand(
	infoArgs: StrictYargsOptionsToInterface<typeof infoYargs>,
	_config: Config
) {
	if (!infoArgs.ID) {
		throw new Error(
			"You must provide an application ID. Use `wrangler containers list` to view your container applications."
		);
	}
	const applicationId = validateApplicationId(infoArgs.ID, "info");
	if (isNonInteractiveOrCI()) {
		const application = await ApplicationsService.getApplication(applicationId);
		logger.json(application);
		return;
	}
	const [application, err] = await wrap(
		ApplicationsService.getApplication(applicationId)
	);
	if (err) {
		throw new UserError(
			`There has been an internal error requesting the container application.\n ${err.message}`,
			{ telemetryMessage: "containers info request failed" }
		);
	}

	const applicationDetails = {
		label: `${application.name} (${application.created_at})`,
		details: YAML.stringify(application).split("\n"),
		value: application.id,
	};
	await inputPrompt({
		type: "list",
		question: "Container application",
		options: [applicationDetails],
		label: "Exiting",
	});
}

export const containersInfoCommand = createCommand({
	metadata: {
		description: "Get information about a container application",
		status: "stable",
		owner: "Product: Cloudchamber",
	},
	behaviour: {
		printBanner: (args) => !args.json && !isNonInteractiveOrCI(),
	},
	args: {
		ID: {
			describe: "ID of the container application to view",
			type: "string",
			demandOption: true,
		},
		json: {
			describe: "Return output as JSON",
			type: "boolean",
			default: false,
		},
	},
	positionalArgs: ["ID"],
	async handler(args, { config }) {
		await fillOpenAPIConfiguration(config, containersScope);
		const applicationId = validateApplicationId(args.ID, "info");
		if (args.json) {
			try {
				const application =
					await ApplicationsService.getApplication(applicationId);
				logger.json(application);
				return;
			} catch (err) {
				if (err instanceof UserError) {
					throw err;
				}
				const message = err instanceof Error ? err.message : "Unknown error";
				throw new JsonFriendlyFatalError(JSON.stringify({ error: message }), {
					telemetryMessage: "containers info json output failed",
				});
			}
		}
		await infoCommand(args, config);
	},
});

export const containersDeleteCommand = createCommand({
	metadata: {
		description: "Delete a container application",
		status: "stable",
		owner: "Product: Cloudchamber",
	},
	args: {
		ID: {
			describe: "ID of the container application to delete",
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
