import { exit } from "process";
import { error, endSection, log, cancel } from "@cloudflare/cli";
import { processArgument } from "@cloudflare/cli/args";
import { yellow, brandColor, dim } from "@cloudflare/cli/colors";
import { spinner } from "@cloudflare/cli/interactive";
import { DeploymentsService } from "../client";
import { wrap } from "../helpers/wrap";
import { idToLocationName } from "../locations";
import { statusToColored } from "./util";
import type { State, Deployment, Placement } from "../client";
import type { Status } from "../enums";

function ipv6(placement: Placement | undefined) {
	if (!placement) return yellow("no ipv6 yet");
	if (!placement.status["ipv6Address"]) return yellow("no ipv6 yet");
	return placement.status["ipv6Address"];
}

function uptime(placement?: Placement) {
	if (!placement) return yellow("inactive");
	const ms = Date.now() - new Date(placement.created_at).getTime();
	const days = Math.floor(ms / 86400000);
	const hours = new Date(ms).getUTCHours();
	const minutes = new Date(ms).getUTCMinutes();
	const seconds = new Date(ms).getUTCSeconds();
	const uptimeString = `${days ? days + "d " : ""}${hours ? hours + "h " : ""}${
		minutes ? minutes + "m " : ""
	}${seconds}s`;
	return uptimeString;
}

function version(deployment: Deployment) {
	if (!deployment.current_placement) {
		return "";
	}

	if (deployment.current_placement.deployment_version !== deployment.version) {
		return ` (${yellow(
			`version ${deployment.current_placement.deployment_version}`
		)})`;
	}

	return ` (version ${deployment.version})`;
}

function health(placement?: Placement) {
	if (!placement) return statusToColored("placing");
	if (!placement.status["health"]) return statusToColored("placing");
	return statusToColored(placement.status["health"] as Status);
}

/**
 * Useful function to call when the user put an ambiguous deploymentId in the command and you have to prompt for a deployment.
 *
 * Compared to listDeploymentsAndChoose, it will do the API call to retrieve the deployments and handle all the spinner logic.
 */
export async function loadDeployments(
	deploymentIdPrefix?: string,
	deploymentsParams?: {
		location?: string;
		image?: string;
		state?: string;
		ipv4?: string;
	}
) {
	const { start, stop } = spinner();
	start("Loading deployments");
	const [deploymentsResponse, err] = await wrap(
		DeploymentsService.listDeployments(
			deploymentsParams?.location,
			deploymentsParams?.image,
			deploymentsParams?.state as State,
			deploymentsParams?.state
		)
	);

	stop();
	if (err) {
		error(
			"There has been an error while loading your deployments: \n " +
				err.message
		);
		return [];
	}

	const deployments = deploymentsResponse.filter((d) =>
		d.id.startsWith(deploymentIdPrefix ?? "")
	);
	if (deployments.length === 0 && !deploymentIdPrefix) {
		endSection(
			"you don't have any deployments in your account!",
			"You can create one with\n\t" + brandColor("wrangler cloudchamber create")
		);
		exit(0);
	}

	if (deployments.length === 0 && deploymentIdPrefix) {
		endSection(
			"you don't have any deployments that match the id " + deploymentIdPrefix
		);
		exit(0);
	}

	return deployments;
}

export async function listDeploymentsAndChoose(
	deployments: Deployment[],
	args: { deploymentId?: string | undefined } = {}
): Promise<Deployment> {
	const deployment = await processArgument(args, "deploymentId", {
		type: "list",
		question: "Deployments",
		helpText: "Choose one by pressing the enter/return key",
		options: deployments.map((d) => ({
			label: "Deployment " + d.id,
			value: d.id,
			details: [
				`ID: ${dim(`${d.id}`)}`,
				`Uptime: ${dim(`${uptime(d.current_placement)}`)}`,
				`Version: ${dim(`${d.version}`)}`,
				`Location: ${dim(`${idToLocationName(d.location)}`)}`,
				`Image: ${dim(d.image)}`,
				`IP: ${dim(d.ipv4)}`,
				`IPV6: ${dim(ipv6(d.current_placement))}`,
				`Current Placement${version(d)}: ${health(d.current_placement)}`,
			],
		})),
		label: "deployment",
	});
	return deployments.find((d) => d.id === deployment)!;
}

export async function pickDeployment(deploymentIdPrefix?: string) {
	const deployments = await loadDeployments(deploymentIdPrefix);
	const deploymentId = deployments.length === 1 ? deployments[0].id : undefined;
	const deployment = await listDeploymentsAndChoose(deployments, {
		deploymentId,
	});
	if (!deployment) {
		cancel("Cancelling deployment selection");
		exit(0);
	}

	return deployment;
}

export function logDeployment(deployment: Deployment) {
	log(
		`${brandColor("Image")} ${dim(deployment.image)}\n${brandColor(
			"Location"
		)} ${dim(idToLocationName(deployment.location))}\n${brandColor(
			"Version"
		)} ${dim(`${deployment.version}`)}\n`
	);
}
