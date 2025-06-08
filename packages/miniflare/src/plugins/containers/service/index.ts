import path from "path";
import {
	constructBuildCommand,
	dockerBuild,
} from "@cloudflare/containers-shared";
import { ContainerOptions, ContainersSharedOptions } from "../index";

const MF_CONTAINER_PREFIX = "cloudflare-dev";
/**
 * ContainerController manages container configuration, building or pulling
 * containers, and cleaning up containers at the end of the dev session.
 */
export class ContainerController {
	#containerOptions: { [className: string]: ContainerOptions };
	#sharedOptions: ContainersSharedOptions;
	constructor(
		containerOptions: { [className: string]: ContainerOptions },
		sharedOptions: ContainersSharedOptions
	) {
		this.#containerOptions = containerOptions;
		this.#sharedOptions = sharedOptions;
		this.help();
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
		// TODO: rebuild containers (only) if the configuration has changed
	}

	async buildAllContainers() {
		for (const options of Object.values(this.#containerOptions)) {
			await this.buildContainer(options);
		}
	}

	async buildContainer(options: ContainerOptions) {
		const { buildCmd, dockerfile } = await constructBuildCommand({
			// just let the tag default to latest?
			tag: `${MF_CONTAINER_PREFIX}/${options.name}`,
			pathToDockerfile: options.image,
			buildContext: options.imageBuildContext ?? path.dirname(options.image),
			args: options.args,
			platform: "linux/amd64",
		});
		await dockerBuild(this.#sharedOptions.dockerPath, { buildCmd, dockerfile });
	}

	help() {
		console.log("Hello from ContainerController!");
		console.log(
			`Container Options: ${JSON.stringify(this.#containerOptions, null, 2)}`
		);
		console.log(
			`Shared Options: ${JSON.stringify(this.#sharedOptions, null, 2)}`
		);
	}
}
