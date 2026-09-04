import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getDockerPath } from "@cloudflare/workers-utils/docker-path";
import { UserError } from "@cloudflare/workers-utils/errors";
import { isDirectory } from "@cloudflare/workers-utils/fs-helpers";
import { logger } from "./context";
import { resolveImageName } from "./images";
import { dockerImageInspect } from "./inspect";
import { getCloudflareContainerRegistry } from "./knobs";
import { ensureContainerLimits, getContainerAccount } from "./limits";
import { dockerLoginImageRegistry } from "./login";
import { verifyDockerInstalled } from "./utils";
import { runDockerCmd, runDockerCmdWithOutput } from "./utils";
import type {
	BuildArgs,
	ContainerNormalizedConfig,
	ImageURIConfig,
} from "./types";
import type { ComplianceConfig } from "@cloudflare/workers-utils";

export type DockerfileContainerConfig = Exclude<
	ContainerNormalizedConfig,
	ImageURIConfig
>;

export type BuiltContainerImage = {
	containerConfig: DockerfileContainerConfig;
	localTag: string;
};

export type BuiltContainerDeployment = {
	container: DockerfileContainerConfig;
	builtImage: BuiltContainerImage;
};

export function isDockerfileContainerConfig(
	container: ContainerNormalizedConfig
): container is DockerfileContainerConfig {
	return "dockerfile" in container;
}

async function constructBuildCommand(options: BuildArgs) {
	const platform = options.platform ?? "linux/amd64";
	const buildCmd = [
		"build",
		"--load",
		"-t",
		options.tag,
		"--platform",
		platform,
		"--provenance=false",
	];

	if (options.args) {
		for (const arg in options.args) {
			buildCmd.push("--build-arg", `${arg}=${options.args[arg]}`);
		}
	}
	if (options.setNetworkToHost) {
		buildCmd.push("--network", "host");
	}

	const dockerfile = readFileSync(options.pathToDockerfile, "utf-8");
	// pipe in the dockerfile
	buildCmd.push("-f", "-");
	buildCmd.push(options.buildContext);
	logger?.debug(`Building image with command: ${buildCmd.join(" ")}`);
	return { buildCmd, dockerfile };
}

/**
 * `{ remoteDigest: string }` implies the image was pushed to, or already exists in,
 * the managed registry. Deployments should use this digest-pinned reference.
 *
 * `{ newTag: string }` implies the image was built locally without pushing.
 */
export type ImageRef = { remoteDigest: string } | { newTag: string };

export type ContainerBuildCommandArgs = {
	PATH: string;
	tag: string;
	pathToDocker?: string;
	push: boolean;
	platform?: string;
};

export type ContainerPushCommandArgs = {
	TAG: string;
	pathToDocker?: string;
};

type StartedContainerBuild = Awaited<ReturnType<typeof dockerBuild>>;

/**
 * Builds a container image from the given container options.
 *
 * @param build - Container configuration including the Dockerfile path, build context, and image tag.
 * @param pathToDocker - Path to the Docker CLI executable.
 * @param verifyDockerIsRunning - When `true` (the default), verifies Docker is installed
 *   and the daemon is running before building. Set to `false` when the caller has already
 *   performed this check.
 * @returns An object with an `abort` function and a `ready` promise.
 */
export async function startContainerBuild({
	build,
	pathToDocker,
	verifyDockerIsRunning,
}: {
	build: BuildArgs;
	pathToDocker: string;
	verifyDockerIsRunning?: boolean;
}): Promise<StartedContainerBuild> {
	const { buildCmd, dockerfile } = await constructBuildCommand(build);
	return await dockerBuild(pathToDocker, {
		buildCmd,
		dockerfile,
		verifyDockerIsRunning,
	});
}

const DIGEST_SUFFIX_REGEXP =
	/@[A-Za-z][A-Za-z0-9]*(?:[-_+.][A-Za-z][A-Za-z0-9]*)*:[a-fA-F0-9]{32,}$/;
const DIGEST_VALUE_REGEXP =
	/^[A-Za-z][A-Za-z0-9]*(?:[-_+.][A-Za-z][A-Za-z0-9]*)*:[a-fA-F0-9]{32,}$/;
const TAG_SUFFIX_REGEXP = /:[\w][\w.-]{0,127}$/;

// Based on the Docker reference grammar used by containers/image. These only
// strip suffixes from refs that have already been normalized by resolveImageName().
function getRepositoryOnly(
	externalAccountId: string,
	imageTag: string,
	complianceConfig?: ComplianceConfig
): string {
	return resolveImageName(externalAccountId, imageTag, complianceConfig)
		.replace(DIGEST_SUFFIX_REGEXP, "")
		.replace(TAG_SUFFIX_REGEXP, "");
}

function imageRefWithDigest(
	externalAccountId: string,
	imageTag: string,
	digest: string,
	complianceConfig?: ComplianceConfig
): string {
	if (!DIGEST_VALUE_REGEXP.test(digest)) {
		throw new Error(
			`Expected image digest to match algorithm:hex format, got ${digest}`
		);
	}
	return `${getRepositoryOnly(externalAccountId, imageTag, complianceConfig)}@${digest}`;
}

function findManifestDigest(manifestOutput: string): string {
	const parsedManifest = JSON.parse(manifestOutput);
	const digest = parsedManifest?.Descriptor?.digest;
	if (typeof digest !== "string" || digest.length === 0) {
		throw new Error(
			`Expected docker manifest inspect output to include Descriptor.digest, got ${manifestOutput}`
		);
	}
	return digest;
}

function findRemoteDigest(
	repoDigestsJson: string,
	externalAccountId: string,
	imageTag: string,
	complianceConfig?: ComplianceConfig
): string {
	const parsedDigests = JSON.parse(repoDigestsJson);
	if (!Array.isArray(parsedDigests)) {
		throw new Error(
			`Expected RepoDigests from docker inspect to be an array but got ${JSON.stringify(parsedDigests)}`
		);
	}

	const repositoryOnly = getRepositoryOnly(
		externalAccountId,
		imageTag,
		complianceConfig
	);
	logger.debug("respositoryOnly:", repositoryOnly);

	// Make sure the repository + name provided in config matches the repository
	// + name from the digests.
	const digest = parsedDigests.find((d): d is string => {
		if (typeof d !== "string" || !d.includes("@")) {
			return false;
		}
		const resolved = resolveImageName(externalAccountId, d, complianceConfig);
		logger.debug(`Comparing ${resolved.split("@")[0]} to ${repositoryOnly}`);
		return resolved.split("@")[0] === repositoryOnly;
	});
	if (!digest) {
		throw new Error(
			`Could not find a digest for the image ${repositoryOnly}. Found digests: ${parsedDigests.join(", ")}`
		);
	}

	const [, hash] = digest.split("@");
	assertString(hash, `Expected digest "${digest}" to include a hash`);
	return imageRefWithDigest(
		externalAccountId,
		imageTag,
		hash,
		complianceConfig
	);
}

function assertString(
	value: string | undefined,
	message: string
): asserts value is string {
	if (value === undefined) {
		throw new Error(message);
	}
}

async function tagAndPushImage({
	pathToDocker,
	sourceTag,
	targetTag,
	externalAccountId,
	complianceConfig,
	cleanupSourceTag,
}: {
	pathToDocker: string;
	sourceTag: string;
	targetTag: string;
	externalAccountId: string;
	complianceConfig?: ComplianceConfig;
	cleanupSourceTag?: boolean;
}): Promise<string> {
	const namespacedImageTag = resolveImageName(
		externalAccountId,
		targetTag,
		complianceConfig
	);
	await runDockerCmd(pathToDocker, ["tag", sourceTag, namespacedImageTag]);
	if (cleanupSourceTag) {
		logger.debug(`Untagging built image: ${sourceTag}.`);
		await runDockerCmd(pathToDocker, ["image", "rm", sourceTag]);
	}
	await runDockerCmd(pathToDocker, ["push", namespacedImageTag]);
	return namespacedImageTag;
}

/**
 * Checks the remote manifest to see if there are changes, and only push if there are
 */
async function pushImageIfChanged({
	pathToDocker,
	sourceTag,
	targetTag,
	containerConfig,
	accountId,
	complianceConfig,
	cleanupSourceTag,
}: {
	pathToDocker: string;
	sourceTag: string;
	targetTag: string;
	containerConfig?: DockerfileContainerConfig;
	accountId?: string;
	complianceConfig?: ComplianceConfig;
	cleanupSourceTag?: boolean;
}): Promise<ImageRef> {
	/**
	 * Get `RepoDigests`:
	 * A Docker image digest (RepoDigest) is a unique, cryptographic identifier
	 * (SHA-256 hash) representing the content of a Docker image. Unlike tags,
	 * which can be reused or changed, a digest is immutable and ensures that the
	 * exact same image is pulled every time. This guarantees consistency across
	 * different environments and deployments. Crucially this is *not* affected by
	 * metadata changes (dockerfile only changes).
	 * From: https://docs.docker.com/dhi/core-concepts/digests/
	 */
	const imageInfo = await dockerImageInspect(pathToDocker, {
		imageTag: sourceTag,
		formatString: "{{ json .RepoDigests }}",
	});
	logger.debug(`'docker image inspect ${sourceTag}':`, imageInfo);

	const account = await getContainerAccount(accountId, complianceConfig);

	await ensureContainerLimits({
		pathToDocker,
		imageTag: sourceTag,
		account,
		containerConfig,
	});

	await dockerLoginImageRegistry(
		pathToDocker,
		// Won't be an external registry since this is building from a Dockerfile
		// rather than specifying an image URI.
		getCloudflareContainerRegistry(complianceConfig),
		accountId ?? account.external_account_id,
		complianceConfig
	);
	try {
		// We don't try to parse until this point because we don't want to fail on
		// parse errors if we won't be pushing the image anyway.
		const remoteDigest = findRemoteDigest(
			imageInfo,
			account.external_account_id,
			targetTag,
			complianceConfig
		);
		const [, hash] = remoteDigest.split("@");

		logger.debug(
			`'docker manifest inspect -v ${resolveImageName(account.external_account_id, remoteDigest, complianceConfig)}:`
		);
		// NOTE: this is an experimental docker command so the API may change
		// and break this flow. Hopefully not!
		// http://docs.docker.com/reference/cli/docker/manifest/inspect/
		// Checks if this image already exists in the managed registry. If this
		// succeeds it means this image already exists remotely. If this errors,
		// it probably doesn't exist and we should push, which we will do in the
		// catch block.
		const remoteManifest = runDockerCmdWithOutput(pathToDocker, [
			"manifest",
			"inspect",
			"-v",
			resolveImageName(
				account.external_account_id,
				remoteDigest,
				complianceConfig
			),
		]);
		const parsedRemoteManifest = JSON.parse(remoteManifest);

		if (parsedRemoteManifest.Descriptor.digest === hash) {
			logger.log("Image already exists remotely, skipping push");
			logger.debug(
				`Untagging built image: ${sourceTag} since there was no change.`
			);

			await runDockerCmd(pathToDocker, ["image", "rm", sourceTag]);

			return { remoteDigest };
		}
	} catch (error) {
		if (error instanceof Error) {
			logger.debug(
				`Checking for local image ${sourceTag} failed with error: ${error.message}`
			);
		}
	}
	// Re-tag the image to include the account ID.
	logger.log(
		`Image does not exist remotely, pushing: ${resolveImageName(
			account.external_account_id,
			targetTag,
			complianceConfig
		)}`
	);
	const namespacedImageTag = await tagAndPushImage({
		pathToDocker,
		sourceTag,
		targetTag,
		externalAccountId: account.external_account_id,
		complianceConfig,
		cleanupSourceTag,
	});

	let remoteDigest: string;
	try {
		const pushedImageInfo = await dockerImageInspect(pathToDocker, {
			imageTag: namespacedImageTag,
			formatString: "{{ json .RepoDigests }}",
		});
		remoteDigest = findRemoteDigest(
			pushedImageInfo,
			account.external_account_id,
			namespacedImageTag,
			complianceConfig
		);
	} catch (error) {
		if (error instanceof Error) {
			logger.debug(
				`Inspecting pushed image ${namespacedImageTag} failed with error: ${error.message}`
			);
		}
		const remoteManifest = runDockerCmdWithOutput(pathToDocker, [
			"manifest",
			"inspect",
			"-v",
			namespacedImageTag,
		]);
		remoteDigest = imageRefWithDigest(
			account.external_account_id,
			namespacedImageTag,
			findManifestDigest(remoteManifest),
			complianceConfig
		);
	}

	return { remoteDigest };
}

/**
 * Builds an image from the container build command arguments and optionally
 * pushes it to the Cloudflare managed registry.
 *
 * @param args - Parsed container build command arguments.
 * @param complianceConfig - Compliance configuration used to select the managed registry.
 * @returns A promise that resolves when the build and optional push complete.
 */
export async function buildCommand(
	args: ContainerBuildCommandArgs,
	complianceConfig?: ComplianceConfig
) {
	// TODO: merge args with Wrangler config if available.
	if (existsSync(args.PATH) && !isDirectory(args.PATH)) {
		throw new UserError(
			`${args.PATH} is not a directory. Please specify a valid directory path.`,
			{ telemetryMessage: "container build invalid path" }
		);
	}
	if (args.platform !== undefined && args.platform !== "linux/amd64") {
		throw new UserError(
			`Unsupported platform: Platform "${args.platform}" is unsupported. Please use "linux/amd64" instead.`,
			{ telemetryMessage: "container build unsupported platform" }
		);
	}

	const pathToDockerfile = join(args.PATH, "Dockerfile");
	const pathToDocker = args.pathToDocker ?? getDockerPath();

	try {
		const build = await startContainerBuild({
			pathToDocker,
			build: {
				tag: args.tag,
				pathToDockerfile,
				buildContext: args.PATH,
				platform: args.platform,
				// No option to add env vars at build time...?
				setNetworkToHost: Boolean(
					process.env.WRANGLER_CI_OVERRIDE_NETWORK_MODE_HOST
				),
			},
		});
		await build.ready;

		if (args.push) {
			await pushImageIfChanged({
				pathToDocker,
				sourceTag: args.tag,
				targetTag: args.tag,
				complianceConfig,
			});
		}
	} catch (error) {
		if (error instanceof Error) {
			throw new UserError(error.message, {
				cause: error,
				telemetryMessage: "container build image operation failed",
			});
		}
		throw new UserError("An unknown error occurred", {
			telemetryMessage: "container build unknown error",
		});
	}
}

export async function pushCommand(
	args: ContainerPushCommandArgs,
	accountId: string,
	complianceConfig?: ComplianceConfig
) {
	try {
		const dockerPath = args.pathToDocker ?? getDockerPath();
		await dockerLoginImageRegistry(
			dockerPath,
			getCloudflareContainerRegistry(complianceConfig),
			accountId,
			complianceConfig
		);

		await checkImagePlatform(dockerPath, args.TAG);
		const newTag = await tagAndPushImage({
			pathToDocker: dockerPath,
			sourceTag: args.TAG,
			targetTag: args.TAG,
			externalAccountId: accountId,
			complianceConfig,
		});
		logger.log(`Pushed image: ${newTag}`);
	} catch (error) {
		if (error instanceof Error) {
			throw new UserError(error.message, {
				telemetryMessage: "container push failed",
			});
		}

		throw new UserError("An unknown error occurred", {
			telemetryMessage: "container push unknown error",
		});
	}
}

async function checkImagePlatform(
	pathToDocker: string,
	imageTag: string,
	expectedPlatform: string = "linux/amd64"
) {
	const platform = await dockerImageInspect(pathToDocker, {
		imageTag,
		formatString: "{{ .Os }}/{{ .Architecture }}",
	});

	if (platform !== expectedPlatform) {
		throw new Error(
			`Unsupported platform: Image platform (${platform}) does not match the expected platform (${expectedPlatform})`
		);
	}
}

async function buildContainerImage(
	containerConfig: DockerfileContainerConfig,
	pathToDocker: string,
	verifyDockerIsRunning?: boolean
): Promise<BuiltContainerImage> {
	const localTag = `${getContainerImageRepositoryName(
		containerConfig
	)}:wrangler-${crypto.randomUUID()}`;
	logger.log("Building image", localTag);

	try {
		const build = await startContainerBuild({
			pathToDocker,
			verifyDockerIsRunning,
			build: {
				tag: localTag,
				pathToDockerfile: containerConfig.dockerfile,
				buildContext: containerConfig.image_build_context,
				args: containerConfig.image_vars,
			},
		});
		await build.ready;

		return { containerConfig, localTag };
	} catch (error) {
		if (error instanceof Error) {
			throw new UserError(error.message, {
				cause: error,
				telemetryMessage: "container build image operation failed",
			});
		}
		throw new UserError("An unknown error occurred", {
			telemetryMessage: "container build unknown error",
		});
	}
}

/**
 * Builds configured Dockerfile-based container images for deployment.
 *
 * @param containers - Normalized container configuration.
 * @param pathToDocker - Path to the Docker CLI executable.
 * @param verifyDockerIsRunning - Whether to verify Docker before building.
 * @returns The built image metadata paired with each Dockerfile-based container.
 */
export async function buildContainerImages(
	containers: ContainerNormalizedConfig[],
	pathToDocker: string,
	verifyDockerIsRunning?: boolean
): Promise<BuiltContainerDeployment[]> {
	const builtContainerDeployments: BuiltContainerDeployment[] = [];
	for (const container of containers.filter(isDockerfileContainerConfig)) {
		builtContainerDeployments.push({
			container,
			builtImage: await buildContainerImage(
				container,
				pathToDocker,
				verifyDockerIsRunning
			),
		});
	}
	return builtContainerDeployments;
}

/**
 * Pushes a configured, already-built container image to the managed registry.
 *
 * @param builtImage - Built Dockerfile-based container image metadata.
 * @param versionId - Version ID used to derive the pushed image tag.
 * @param pathToDocker - Path to the Docker CLI executable.
 * @param accountId - Account that owns the managed registry.
 * @param complianceConfig - Compliance configuration used to select the managed registry.
 * @returns An {@link ImageRef} describing the pushed image.
 */
export async function pushBuiltContainerImage(
	builtImage: BuiltContainerImage,
	versionId: string,
	pathToDocker: string,
	accountId: string,
	complianceConfig?: ComplianceConfig
): Promise<ImageRef> {
	try {
		return await pushImageIfChanged({
			pathToDocker,
			sourceTag: builtImage.localTag,
			targetTag: getContainerImageTag(builtImage.containerConfig, versionId),
			containerConfig: builtImage.containerConfig,
			accountId,
			complianceConfig,
			cleanupSourceTag: true,
		});
	} catch (error) {
		if (error instanceof Error) {
			throw new UserError(error.message, {
				cause: error,
				telemetryMessage: "container build image operation failed",
			});
		}
		throw new UserError("An unknown error occurred", {
			telemetryMessage: "container build unknown error",
		});
	}
}

export function getContainerImageTag(
	containerConfig: DockerfileContainerConfig,
	imageTag: string
): string {
	return `${getContainerImageRepositoryName(containerConfig)}:${
		imageTag.split("-")[0]
	}`;
}

function getContainerImageRepositoryName(
	containerConfig: DockerfileContainerConfig
): string {
	// Docker rejects uppercase characters in an image repository name, and a
	// container application name may embed a Durable Object class name verbatim,
	// which is conventionally PascalCase. Lowercase the name for the image tag
	// only; apply still needs the exact application name.
	return containerConfig.name.toLowerCase();
}

/**
 * Spawns a Docker build process and returns a handle to abort or await the build.
 *
 * By default this function first verifies that the Docker daemon is reachable.
 * Callers that have already performed this check (e.g. the dev and deploy flows)
 * should pass `verifyDockerIsRunning: false` to avoid a redundant check.
 *
 * @param dockerPath - Path to the Docker CLI executable.
 * @param options - Build options including the command arguments and Dockerfile content.
 * @param options.buildCmd - The Docker build command arguments.
 * @param options.dockerfile - The Dockerfile content to pipe into stdin.
 * @param options.verifyDockerIsRunning - When `true` (the default), verifies Docker is installed
 *   and the daemon is running before spawning the build. Set to `false` to skip the check.
 *
 * @returns An object with an `abort` function and a `ready` promise.
 */
export async function dockerBuild(
	dockerPath: string,
	options: {
		buildCmd: string[];
		dockerfile: string;
		verifyDockerIsRunning?: boolean;
	}
): Promise<{ abort: () => void; ready: Promise<void> }> {
	if (options.verifyDockerIsRunning !== false) {
		await verifyDockerInstalled({
			dockerPath,
			imageNoun: "the image",
		});
	}

	let errorHandled = false;
	let resolve: () => void;
	let reject: (err: unknown) => void;
	const ready = new Promise<void>((res, rej) => {
		resolve = res;
		reject = rej;
	});

	const child = spawn(dockerPath, options.buildCmd, {
		stdio: ["pipe", "inherit", "inherit"],
		// We need to set detached to true so that the child process
		// will control all of its child processes and we can kill
		// all of them in case we need to abort the build process.
		// On Windows, detached: true opens a new console window per child
		// process, so we only set it on non-Windows platforms.
		detached: process.platform !== "win32",
		// Prevent child processes from opening visible console windows on Windows.
		// This is a no-op on non-Windows platforms.
		windowsHide: true,
	});
	if (child.stdin !== null) {
		child.stdin.write(options.dockerfile);
		child.stdin.end();
	}

	child.on("exit", (code) => {
		if (code === 0) {
			resolve();
		} else if (!errorHandled) {
			errorHandled = true;
			reject(
				new UserError(`Docker build exited with code: ${code}`, {
					telemetryMessage: false,
				})
			);
		}
	});
	child.on("error", (err) => {
		if (!errorHandled) {
			errorHandled = true;
			reject(err);
		}
	});
	return {
		abort: () => {
			child.unref();
			if (child.pid !== undefined) {
				if (process.platform === "win32") {
					// On Windows, negative-PID process group kill is not supported.
					// Kill the child process directly instead.
					child.kill();
				} else {
					// Kill using the negative PID to terminate the whole process group
					// controlled by the child process.
					process.kill(-child.pid);
				}
			}
		},
		ready,
	};
}
