import { exit } from "node:process";
import { cancel, endSection, log, newline } from "@cloudflare/cli";
import { processArgument } from "@cloudflare/cli/args";
import { brandColor, dim, yellow } from "@cloudflare/cli/colors";
import { spinner } from "@cloudflare/cli/interactive";
import { DeploymentsService } from "@cloudflare/containers-shared";
import { UserError } from "@cloudflare/workers-utils";
import { wrap } from "../helpers/wrap";
import { idToLocationName } from "../locations";
import { statusToColored } from "./util";
import type {
	DeploymentPlacementState,
	DeploymentV2,
	Placement,
	PlacementStatusHealth,
} from "@cloudflare/containers-shared";

function ipv6(placement: Placement | undefined) {
	if (!placement) {
		return yellow("no ipv6 yet");
	}
	if (!placement.status["ipv6Address"]) {
		return yellow("no ipv6 yet");
	}
	return placement.status["ipv6Address"];
}

function uptime(placement?: Placement) {
	if (!placement) {
		return yellow("inactive");
	}
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

function version(deployment: DeploymentV2) {
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
	if (!placement) {
		return statusToColored();
	}

	if (!placement.status["health"]) {
		return statusToColored();
	}

	return statusToColored(placement.status["health"] as PlacementStatusHealth);
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
		labels?: string[];
	}
): Promise<DeploymentV2[]> {
	const { start, stop } = spinner();
	start("Loading deployments");
	const [deploymentsResponse, err] = await wrap(
		DeploymentsService.listDeploymentsV2(
			undefined,
			deploymentsParams?.location,
			deploymentsParams?.image,
			deploymentsParams?.state as DeploymentPlacementState | undefined,
			deploymentsParams?.state,
			deploymentsParams?.labels
		)
	);

	stop();
	if (err) {
		throw new UserError(
			"There has been an error while loading your deployments: \n " +
				err.message
		);
	}

	const deployments = deploymentsResponse.filter((d) =>
		d.id.startsWith(deploymentIdPrefix ?? "")
	);
	if (deployments.length === 0 && !deploymentIdPrefix) {
		endSection(
			"you don't have any deployments in your account",
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
	deployments: DeploymentV2[],
	args: { deploymentId?: string | undefined } = {}
): Promise<DeploymentV2> {
	const ips = (d: DeploymentV2) => {
		const ipsList = [];
		if (d.network?.ipv4 !== undefined) {
			ipsList.push(`IPV4: ${dim(d.network.ipv4)}`);
		}

		ipsList.push(`IPV6: ${dim(ipv6(d.current_placement))}`);
		return ipsList;
	};
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
				`Location: ${dim(`${idToLocationName(d.location.name)}`)}`,
				`Image: ${dim(d.image)}`,
				...ips(d),
				`Current Placement${version(d)}: ${health(d.current_placement)}`,
			],
		})),
		label: "deployment",
	});
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
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

export function logDeployment(deployment: DeploymentV2) {
	log(`${brandColor("image")} ${dim(deployment.image)}`);
	log(
		`${brandColor("location")} ${dim(idToLocationName(deployment.location.name))}`
	);
	log(`${brandColor("version")} ${dim(`${deployment.version}`)}`);
	newline();
}
