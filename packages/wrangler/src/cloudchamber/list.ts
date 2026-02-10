import { logRaw, shapes, space } from "@cloudflare/cli";
import {
	bgCyan,
	bgRed,
	brandColor,
	dim,
	gray,
	green,
	white,
	yellow,
} from "@cloudflare/cli/colors";
import { inputPrompt, spinner } from "@cloudflare/cli/interactive";
import {
	DeploymentsService,
	PlacementsService,
} from "@cloudflare/containers-shared";
import { createCommand } from "../core/create-command";
import { isNonInteractiveOrCI } from "../is-interactive";
import { logger } from "../logger";
import { capitalize } from "../utils/strings";
import { listDeploymentsAndChoose, loadDeployments } from "./cli/deployments";
import { statusToColored } from "./cli/util";
import {
	cloudchamberScope,
	fillOpenAPIConfiguration,
	promiseSpinner,
} from "./common";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
import type { EventName } from "./enums";
import type {
	DeploymentPlacementState,
	PlacementEvent,
	PlacementWithEvents,
} from "@cloudflare/containers-shared";
import type { Config } from "@cloudflare/workers-utils";

export function listDeploymentsYargs(args: CommonYargsArgv) {
	return args
		.option("location", {
			requiresArg: true,
			type: "string",
			demandOption: false,
			describe: "Filter deployments by location",
		})
		.option("image", {
			requiresArg: true,
			type: "string",
			demandOption: false,
			describe: "Filter deployments by image",
		})
		.option("state", {
			requiresArg: true,
			type: "string",
			demandOption: false,
			describe: "Filter deployments by deployment state",
		})
		.option("ipv4", {
			requiresArg: true,
			type: "string",
			demandOption: false,
			describe: "Filter deployments by ipv4 address",
		})
		.option("label", {
			requiresArg: true,
			type: "array",
			demandOption: false,
			describe: "Filter deployments by labels",
			coerce: (arg: unknown[]) => arg.map((a) => a?.toString() ?? ""),
		})
		.positional("deploymentIdPrefix", {
			describe:
				"Optional deploymentId to filter deployments\nThis means that 'list' will only showcase deployments that contain this ID prefix",
			type: "string",
		});
}

export async function listCommand(
	deploymentArgs: StrictYargsOptionsToInterface<typeof listDeploymentsYargs>,
	config: Config
) {
	const prefix = (deploymentArgs.deploymentIdPrefix ?? "") as string;
	if (isNonInteractiveOrCI()) {
		const deployments = (
			await DeploymentsService.listDeploymentsV2(
				undefined,
				deploymentArgs.location,
				deploymentArgs.image,
				deploymentArgs.state as DeploymentPlacementState,
				deploymentArgs.ipv4,
				deploymentArgs.label
			)
		).filter((deployment) => deployment.id.startsWith(prefix));
		if (deployments.length === 1) {
			const placements = await PlacementsService.listPlacements(
				deployments[0].id
			);
			logger.json({
				...deployments[0],
				placements,
			});
			return;
		}

		logger.json(deployments);
		return;
	}

	await listCommandHandle(prefix, deploymentArgs, config);
}

/**
 * Renders an event message depending on the event type and if it's the last event
 */
function eventMessage(event: PlacementEvent, lastEvent: boolean): string {
	let { message } = event;
	message = capitalize(message);
	const name = event.name as EventName;
	const health = event.statusChange["health"];
	if (health === "failed") {
		message = `${bgRed(" X ")} ${dim(message)}`;
	} else if (lastEvent && name === "VMStopped") {
		message = `${yellow(message)}`;
	} else if ((lastEvent && name === "VMStarted") || name === "SSHStarted") {
		message = `${green(message)}`;
	} else if (lastEvent) {
		message = `${brandColor(message)}`;
	} else {
		message = dim(message);
	}

	return `${message} (${event.time})`;
}

const listCommandHandle = async (
	deploymentIdPrefix: string,
	args: StrictYargsOptionsToInterface<typeof listDeploymentsYargs>,
	_config: Config
) => {
	const keepListIter = true;
	while (keepListIter) {
		logRaw(gray(shapes.bar));
		const deployments = await loadDeployments(deploymentIdPrefix, args);
		const deployment = await listDeploymentsAndChoose(deployments);
		const placementToOptions = (p: PlacementWithEvents) => {
			return {
				label: `Placement ${p.id.slice(0, 6)} (${p.created_at})`,
				details: [
					`ID: ${dim(p.id)}`,
					`Version: ${dim(`${p.deployment_version}`)}`,
					`Status: ${statusToColored(p.status["health"])}`,
					`${bgCyan(white(`Events`))}`,
					...p.events.map(
						(event, i) =>
							space(1) + eventMessage(event, i === p.events.length - 1)
					),
				],
				value: p.id,
			};
		};

		const loadPlacements = () => {
			return PlacementsService.listPlacements(deployment.id);
		};
		const placements = await promiseSpinner(loadPlacements(), {
			message: "Loading placements",
		});
		const { start, stop } = spinner();
		let refresh = false;
		await inputPrompt({
			type: "list",
			question: "Placements",
			helpText: "Hint: Press R to refresh! Or press return to go back",
			options: placements.map(placementToOptions),
			label: "going back",
			onRefresh: async () => {
				start("Refreshing placements");
				const options = (await loadPlacements()).map(placementToOptions);
				if (refresh) {
					return [];
				}
				stop();
				if (options.length) {
					options[0].label += ", last refresh: " + new Date().toLocaleString();
				}
				return options;
			},
		});
		refresh = true;
		stop();
	}
};

export const cloudchamberListCommand = createCommand({
	metadata: {
		description: "List and view status of deployments",
		status: "alpha",
		owner: "Product: Cloudchamber",
		hidden: false,
	},
	behaviour: {
		printBanner: () => !isNonInteractiveOrCI(),
	},
	args: {
		deploymentIdPrefix: {
			describe:
				"Optional deploymentId to filter deployments. This means that 'list' will only showcase deployments that contain this ID prefix",
			type: "string",
		},
		location: {
			requiresArg: true,
			type: "string",
			demandOption: false,
			describe: "Filter deployments by location",
		},
		image: {
			requiresArg: true,
			type: "string",
			demandOption: false,
			describe: "Filter deployments by image",
		},
		state: {
			requiresArg: true,
			type: "string",
			demandOption: false,
			describe: "Filter deployments by deployment state",
		},
		ipv4: {
			requiresArg: true,
			type: "string",
			demandOption: false,
			describe: "Filter deployments by ipv4 address",
		},
		label: {
			requiresArg: true,
			type: "array",
			demandOption: false,
			describe: "Filter deployments by labels",
			coerce: (arg: unknown[]) => arg.map((a) => a?.toString() ?? ""),
		},
	},
	positionalArgs: ["deploymentIdPrefix"],
	async handler(args, { config }) {
		await fillOpenAPIConfiguration(config, cloudchamberScope);
		await listCommand(args, config);
	},
});
