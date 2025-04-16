import {
	cancel,
	crash,
	endSection,
	logRaw,
	shapes,
	startSection,
} from "@cloudflare/cli";
import { processArgument } from "@cloudflare/cli/args";
import { dim, gray } from "@cloudflare/cli/colors";
import { inputPrompt, spinner } from "@cloudflare/cli/interactive";
import { ApplicationsService } from "../cloudchamber/client";
import { loadAccountSpinner } from "../cloudchamber/common";
import { wrap } from "../cloudchamber/helpers/wrap";
import isInteractive from "../is-interactive";
import type { Application } from "../cloudchamber/client/models/Application";
import type { ListApplications } from "../cloudchamber/client/models/ListApplications";
import type { Config } from "../config";
import type {
	CommonYargsArgvJSON,
	StrictYargsOptionsToInterfaceJSON,
} from "../yargs-types";

export function deleteYargs(args: CommonYargsArgvJSON) {
	return args.positional("ID", {
		describe: "id of the containers to delete",
		type: "string",
	});
}

export async function deleteCommand(
	deleteArgs: StrictYargsOptionsToInterfaceJSON<typeof deleteYargs>,
	_config: Config
) {
	await loadAccountSpinner(deleteArgs);
	if (!deleteArgs.ID) {
		throw new Error(
			"You must provide an ID. Use 'wrangler containers list` to view your containers."
		);
	}
	if (deleteArgs.json || !isInteractive()) {
		const container = await ApplicationsService.deleteApplication(
			deleteArgs.ID
		);
		console.log(JSON.stringify(container, null, 4));
		return;
	}
	startSection("Delete your container");
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

	const [, err] = await wrap(
		ApplicationsService.deleteApplication(deleteArgs.ID)
	);
	if (err) {
		crash(
			`There has been an internal error deleting your containers.\n ${err.message}`
		);
		return;
	}
	endSection("Your container has been deleted");
}

export function infoYargs(args: CommonYargsArgvJSON) {
	return args.positional("ID", {
		describe: "id of the containers to view",
		type: "string",
	});
}

export async function infoCommand(
	infoArgs: StrictYargsOptionsToInterfaceJSON<typeof infoYargs>,
	_config: Config
) {
	if (!infoArgs.ID) {
		throw new Error(
			"You must provide an ID. Use 'wrangler containers list` to view your containers."
		);
	}
	if (infoArgs.json || !isInteractive()) {
		const application = ApplicationsService.getApplication(infoArgs.ID);
		console.log(JSON.stringify(application, null, 4));
		return;
	}
	await loadAccountSpinner(infoArgs);
	const [application, err] = await wrap(
		ApplicationsService.getApplication(infoArgs.ID)
	);
	if (err) {
		crash(
			`There has been an internal error requesting your containers.\n ${err.message}`
		);
		return;
	}

	const details = flatDetails(application);
	const applicationDetails = {
		label: `${application.name} (${application.created_at})`,
		details: details,
		value: application.id,
	};
	await inputPrompt({
		type: "list",
		question: "Container",
		options: [applicationDetails],
		label: "Exiting",
	});
}

export function listYargs(args: CommonYargsArgvJSON) {
	return args;
}

export async function listCommand(
	listArgs: StrictYargsOptionsToInterfaceJSON<typeof listYargs>,
	config: Config
) {
	if (listArgs.json || !isInteractive()) {
		const applications = await ApplicationsService.listApplications();
		console.log(JSON.stringify(applications, null, 4));
		return;
	}

	await listCommandHandle(listArgs, config);
}

function flatDetails<T extends Record<string, unknown>>(
	obj: T,
	indentLevel = 0
): string[] {
	const indent = "  ".repeat(indentLevel);
	return Object.entries(obj).reduce<string[]>((acc, [key, value]) => {
		if (
			value !== undefined &&
			value !== null &&
			typeof value === "object" &&
			!Array.isArray(value)
		) {
			acc.push(`${indent}${key}:`);
			acc.push(
				...flatDetails(value as Record<string, unknown>, indentLevel + 1)
			);
		} else if (value !== undefined) {
			acc.push(`${indent}${key}: ${value}`);
		}
		return acc;
	}, []);
}

async function listCommandHandle(
	_args: StrictYargsOptionsToInterfaceJSON<typeof listYargs>,
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
			crash(
				`There has been an internal error listing your containers.\n ${err.message}`
			);
			return;
		}

		const applicationDetails = (a: Application) => {
			const details = flatDetails(a);
			return {
				label: `${a.name} (${a.created_at})`,
				details: details,
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
