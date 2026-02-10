import {
	endSection,
	log,
	logRaw,
	newline,
	status,
	updateStatus,
} from "@cloudflare/cli";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { spinner } from "@cloudflare/cli/interactive";
import {
	DeploymentsService,
	ImageRegistriesService,
	PlacementsService,
	SshPublicKeysService,
} from "@cloudflare/containers-shared";
import { UserError } from "@cloudflare/workers-utils";
import { capitalize } from "../../utils/strings";
import { wrap } from "../helpers/wrap";
import { idToLocationName } from "../locations";
import type { EventName } from "../enums";
import type {
	CustomerImageRegistry,
	DeploymentV2,
	ListSSHPublicKeys,
	PlacementEvent,
	PlacementStatusHealth,
	PlacementWithEvents,
} from "@cloudflare/containers-shared";

export function pollRegistriesUntilCondition(
	onRegistries: (registries: Array<CustomerImageRegistry>) => boolean
): Promise<Array<CustomerImageRegistry>> {
	return new Promise<Array<CustomerImageRegistry>>((res, rej) => {
		let errCount = 0;
		const poll = () => {
			ImageRegistriesService.listImageRegistries()
				.then((registries) => {
					try {
						if (!onRegistries(registries)) {
							setTimeout(() => poll(), 500);
						} else {
							res(registries);
						}
					} catch (err) {
						rej(err);
					}
				})
				.catch((err) => {
					errCount++;
					// if there are too many errors, throw it
					if (errCount > 3) {
						rej(err);
						return;
					}

					poll();
				});
		};

		poll();
	});
}

export function pollSSHKeysUntilCondition(
	onSSHKeys: (sshKeys: ListSSHPublicKeys) => boolean
): Promise<ListSSHPublicKeys> {
	return new Promise<ListSSHPublicKeys>((res, rej) => {
		let errCount = 0;
		const poll = () => {
			SshPublicKeysService.listSshPublicKeys()
				.then((sshKeys) => {
					try {
						if (!onSSHKeys(sshKeys)) {
							setTimeout(() => poll(), 500);
						} else {
							res(sshKeys);
						}
					} catch (err) {
						rej(err);
					}
				})
				.catch((err) => {
					errCount++;
					// if there are too many errors, throw it
					if (errCount > 3) {
						rej(err);
						return;
					}

					poll();
				});
		};

		poll();
	});
}

async function pollDeploymentUntilCondition(
	deploymentId: string,
	onDeployment: (d: DeploymentV2) => boolean
): Promise<DeploymentV2> {
	return new Promise<DeploymentV2>((res, rej) => {
		let errCount = 0;
		const poll = () => {
			DeploymentsService.getDeploymentV2(deploymentId)
				.then((deployment) => {
					errCount = 0;
					try {
						if (!onDeployment(deployment)) {
							setTimeout(() => poll(), 500);
						} else {
							res(deployment);
						}
					} catch (err) {
						rej(err);
					}
				})
				.catch((err) => {
					errCount++;
					// if there are too many errors, throw it
					if (errCount > 3) {
						rej(err);
					}
				});
		};

		poll();
	});
}

async function pollDeploymentUntilConditionWithPlacement(
	placementId: string,
	onPlacement: (p: PlacementWithEvents) => boolean
): Promise<PlacementWithEvents> {
	return new Promise((res, rej) => {
		let errCount = 0;
		const poll = () => {
			PlacementsService.getPlacement(placementId)
				.then((placement) => {
					errCount = 0;
					if (!onPlacement(placement)) {
						setTimeout(() => poll(), 500);
					} else {
						res(placement);
					}
				})
				.catch((err) => {
					errCount++;
					// if there are too many errors, throw it
					if (errCount > 3) {
						rej(err);
					}
				});
		};

		poll();
	});
}

function unexpectedLastEvent(placement: PlacementWithEvents) {
	throw new WaitForAnotherPlacement(
		`There has been an unknown error creating the container. (${
			placement.events[placement.events.length - 1].name
		})`
	);
}

class WaitForAnotherPlacement extends Error {
	constructor(message: string) {
		super(message);
	}
}

async function waitForEvent(
	deployment: DeploymentV2,
	...eventName: EventName[]
): Promise<{ event?: PlacementEvent; placement: PlacementWithEvents }> {
	if (!deployment.current_placement) {
		throw new Error("unexpected null current placement");
	}
	let foundEvent: PlacementEvent | undefined;
	const placement = await pollDeploymentUntilConditionWithPlacement(
		deployment.current_placement.id,
		(p) => {
			const event = p.events.find((e) =>
				eventName.includes(e.name as EventName)
			);
			if (!event) {
				if ((p.status["health"] as PlacementStatusHealth) === "failed") {
					return true;
				}

				if ((p.status["health"] as PlacementStatusHealth) == "stopped") {
					return true;
				}

				return false;
			}

			foundEvent = event;
			return true;
		}
	);

	return { event: foundEvent, placement };
}

async function waitForImagePull(deployment: DeploymentV2) {
	const s = spinner();
	s.start("Pulling your image");
	const [eventPlacement, err] = await wrap(
		waitForEvent(deployment, "ImagePulled", "ImagePullError")
	);
	s.stop();
	if (err) {
		throw new UserError(err.message);
	}

	if (
		eventPlacement.event == undefined ||
		(eventPlacement.event.name === "ImagePullError" &&
			eventPlacement.event.type !== "UserError")
	) {
		checkPlacementStatus(eventPlacement.placement);
		return;
	}

	if (eventPlacement.event.name == "ImagePullError") {
		// TODO: We should really report here something more specific when it's not found.
		// For now, the cloudchamber API always returns a 404 in the message when the
		// image is not found.
		if (eventPlacement.event.message.includes("404")) {
			throw new UserError(
				"Your container image couldn't be pulled, (404 not found). Did you specify the correct URL?\n\t" +
					`Run ${brandColor(
						process.argv0 + " cloudchamber modify " + deployment.id
					)} to change the deployment image`
			);
		}

		throw new UserError(capitalize(eventPlacement.event.message));
	}

	updateStatus("Pulled your image");
	log(
		`${brandColor("pulled image")} ${dim(
			`in ${eventPlacement.event.details["duration"]}`
		)}\n`
	);
}

/**
 * Will check the placement object and throw an error with the correct message
 */
function checkPlacementStatus(placement: PlacementWithEvents) {
	if (placement.status["health"] === "stopped") {
		throw new WaitForAnotherPlacement(
			`The container stopped while waiting for the deployment to be created.\nEither the deployment has been modified, changed location, or your container is in a reboot loop!`
		);
	}

	unexpectedLastEvent(placement);
}

async function waitForVMToStart(deployment: DeploymentV2) {
	const s = spinner();
	s.start("Creating your container");
	const [eventPlacement, err] = await wrap(
		waitForEvent(deployment, "VMStarted")
	);
	s.stop();
	if (err) {
		throw new UserError(err.message);
	}

	if (!eventPlacement.event) {
		checkPlacementStatus(eventPlacement.placement);
	}

	const ipv4 = eventPlacement.placement.status["ipv4Address"];
	if (ipv4) {
		log(`${brandColor("assigned IPv4 address")} ${dim(ipv4)}\n`);
	}

	const ipv6 = eventPlacement.placement.status["ipv6Address"];
	if (ipv6) {
		log(`${brandColor("assigned IPv6 address")} ${dim(ipv6)}\n`);
	}

	endSection("Done");

	logRaw(status.success + " Created your container\n");

	logRaw(
		`Run ${brandColor(
			`wrangler cloudchamber list ${deployment.id.slice(0, 6)}`
		)} to check its status`
	);
}

async function waitForPlacementInstance(deployment: DeploymentV2) {
	const s = spinner();
	s.start(
		"Assigning a placement in " + idToLocationName(deployment.location.name)
	);
	const [d, err] = await wrap(
		pollDeploymentUntilCondition(deployment.id, (newDeployment) => {
			if (newDeployment.current_placement && !deployment.current_placement) {
				return true;
			}

			if (!newDeployment.current_placement) {
				return false;
			}

			if (newDeployment.version > deployment.version) {
				s.stop();
				throw new WaitForAnotherPlacement(
					`There is a new version of the deployment modified in another wrangler session, new version is ${newDeployment.version}`
				);
			}

			if (
				newDeployment.current_placement.deployment_version < deployment.version
			) {
				return false;
			}

			return (
				newDeployment.current_placement.id !== deployment.current_placement?.id
			);
		})
	);
	s.stop();
	if (err instanceof WaitForAnotherPlacement) {
		throw err;
	}

	if (err) {
		throw new UserError(err.message);
	}

	updateStatus(
		"Assigned placement in " + idToLocationName(deployment.location.name),
		false
	);

	if (d.current_placement !== undefined) {
		log(
			`${brandColor("version")} ${dim(d.current_placement.deployment_version)}`
		);
		log(`${brandColor("id")} ${dim(d.current_placement?.id)}`);
		newline();
	}

	deployment.current_placement = d.current_placement;
}

export async function waitForPlacement(deployment: DeploymentV2) {
	let currentDeployment = { ...deployment };
	let keepIterating = true;
	while (keepIterating) {
		try {
			await waitForPlacementInstance(currentDeployment);
			await waitForImagePull(currentDeployment);
			await waitForVMToStart(currentDeployment);
			keepIterating = false;
		} catch (err) {
			if (err instanceof WaitForAnotherPlacement) {
				updateStatus(status.error + " " + err.message);
				log(
					"We will retry by waiting for another placement. You can see more details about your deployment with \n" +
						brandColor("wrangler cloudchamber list " + currentDeployment.id) +
						"\n"
				);
				const [newDeployment, getDeploymentError] = await wrap(
					DeploymentsService.getDeploymentV2(deployment.id)
				);
				if (getDeploymentError) {
					throw new UserError(
						"Couldn't retrieve a new deployment: " + getDeploymentError.message
					);
				}

				currentDeployment = newDeployment;
				continue;
			}

			throw err;
		}
	}
}
