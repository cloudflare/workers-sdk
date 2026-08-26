import {
	containerPrivilegesAllowed,
	FUSE_CONTAINER_PRIVILEGES,
} from "@cloudflare/containers-shared";
import { getDockerPath } from "@cloudflare/workers-utils";
import type {
	Worker_ContainerEngine,
	Worker_DurableObjectNamespace_ContainerOptions_ContainerPrivileges,
} from "../../runtime/config/workerd";

export type ContainerPrivileges =
	| Worker_DurableObjectNamespace_ContainerOptions_ContainerPrivileges
	| undefined;

/** Caches privilege detection for the current container engine. */
export class ContainerPrivilegesCache {
	#socketPath?: string;
	#privileges?: Promise<ContainerPrivileges>;

	/** Clears cached privileges when Miniflare selects a different engine. */
	setEngine(containerEngine: Worker_ContainerEngine): void {
		const socketPath = containerEngine.localDocker.socketPath;
		if (socketPath !== this.#socketPath) {
			this.#socketPath = socketPath;
			this.#privileges = undefined;
		}
	}

	/** Returns the privilege decision cached for the selected engine. */
	async get(
		containerEngine: Worker_ContainerEngine
	): Promise<ContainerPrivileges> {
		this.setEngine(containerEngine);
		if (this.#privileges === undefined) {
			this.#privileges = getContainerPrivileges(containerEngine);
		}
		try {
			return await this.#privileges;
		} catch {
			this.#privileges = undefined;
			return undefined;
		}
	}
}

/**
 * Returns FUSE privileges only when the selected Docker daemon has a safe
 * isolation boundary.
 */
export async function getContainerPrivileges(
	containerEngine: Worker_ContainerEngine
): Promise<ContainerPrivileges> {
	return (await containerPrivilegesAllowed(
		containerEngine.localDocker.socketPath,
		getDockerPath()
	))
		? FUSE_CONTAINER_PRIVILEGES
		: undefined;
}
