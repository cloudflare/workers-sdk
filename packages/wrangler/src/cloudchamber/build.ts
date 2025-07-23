import { existsSync } from "fs";
import { join } from "path";
import {
	constructBuildCommand,
	dockerBuild,
	dockerImageInspect,
	dockerLoginManagedRegistry,
	getCloudflareContainerRegistry,
	getCloudflareRegistryWithAccountNamespace,
	isDir,
	resolveImageName,
	runDockerCmd,
} from "@cloudflare/containers-shared";
import {
	getCIOverrideNetworkModeHost,
	getDockerPath,
} from "../environment-variables/misc-variables";
import { UserError } from "../errors";
import { logger } from "../logger";
import { getAccountId } from "../user";
import { loadAccount } from "./locations";
import type { Config } from "../config";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
import type {
	BuildArgs,
	CompleteAccountCustomer,
} from "@cloudflare/containers-shared";

export function buildYargs(yargs: CommonYargsArgv) {
	return yargs
		.positional("PATH", {
			type: "string",
			describe: "Path for the directory containing the Dockerfile to build",
			demandOption: true,
		})
		.option("tag", {
			alias: "t",
			type: "string",
			demandOption: true,
			describe: 'Name and optionally a tag (format: "name:tag")',
		})
		.option("path-to-docker", {
			type: "string",
			default: "docker",
			describe: "Path to your docker binary if it's not on $PATH",
			demandOption: false,
		})
		.option("push", {
			alias: "p",
			type: "boolean",
			describe: "Push the built image to Cloudflare's managed registry",
			default: false,
		})
		.option("platform", {
			type: "string",
			default: "linux/amd64",
			describe:
				"Platform to build for. Defaults to the architecture support by Workers (linux/amd64)",
			demandOption: false,
			hidden: true,
			deprecated: true,
		});
}

export function pushYargs(yargs: CommonYargsArgv) {
	return yargs
		.option("path-to-docker", {
			type: "string",
			default: "docker",
			describe: "Path to your docker binary if it's not on $PATH",
			demandOption: false,
		})
		.positional("TAG", { type: "string", demandOption: true });
}

export async function buildAndMaybePush(
	args: BuildArgs,
	pathToDocker: string,
	push: boolean,
	configDiskInBytes: number | undefined
): Promise<{ image: string; pushed: boolean }> {
	try {
		const imageTag = `${getCloudflareContainerRegistry()}/${args.tag}`;
		const { buildCmd, dockerfile } = await constructBuildCommand(
			{
				tag: imageTag,
				pathToDockerfile: args.pathToDockerfile,
				buildContext: args.buildContext,
				args: args.args,
				platform: args.platform,
				setNetworkToHost: Boolean(getCIOverrideNetworkModeHost()),
			},
			logger
		);

		await dockerBuild(pathToDocker, {
			buildCmd,
			dockerfile,
		}).ready;

		const inspectOutput = await dockerImageInspect(pathToDocker, {
			imageTag,
			formatString:
				"{{ .Size }} {{ len .RootFS.Layers }} {{json .RepoDigests}}",
		});

		const [sizeStr, layerStr, repoDigests] = inspectOutput.split(" ");

		let pushed = false;
		if (push) {
			const account = await loadAccount();

			const size = parseInt(sizeStr, 10);
			const layers = parseInt(layerStr, 10);

			// 16MiB is the layer size adjustments we use in devmapper
			const MiB = 1024 * 1024;
			const requiredSizeInBytes = Math.ceil(size * 1.1 + layers * 16 * MiB);
			await ensureDiskLimits({
				requiredSizeInBytes,
				account,
				configDiskInBytes,
			});

			await dockerLoginManagedRegistry(pathToDocker);
			try {
				// We don't try to parse repoDigests until this point
				// because we don't want to fail on parse errors if we
				// won't be pushing the image anyways.
				//
				// A Docker image digest is a unique, cryptographic identifier (SHA-256 hash)
				// representing the content of a Docker image. Unlike tags, which can be reused
				// or changed, a digest is immutable and ensures that the exact same image is
				// pulled every time. This guarantees consistency across different environments
				// and deployments.
				// From: https://docs.docker.com/dhi/core-concepts/digests/
				const parsedDigests = JSON.parse(repoDigests);

				if (!Array.isArray(parsedDigests)) {
					// If it's not the format we expect, fall back to pushing
					// since it's annoying but safe.
					throw new Error(
						`Expected RepoDigests from docker inspect to be an array but got ${JSON.stringify(parsedDigests)}`
					);
				}

				const repositoryOnly = imageTag.split(":")[0];
				// if this succeeds it means this image already exists remotely
				// if it fails it means it doesn't exist remotely and should be pushed.
				const [digest, ...rest] = parsedDigests.filter(
					(d): d is string =>
						typeof d === "string" && d.split("@")[0] === repositoryOnly
				);
				if (rest.length > 0) {
					throw new Error(
						`Expected there to only be 1 valid digests for this repository: ${repositoryOnly} but there were ${rest.length + 1}`
					);
				}

				// Resolve the image name to include the user's
				// account ID before checking if it exists in
				// the managed registry.
				const [image, hash] = digest.split("@");
				const resolvedImage = resolveImageName(
					account.external_account_id,
					image
				);
				const remoteDigest = `${resolvedImage}@${hash}`;

				// http://docs.docker.com/reference/cli/docker/manifest/inspect/
				// Checks if this image already exists in the managed registry
				// If this errors, it probably doesn't exist. Either way, we fall
				// back to pushing the image, which is safer.
				await runDockerCmd(
					pathToDocker,
					["manifest", "inspect", remoteDigest],
					"ignore"
				);

				logger.log("Image already exists remotely, skipping push");
				logger.debug(
					`Untagging built image: ${args.tag} since there was no change.`
				);
				await runDockerCmd(pathToDocker, ["image", "rm", imageTag]);
				return { image: remoteDigest, pushed: false };
			} catch (error) {
				if (error instanceof Error) {
					logger.debug(
						`Checking for local image ${args.tag} failed with error: ${error.message}`
					);
				}

				// Re-tag the image to include the account ID
				const namespacedImageTag = getCloudflareRegistryWithAccountNamespace(
					account.external_account_id,
					args.tag
				);

				logger.log(
					`Image does not exist remotely, pushing: ${namespacedImageTag}`
				);
				await runDockerCmd(pathToDocker, ["tag", imageTag, namespacedImageTag]);
				await runDockerCmd(pathToDocker, ["push", namespacedImageTag]);
				await runDockerCmd(pathToDocker, ["image", "rm", namespacedImageTag]);
				pushed = true;
			}
		}
		return { image: imageTag, pushed: pushed };
	} catch (error) {
		if (error instanceof Error) {
			throw new UserError(error.message, { cause: error });
		}
		throw new UserError("An unknown error occurred");
	}
}

export async function buildCommand(
	args: StrictYargsOptionsToInterface<typeof buildYargs>
) {
	// TODO: merge args with Wrangler config if available
	if (existsSync(args.PATH) && !isDir(args.PATH)) {
		throw new UserError(
			`${args.PATH} is not a directory. Please specify a valid directory path.`
		);
	}
	if (args.platform !== "linux/amd64") {
		throw new UserError(
			`Unsupported platform: Platform "${args.platform}" is unsupported. Please use "linux/amd64" instead.`
		);
	}

	const pathToDockerfile = join(args.PATH, "Dockerfile");

	await buildAndMaybePush(
		{
			tag: args.tag,
			pathToDockerfile,
			buildContext: args.PATH,
			platform: args.platform,
			// no option to add env vars at build time...?
		},
		getDockerPath() ?? args.pathToDocker,
		args.push,
		// this means we won't be able to read the disk size from the config, but that option is deprecated anyway at least for containers.
		// and this never actually worked for cloudchamber as this command was previously reading it from config.containers not config.cloudchamber
		undefined
	);
}

export async function pushCommand(
	args: StrictYargsOptionsToInterface<typeof pushYargs>,
	config: Config
) {
	try {
		await dockerLoginManagedRegistry(args.pathToDocker);
		const accountId = config.account_id || (await getAccountId(config));
		const newTag = getCloudflareRegistryWithAccountNamespace(
			accountId,
			args.TAG
		);
		const dockerPath = args.pathToDocker ?? getDockerPath();
		await checkImagePlatform(dockerPath, args.TAG);
		await runDockerCmd(dockerPath, ["tag", args.TAG, newTag]);
		await runDockerCmd(dockerPath, ["push", newTag]);
		logger.log(`Pushed image: ${newTag}`);
	} catch (error) {
		if (error instanceof Error) {
			throw new UserError(error.message);
		}

		throw new UserError("An unknown error occurred");
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

export async function ensureDiskLimits(options: {
	requiredSizeInBytes: number;
	account: CompleteAccountCustomer;
	configDiskInBytes: number | undefined;
}): Promise<void> {
	const MB = 1000 * 1000;
	const accountDiskSizeInBytes =
		(options.account.limits.disk_mb_per_deployment ?? 2000) * MB;
	// if appDiskSize is defined and configured to be more than the accountDiskSize, error
	if (
		options.configDiskInBytes &&
		options.configDiskInBytes > accountDiskSizeInBytes
	) {
		throw new UserError(
			`Exceeded account limits: Your container is configured to use a disk size of ${Math.ceil(options.configDiskInBytes / MB)}MB. However, that exceeds the account limit of ${accountDiskSizeInBytes / MB}MB`
		);
	}
	const maxAllowedImageSizeBytes =
		options.configDiskInBytes ?? accountDiskSizeInBytes;

	logger.debug(
		`Disk size limits when building the container: appDiskSize: ${options.configDiskInBytes ? Math.ceil(options.configDiskInBytes / MB) : "n/a"}MB, accountDiskSize:${accountDiskSizeInBytes / MB}MB, maxAllowedImageSizeBytes=${maxAllowedImageSizeBytes}(${maxAllowedImageSizeBytes / MB}MB), requiredSize=${options.requiredSizeInBytes}(${Math.ceil(options.requiredSizeInBytes / MB)}MB)`
	);
	if (maxAllowedImageSizeBytes < options.requiredSizeInBytes) {
		throw new UserError(
			`Image too large: needs ${Math.ceil(options.requiredSizeInBytes / MB)}MB, but your app is limited to images with size ${maxAllowedImageSizeBytes / MB}MB. Your account needs more disk size per instance to run this container. The default disk size is 2GB.`
		);
	}
}
