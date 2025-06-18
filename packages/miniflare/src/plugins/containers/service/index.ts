import path from "path";
import {
	constructBuildCommand,
	dockerBuild,
	dockerImageInspect,
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
	#logger: Log;
	#dockerInstalled: boolean = false;
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
		const tag = `${MF_CONTAINER_PREFIX}/${options.name}`;
		const { buildCmd, dockerfile } = await constructBuildCommand({
			tag,
			pathToDockerfile: options.image,
			buildContext: options.imageBuildContext ?? path.dirname(options.image),
			args: options.args,
			platform: "linux/amd64",
		});
		await dockerBuild(this.#sharedOptions.dockerPath, { buildCmd, dockerfile });
		await this.checkExposedPorts(tag);
	}

	async checkExposedPorts(imageTag: string) {
		const output = await dockerImageInspect(this.#sharedOptions.dockerPath, {
			imageTag,
			formatString: "{{ len .Config.ExposedPorts }}",
		});
		if (output === "0" && process.platform !== "linux") {
			throw new Error(
				`The container "${imageTag.replace(MF_CONTAINER_PREFIX + "/", "")}" does not expose any ports.\n` +
					"To develop containers locally on non-Linux platforms, you must expose any ports that you call with `getTCPPort()` in your Dockerfile."
			);
		}
	}
}
