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
import isInteractive from "../is-interactive";
import { listDeploymentsAndChoose, loadDeployments } from "./cli/deployments";
import { statusToColored } from "./cli/util";
import { DeploymentsService, PlacementsService } from "./client";
import { loadAccountSpinner, promiseSpinner } from "./common";
import type { Config } from "../config";
import type {
	CommonYargsArgvJSON,
	StrictYargsOptionsToInterfaceJSON,
} from "../yargs-types";
import type { PlacementEvent, PlacementWithEvents, State } from "./client";
import type { EventName } from "./enums";

export function listDeploymentsYargs(args: CommonYargsArgvJSON) {
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
	deploymentArgs: StrictYargsOptionsToInterfaceJSON<
		typeof listDeploymentsYargs
	>,
	config: Config
) {
	await loadAccountSpinner(deploymentArgs);
	const prefix = (deploymentArgs.deploymentIdPrefix ?? "") as string;
	if (deploymentArgs.json || !isInteractive()) {
		const deployments = (
			await DeploymentsService.listDeploymentsV2(
				undefined,
				deploymentArgs.location,
				deploymentArgs.image,
				deploymentArgs.state as State,
				deploymentArgs.ipv4,
				deploymentArgs.label
			)
		).filter((deployment) => deployment.id.startsWith(prefix));
		if (deployments.length === 1) {
			const placements = await PlacementsService.listPlacements(
				deployments[0].id
			);
			console.log(
				JSON.stringify(
					{
						...deployments[0],
						placements,
					},
					null,
					4
				)
			);
			return;
		}

		console.log(JSON.stringify(deployments, null, 4));
		return;
	}

	await listCommandHandle(prefix, deploymentArgs, config);
}

/**
 * Renders an event message depending on the event type and if it's the last event
 */
function eventMessage(event: PlacementEvent, lastEvent: boolean): string {
	let { message } = event;
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
	args: StrictYargsOptionsToInterfaceJSON<typeof listDeploymentsYargs>,
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
