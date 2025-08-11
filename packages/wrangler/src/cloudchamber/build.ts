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
	runDockerCmdWithOutput,
} from "@cloudflare/containers-shared";
import {
	getCIOverrideNetworkModeHost,
	getDockerPath,
} from "../environment-variables/misc-variables";
import { UserError } from "../errors";
import { logger } from "../logger";
import { getAccountId } from "../user";
import { ensureContainerLimits } from "./limits";
import { loadAccount } from "./locations";
import type { Config } from "../config";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
import type {
	BuildArgs,
	ContainerNormalizedConfig,
	ImageURIConfig,
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
	containerConfig?: Exclude<ContainerNormalizedConfig, ImageURIConfig>
): Promise<{ image: string; pushed: boolean }> {
	try {
		const imageTag = `${getCloudflareContainerRegistry()}/${args.tag}`;
		logger.debug("imageTag", imageTag);
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

		let pushed = false;
		if (push) {
			/**
			 * Get `RepoDigests` and `Id`:
			 * A Docker image digest (RepoDigest) is a unique, cryptographic identifier (SHA-256 hash)
			 * representing the content of a Docker image. Unlike tags, which can be reused		or changed, a digest is immutable and ensures that the exact same image is
			 * pulled every time. This guarantees consistency across different environments
			 * and deployments. Crucially this is *not* affected by metadata changes (dockerfile only changes).
			 * From: https://docs.docker.com/dhi/core-concepts/digests/
			 * The image Id is a sha hash of the image's configuration, so it *does* capture metadata changes.
			 * We need both to know when to push the image to the managed registry.
			 */
			const imageInfo = await dockerImageInspect(pathToDocker, {
				imageTag,
				formatString: "{{ json .RepoDigests }} {{ .Id }}",
			});
			logger.debug("imageInfo", imageInfo);

			const account = await loadAccount();

			await ensureContainerLimits({
				pathToDocker,
				imageTag,
				account,
				containerConfig,
			});

			await dockerLoginManagedRegistry(pathToDocker);
			try {
				const [digests, imageId] = imageInfo.split(" ");
				logger.debug("digests", digests);
				logger.debug("imageId", imageId);
				// We don't try to parse until this point
				// because we don't want to fail on parse errors if we
				// won't be pushing the image anyways.
				const parsedDigests = JSON.parse(digests);
				logger.debug("parsedDigests", parsedDigests);
				if (!Array.isArray(parsedDigests)) {
					// If it's not the format we expect, fall back to pushing
					// since it's annoying but safe.
					throw new Error(
						`Expected RepoDigests from docker inspect to be an array but got ${JSON.stringify(parsedDigests)}`
					);
				}

				const repositoryOnly = resolveImageName(
					account.external_account_id,
					imageTag
				).split(":")[0];
				logger.debug("repositoryOnly", repositoryOnly);

				// if this succeeds it means this image already exists remotely
				// if it fails it means it doesn't exist remotely and should be pushed.
				const [digest, ...rest] = parsedDigests.filter((d): d is string => {
					const resolved = resolveImageName(account.external_account_id, d);
					logger.debug("resolved", resolved);
					return (
						typeof d === "string" && resolved.split("@")[0] === repositoryOnly
					);
				});
				logger.debug("digest", digest);

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
				logger.debug("remoteDigest", remoteDigest);

				// NOTE: this is an experimental docker command so the API may change
				// and break this flow. Hopefully not!
				// http://docs.docker.com/reference/cli/docker/manifest/inspect/
				// Checks if this image already exists in the managed registry
				// If this errors, it probably doesn't exist. Either way, we fall
				// back to pushing the image, which is safer.
				const remoteManifest = runDockerCmdWithOutput(pathToDocker, [
					"manifest",
					"inspect",
					"-v",
					remoteDigest,
				]);
				logger.debug("remoteManifest", remoteManifest);
				const parsedRemoteManifest = JSON.parse(remoteManifest);
				logger.debug(
					"parsedRemoteManifest.Descriptor.digest",
					parsedRemoteManifest.Descriptor.digest
				);
				logger.debug("imageId", imageId);
				if (parsedRemoteManifest.Descriptor.digest === imageId) {
					logger.log("Image already exists remotely, skipping push");
					logger.debug(
						`Untagging built image: ${args.tag} since there was no change.`
					);
					await runDockerCmd(pathToDocker, ["image", "rm", imageTag]);
					return { image: remoteDigest, pushed: false };
				}
			} catch (error) {
				if (error instanceof Error) {
					logger.debug(
						`Checking for local image ${args.tag} failed with error: ${error.message}`
					);
				}
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

		return { image: imageTag, pushed };
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
		// this means we aren't validating defined limits for a container when building an image
		// we will, however, still validate the image size against account level disk limits
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
