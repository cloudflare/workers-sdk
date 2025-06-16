import path from "path";
import {
	constructBuildCommand,
	dockerBuild,
	dockerImageInspect,
	MF_DEV_CONTAINER_PREFIX,
	runDockerCmd,
	runDockerCmdWithOutput,
	verifyDockerInstalled,
} from "@cloudflare/containers-shared";
import { dim } from "kleur/colors";
import { Log } from "../../../shared";
import { ContainerOptions, ContainersSharedOptions } from "../index";

/**
 * ContainerController manages container configuration, building or pulling
 * containers, and cleaning up containers at the end of the dev session.
 */
export class ContainerController {
	#containerOptions: { [className: string]: ContainerOptions };
	#sharedOptions: ContainersSharedOptions;
	#logger: Log;
	#dockerInstalled: boolean = false;
	#imagesBuilt: Set<string> = new Set();
	constructor(
		containerOptions: { [className: string]: ContainerOptions },
		sharedOptions: ContainersSharedOptions,
		logger: Log
	) {
		this.#containerOptions = containerOptions;
		this.#sharedOptions = sharedOptions;
		this.#logger = logger;
		if (process.platform === "win32") {
			throw new Error(
				"Local development with containers is currently not supported on Windows. You should use WSL instead. You can also set `enable_containers` to false if you do not need to develop the container part of your application."
			);
		}
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
		// just let the tag default to latest
		const { buildCmd, dockerfile } = await constructBuildCommand({
			tag: options.imageTag,
			pathToDockerfile: options.image,
			buildContext: options.imageBuildContext ?? path.dirname(options.image),
			args: options.args,
			platform: "linux/amd64",
		});
		this.#imagesBuilt.add(options.imageTag);
		await dockerBuild(this.#sharedOptions.dockerPath, { buildCmd, dockerfile });
		await this.checkExposedPorts(options.imageTag);
	}

	async checkExposedPorts(imageTag: string) {
		const output = await dockerImageInspect(this.#sharedOptions.dockerPath, {
			imageTag,
			formatString: "{{ len .Config.ExposedPorts }}",
		});
		if (output === "0" && process.platform !== "linux") {
			throw new Error(
				`The container "${imageTag.replace(MF_DEV_CONTAINER_PREFIX + "/", "")}" does not expose any ports.\n` +
					"To develop containers locally on non-Linux platforms, you must expose any ports that you call with `getTCPPort()` in your Dockerfile."
			);
		}
	}

	async cleanupContainers() {
		if (this.#imagesBuilt.size === 0) {
			return;
		}

		this.#logger.info(dim("Cleaning up containers..."));

		try {
			// Find all containers (stopped and running) for each built image in parallel
			const containerPromises = Array.from(this.#imagesBuilt).map(
				async (imageTag) => {
					return await this.getContainers(imageTag);
				}
			);
			const containerResults = await Promise.all(containerPromises);
			const allContainerIds = containerResults.flat();
			if (allContainerIds.length === 0) {
				return;
			}

			// Workerd should have stopped all containers, but clean up any in case. Sends a sigkill.
			await runDockerCmd(
				this.#sharedOptions.dockerPath,
				["rm", "--force", ...allContainerIds],
				["inherit", "pipe", "pipe"]
			);
		} catch (error) {
			this.#logger.warn(
				`Failed to cleanup containers: ${error instanceof Error ? error.message : String(error)}. You may need to manually stop and/or remove any containers started during dev.`
			);
		}
	}

	async getContainers(ancestorImage: string) {
		const output = await runDockerCmdWithOutput(
			this.#sharedOptions.dockerPath,
			[
				"ps",
				"-a",
				"--filter",
				`ancestor=${ancestorImage}`,
				"--format",
				"{{.ID}}",
			]
		);
		return output ? output.split("\n").filter((line) => line.trim()) : [];
	}
}
