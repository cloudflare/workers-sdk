import {
	cancel,
	endSection,
	logRaw,
	shapes,
	startSection,
} from "@cloudflare/cli";
import { processArgument } from "@cloudflare/cli/args";
import { dim, gray } from "@cloudflare/cli/colors";
import { inputPrompt, spinner } from "@cloudflare/cli/interactive";
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
import type {
	Application,
	ListApplications,
} from "@cloudflare/containers-shared";
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

export function listYargs(args: CommonYargsArgv) {
	return args;
}

export async function listCommand(
	listArgs: StrictYargsOptionsToInterface<typeof listYargs>,
	config: Config
) {
	if (isNonInteractiveOrCI()) {
		const applications = await ApplicationsService.listApplications();
		logger.json(applications);
		return;
	}

	await listCommandHandle(listArgs, config);
}

async function listCommandHandle(
	_args: StrictYargsOptionsToInterface<typeof listYargs>,
	_config: Config
) {
	const keepListIter = true;
	while (keepListIter) {
		logRaw(gray(shapes.bar));
		const { start, stop } = spinner();
		start("Loading Containers");
		const [applications, err] = await wrap(
			ApplicationsService.listApplications()
		);
		stop();
		if (err) {
			throw new UserError(
				`There has been an internal error listing your containers.\n ${err.message}`
			);
		}

		// If we don't get multiple applications for any reason exit
		if (
			applications === undefined ||
			applications === null ||
			applications.length === 0
		) {
			logRaw(
				"No containers found. See https://dash.cloudflare.com/?to=/:account/workers/containers to learn more."
			);
			return;
		}

		const applicationDetails = (a: Application) => {
			return {
				label: `${a.name} (${a.created_at})`,
				details: YAML.stringify(a).split("\n"),
				value: a.id,
			};
		};

		const application = await listContainersAndChoose(applications);

		let refresh = false;
		await inputPrompt({
			type: "list",
			question: "Containers",
			helpText: "Hit enter to return to your containers or 'r' to refresh",
			options: [applicationDetails(application)],
			label: "going back",
			onRefresh: async () => {
				start("Refreshing application");
				const app = await ApplicationsService.getApplication(application.id);
				if (refresh) {
					return [];
				}
				stop();
				if (app) {
					const details = applicationDetails(app);
					details.label += ", last refresh: " + new Date().toLocaleString();
					return [details];
				}
				return app;
			},
		});
		refresh = true;
		stop();
	}
}

async function listContainersAndChoose(
	applications: ListApplications
): Promise<Application> {
	const getLabels = (a: Application) => {
		const labels = a.configuration.labels ?? [];
		if (!labels || labels.length == 0) {
			return [];
		}
		const out = labels.map((l) => `        ${dim(l.name)}: ${dim(l.value)}`);
		return `Labels:\n` + out.join(",\n");
	};

	const application = await processArgument({}, "applicationId", {
		type: "list",
		question: "Your Containers",
		helpText:
			"Get more information by selecting a container with the enter/return key",
		options: applications.map((i) => ({
			label: i.name,
			value: i.id,
			details: [
				`Id: ${dim(`${i.id}`)}`,
				`Instances: ${dim(`${i.instances}`)}`,
				`Image: ${dim(i.configuration.image)}`,
				...(getLabels(i) ?? []),
			],
		})),
		label: "container",
	});
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	return applications.find((a) => a.id === application)!;
}

export const containersListCommand = createCommand({
	metadata: {
		description: "List containers",
		status: "open beta",
		owner: "Product: Cloudchamber",
	},
	behaviour: {
		printBanner: () => !isNonInteractiveOrCI(),
	},
	args: {},
	async handler(args, { config }) {
		await fillOpenAPIConfiguration(config, containersScope);
		await listCommand(args, config);
	},
});

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
