import path from "path";
import {
	constructBuildCommand,
	dockerBuild,
	dockerImageInspect,
	dockerLoginManagedRegistry,
	getCloudflareContainerRegistry,
	isCloudflareRegistryLink,
	isDockerfile,
	runDockerCmd,
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
			if (isDockerfile(options.image)) {
				await this.buildContainer(options);
			} else {
				if (!isCloudflareRegistryLink(options.image)) {
					throw new Error(
						`Image ${options.image} is a registry link but does not point to the Cloudflare container registry.\n` +
							`All images must use ${getCloudflareContainerRegistry()}, which is the default registry for Wrangler. To use an existing image from another repository, see https://developers.cloudflare.com/containers/image-management/#using-existing-images`
					);
				}

				await this.pullImage(options.image);
			}
		}
		// Miniflare will log 'Ready on...' before the containers are built, but that is actually the proxy server.
		// The actual User Worker's miniflare instance is blocked until the containers are built
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
					"To develop containers locally on non-Linux platforms, you must expose any ports that you call with `getTCPPort() in your Dockerfile."
			);
		}
	}

	// TODO should this live in containers-shared?
	async pullImage(image: string) {
		try {
			await dockerLoginManagedRegistry(this.#sharedOptions.dockerPath);
			await runDockerCmd(this.#sharedOptions.dockerPath, ["pull", image]);
			this.#logger.info(`Successfully pulled image: ${image}`);
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(error.message);
			}

			throw new Error(
				`An unknown error occurred while attempting to pull ${image} from the Cloudflare container registry`
			);
		}
	}
}
