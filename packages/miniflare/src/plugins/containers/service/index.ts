import path from "path";
import {
	constructBuildCommand,
	runDockerCmd,
} from "@cloudflare/containers-shared";
import { ContainerOptions, ContainersSharedOptions } from "../index";

const MF_CONTAINER_PREFIX = "cloudflare-dev";
export class ContainerService {
	#containerOptions: { [className: string]: ContainerOptions };
	#sharedOptions: ContainersSharedOptions;
	constructor(
		containerOptions: { [className: string]: ContainerOptions },
		sharedOptions: ContainersSharedOptions
	) {
		this.#containerOptions = containerOptions;
		this.#sharedOptions = sharedOptions;
		this.help();
		this.buildAllContainers();
	}

	updateConfig(
		containerOptions: {
			[className: string]: ContainerOptions;
		},
		sharedOptions: ContainersSharedOptions
	): void {
		this.#containerOptions = containerOptions;
		this.#sharedOptions = sharedOptions;
		this.help();
		// Rebuild containers that have changed
	}

	async buildAllContainers() {
		for (const [containerName, options] of Object.entries(
			this.#containerOptions
		)) {
			await this.buildContainer(containerName, "workerName", options);
		}
	}

	help() {
		console.log("Hello from ContainerService!");
		console.log(
			`Container Options: ${JSON.stringify(this.#containerOptions, null, 2)}`
		);
		console.log(
			`Shared Options: ${JSON.stringify(this.#sharedOptions, null, 2)}`
		);
	}

	async buildContainer(
		containerName: string,
		workerName: string,
		options: ContainerOptions
	) {
		const bc = await constructBuildCommand({
			// just let it be latest?
			// TODO: we need to definitely decide on the tag format
			tag: `${MF_CONTAINER_PREFIX}/${containerName.toLowerCase()}-${workerName.toLowerCase()}`,
			pathToDockerfile: options.image,
			buildContext: options.imageBuildContext ?? path.dirname(options.image),
			args: options.args,
			platform: "linux/amd64",
		});
		await runDockerCmd(this.#sharedOptions.dockerPath, bc);
	}
}
