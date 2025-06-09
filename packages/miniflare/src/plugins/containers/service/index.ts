import path from "path";
import {
	constructBuildCommand,
	dockerBuild,
	verifyDockerInstalled,
} from "@cloudflare/containers-shared";
import { Log } from "../../../shared";
import { ContainerOptions, ContainersSharedOptions } from "../index";

const MF_CONTAINER_PREFIX = "cloudflare-dev";
/**
 * ContainerController manages container configuration, building or pulling
 * containers, and cleaning up containers at the end of the dev session.
 */
export class ContainerController {
	#containerOptions: { [className: string]: ContainerOptions };
	#sharedOptions: ContainersSharedOptions;
	#logger;
	#dockerInstalled: boolean = false;
	constructor(
		containerOptions: { [className: string]: ContainerOptions },
		sharedOptions: ContainersSharedOptions,
		logger: Log
	) {
		this.#containerOptions = containerOptions;
		this.#sharedOptions = sharedOptions;
		this.#logger = logger;
	}

	updateConfig(
		containerOptions: {
			[className: string]: ContainerOptions;
		},
		sharedOptions: ContainersSharedOptions
	): void {
		this.#containerOptions = containerOptions;
		this.#sharedOptions = sharedOptions;
		// TODO: rebuild containers (only) if the configuration has changed
	}

	async buildAllContainers() {
		if (!this.#dockerInstalled) {
			await verifyDockerInstalled(this.#sharedOptions.dockerPath);
			this.#dockerInstalled = true;
		}
		this.#logger.info("Building container(s)...");
		for (const options of Object.values(this.#containerOptions)) {
			await this.buildContainer(options);
		}
		// Miniflare will log 'Ready on...' before the containers are built, but that is actually the proxy server.
		// The actual user worker's miniflare instance is blocked until the containers are built
		this.#logger.info("Container(s) built and ready");
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
}
