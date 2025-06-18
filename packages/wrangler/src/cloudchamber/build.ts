import { existsSync } from "fs";
import { join } from "path";
import {
	constructBuildCommand,
	dockerBuild,
	dockerImageInspect,
	dockerLoginManagedRegistry,
	getCloudflareRegistryWithAccountNamespace,
	getDockerImageDigest,
	isDir,
	runDockerCmd,
} from "@cloudflare/containers-shared";
import {
	getCIOverrideNetworkModeHost,
	getDockerPath,
} from "../environment-variables/misc-variables";
import { UserError } from "../errors";
import { logger } from "../logger";
import { resolveAppDiskSize } from "./common";
import { loadAccount } from "./locations";
import type { Config } from "../config";
import type { ContainerApp } from "../config/environment";
import type {
	CommonYargsArgvJSON,
	StrictYargsOptionsToInterfaceJSON,
} from "../yargs-types";
import type {
	BuildArgs,
	CompleteAccountCustomer,
} from "@cloudflare/containers-shared";

export function buildYargs(yargs: CommonYargsArgvJSON) {
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
		});
}

export function pushYargs(yargs: CommonYargsArgvJSON) {
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
	containerConfig?: ContainerApp
): Promise<string> {
	try {
		// account is also used to check limits below, so it is better to just pull the entire
		// account information here
		const account = await loadAccount();
		const cloudflareAccountID = account.external_account_id;
		const imageTag = getCloudflareRegistryWithAccountNamespace(
			cloudflareAccountID,
			args.tag
		);
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
		});

		// ensure the account is not allowed to build anything that exceeds the current
		// account's disk size limits
		const inspectOutput = await dockerImageInspect(pathToDocker, {
			imageTag,
			formatString: "{{ .Size }} {{ len .RootFS.Layers }}",
		});

		const [sizeStr, layerStr] = inspectOutput.split(" ");
		const size = parseInt(sizeStr, 10);
		const layers = parseInt(layerStr, 10);

		// 16MiB is the layer size adjustments we use in devmapper
		const MiB = 1024 * 1024;
		const requiredSize = Math.ceil(size * 1.1 + layers * 16 * MiB);
		// TODO: do more config merging and earlier
		await ensureDiskLimits({
			requiredSize,
			account: account,
			containerApp: containerConfig,
		});

		if (push) {
			await dockerLoginManagedRegistry(pathToDocker);
			try {
				const repositoryOnly = imageTag.split(":")[0];
				// if this succeeds it means this image already exists remotely
				// if it fails it means it doesn't exist remotely and should be pushed.
				const localDigest = await getDockerImageDigest(pathToDocker, imageTag);
				const digest = repositoryOnly + "@" + localDigest;
				await runDockerCmd(
					pathToDocker,
					["manifest", "inspect", digest],
					"ignore"
				);

				logger.log("Image already exists remotely, skipping push");
				logger.debug(
					`Untagging built image: ${imageTag} since there was no change.`
				);
				await runDockerCmd(pathToDocker, ["image", "rm", imageTag]);
				return "";
			} catch (error) {
				logger.log(`Image does not exist remotely, pushing: ${imageTag}`);

				await runDockerCmd(pathToDocker, ["push", imageTag]);
			}
		}
		return imageTag;
	} catch (error) {
		if (error instanceof Error) {
			throw new UserError(error.message);
		}
		throw new UserError("An unknown error occurred");
	}
}

export async function buildCommand(
	args: StrictYargsOptionsToInterfaceJSON<typeof buildYargs>,
	config: Config
) {
	// TODO: merge args with Wrangler config if available
	if (existsSync(args.PATH) && !isDir(args.PATH)) {
		throw new UserError(
			`${args.PATH} is not a directory. Please specify a valid directory path.`
		);
	}
	// if containers are not defined, the build should still work.
	const containers = config.containers ?? [undefined];
	const pathToDockerfile = join(args.PATH, "Dockerfile");
	for (const container of containers) {
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
			container
		);
	}
}

export async function pushCommand(
	args: StrictYargsOptionsToInterfaceJSON<typeof pushYargs>,
	_: Config
) {
	try {
		await dockerLoginManagedRegistry(args.pathToDocker);
		const account = await loadAccount();
		const newTag = getCloudflareRegistryWithAccountNamespace(
			account.external_account_id,
			args.TAG
		);
		const dockerPath = args.pathToDocker ?? getDockerPath();
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

export async function ensureDiskLimits(options: {
	requiredSize: number;
	account: CompleteAccountCustomer;
	containerApp: ContainerApp | undefined;
}): Promise<void> {
	const MB = 1000 * 1000;
	const MiB = 1024 * 1024;
	const appDiskSize = resolveAppDiskSize(options.account, options.containerApp);
	const accountDiskSize =
		(options.account.limits.disk_mb_per_deployment ?? 2000) * MB;
	// if appDiskSize is defined and configured to be more than the accountDiskSize, error
	if (appDiskSize && appDiskSize > accountDiskSize) {
		throw new UserError(
			`Exceeded account limits: Your container is configured to use a disk size of ${appDiskSize / MB} MB. However, that exceeds the account limit of ${accountDiskSize / MB}`
		);
	}
	const maxAllowedImageSizeBytes = appDiskSize ?? accountDiskSize;

	logger.debug(
		`Disk size limits when building the container: appDiskSize:${appDiskSize}, accountDiskSize:${accountDiskSize}, maxAllowedImageSizeBytes=${maxAllowedImageSizeBytes}(${maxAllowedImageSizeBytes / MB} MB), requiredSized=${options.requiredSize}(${Math.ceil(options.requiredSize / MiB)}MiB)`
	);
	if (maxAllowedImageSizeBytes < options.requiredSize) {
		throw new UserError(
			`Image too large: needs ${Math.ceil(options.requiredSize / MB)} MB, but your app is limited to images with size ${maxAllowedImageSizeBytes / MB} MB. Your account needs more disk size per instance to run this container. The default disk size is 2GB.`
		);
	}
}
