import {
	COMPLIANCE_REGION_CONFIG_UNKNOWN,
	getCIOverrideNetworkModeHost,
} from "@cloudflare/workers-utils";
import { UserError } from "@cloudflare/workers-utils/errors";
import { constructBuildCommand, dockerBuild } from "./build";
import { fetchResult, getAccountDetailsResource } from "./context";
import { resolveImageName } from "./images";
import { dockerImageInspect } from "./inspect";
import { getCloudflareContainerRegistry } from "./knobs";
import { dockerLoginImageRegistry } from "./login";
import { runDockerCmd, runDockerCmdWithOutput } from "./utils";
import type {
	BuildArgs,
	ContainerAccountDetails,
	ContainerNormalizedConfig,
	ImageRef,
	ImageURIConfig,
	InstanceType,
	WranglerLogger,
} from "./types";
import type { ComplianceConfig } from "@cloudflare/workers-utils";

const MB = 1000 * 1000;
const MiB = 1024 * 1024;

// Based on the Docker reference grammar used by containers/image. These only
// strip suffixes from refs that have already been normalized by resolveImageName().
const DIGEST_SUFFIX_REGEXP =
	/@[A-Za-z][A-Za-z0-9]*(?:[-_+.][A-Za-z][A-Za-z0-9]*)*:[a-fA-F0-9]{32,}$/;
const DIGEST_VALUE_REGEXP =
	/^[A-Za-z][A-Za-z0-9]*(?:[-_+.][A-Za-z][A-Za-z0-9]*)*:[a-fA-F0-9]{32,}$/;
const TAG_SUFFIX_REGEXP = /:[\w][\w.-]{0,127}$/;

let cachedAccount:
	| { resource: string; account: ContainerAccountDetails }
	| undefined;

export function clearCachedContainerAccountDetails(): void {
	cachedAccount = undefined;
}

export async function loadContainerAccountDetails(
	complianceConfig: ComplianceConfig
): Promise<ContainerAccountDetails> {
	const resource = getAccountDetailsResource();
	if (cachedAccount?.resource === resource) {
		return cachedAccount.account;
	}

	const account = await fetchResult<ContainerAccountDetails>(
		complianceConfig,
		resource
	);
	cachedAccount = { resource, account };
	return account;
}

function getInstanceTypeUsage(instanceType: InstanceType): {
	vcpu: number;
	memory_mib: number;
	disk_mb: number;
} {
	const instanceTypes = {
		lite: {
			vcpu: 0.0625,
			memory_mib: 256,
			disk_mb: 2000,
		},
		dev: {
			vcpu: 0.0625,
			memory_mib: 256,
			disk_mb: 2000,
		},
		basic: {
			vcpu: 0.25,
			memory_mib: 1024,
			disk_mb: 4000,
		},
		standard: {
			vcpu: 0.5,
			memory_mib: 4096,
			disk_mb: 8000,
		},
		"standard-1": {
			vcpu: 0.5,
			memory_mib: 4096,
			disk_mb: 8000,
		},
		"standard-2": {
			vcpu: 1,
			memory_mib: 6144,
			disk_mb: 12000,
		},
		"standard-3": {
			vcpu: 2,
			memory_mib: 8192,
			disk_mb: 16000,
		},
		"standard-4": {
			vcpu: 4,
			memory_mib: 12_288,
			disk_mb: 20000,
		},
	} as const;

	return instanceTypes[instanceType];
}

function configToUsage(containerConfig: ContainerNormalizedConfig): {
	vcpu: number;
	memory_mib: number;
	disk_mb: number;
} {
	if ("instance_type" in containerConfig) {
		return getInstanceTypeUsage(containerConfig.instance_type);
	}

	return {
		vcpu: containerConfig.vcpu,
		memory_mib: containerConfig.memory_mib,
		disk_mb: containerConfig.disk_bytes / MB,
	};
}

function accountToLimits(account: ContainerAccountDetails): {
	vcpu: number;
	memory_mib: number;
	disk_mb: number;
} {
	return {
		vcpu: account.limits.vcpu_per_deployment,
		memory_mib: account.limits.memory_mib_per_deployment,
		disk_mb: account.limits.disk_mb_per_deployment,
	};
}

export async function ensureContainerLimits(options: {
	pathToDocker: string;
	imageTag: string;
	account: ContainerAccountDetails;
	containerConfig?: ContainerNormalizedConfig;
	logger?: WranglerLogger;
}): Promise<void> {
	const limits = accountToLimits(options.account);
	if (!options.containerConfig) {
		await ensureImageFitsLimits({
			availableSizeInBytes: limits.disk_mb * MB,
			pathToDocker: options.pathToDocker,
			imageTag: options.imageTag,
			logger: options.logger,
		});
		return;
	}

	const usage = configToUsage(options.containerConfig);

	const errors = [];
	if (usage.vcpu > limits.vcpu) {
		errors.push(
			`Your container configuration uses ${usage.vcpu} vCPU which exceeds the account limit of ${limits.vcpu} vCPU.`
		);
	}
	if (usage.memory_mib > limits.memory_mib) {
		errors.push(
			`Your container configuration uses ${usage.memory_mib} MiB of memory which exceeds the account limit of ${limits.memory_mib} MiB.`
		);
	}
	if (usage.disk_mb > limits.disk_mb) {
		errors.push(
			`Your container configuration uses ${usage.disk_mb} MB of disk which exceeds the account limit of ${limits.disk_mb} MB.`
		);
	}
	if (errors.length > 0) {
		throw new UserError(`Exceeded account limits: ${errors.join(" ")}`, {
			telemetryMessage: "cloudchamber limits account limit exceeded",
		});
	}

	await ensureImageFitsLimits({
		availableSizeInBytes: usage.disk_mb * MB,
		pathToDocker: options.pathToDocker,
		imageTag: options.imageTag,
		logger: options.logger,
	});
}

export async function ensureImageFitsLimits(options: {
	availableSizeInBytes: number;
	pathToDocker: string;
	imageTag: string;
	logger?: WranglerLogger;
}): Promise<void> {
	const inspectOutput = await dockerImageInspect(options.pathToDocker, {
		imageTag: options.imageTag,
		formatString: "{{ .Size }} {{ len .RootFS.Layers }}",
	});
	const [sizeStr, layerStr] = inspectOutput.split(" ");
	if (sizeStr === undefined || layerStr === undefined) {
		throw new Error(
			`Expected docker image inspect output to include image size and layer count, got ${inspectOutput}`
		);
	}
	const size = parseInt(sizeStr, 10);
	const layers = parseInt(layerStr, 10);

	const requiredSizeInBytes = Math.ceil(size * 1.1 + layers * 16 * MiB);

	options.logger?.debug(
		`Disk size limits when building container image: availableSize=${Math.ceil(options.availableSizeInBytes / MB)}MB, requiredSize=${Math.ceil(requiredSizeInBytes / MB)}MB`
	);
	if (options.availableSizeInBytes < requiredSizeInBytes) {
		throw new UserError(
			`Image too large: needs ${Math.ceil(requiredSizeInBytes / MB)}MB, but your app is limited to images with size ${options.availableSizeInBytes / MB}MB. You need more disk for this image.`,
			{ telemetryMessage: "cloudchamber limits image too large" }
		);
	}
}

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
	logger?: WranglerLogger,
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
	logger?.debug("respositoryOnly:", repositoryOnly);

	const digest = parsedDigests.find((d): d is string => {
		if (typeof d !== "string" || !d.includes("@")) {
			return false;
		}
		const resolved = resolveImageName(externalAccountId, d, complianceConfig);
		logger?.debug(`Comparing ${resolved.split("@")[0]} to ${repositoryOnly}`);
		return typeof d === "string" && resolved.split("@")[0] === repositoryOnly;
	});
	if (!digest) {
		throw new Error(
			`Could not find a digest for the image ${repositoryOnly}. Found digests: ${parsedDigests.join(", ")}`
		);
	}

	const [, hash] = digest.split("@");
	if (hash === undefined) {
		throw new Error(`Expected RepoDigest to include a digest, got ${digest}`);
	}
	return imageRefWithDigest(
		externalAccountId,
		imageTag,
		hash,
		complianceConfig
	);
}

export async function buildContainerImage(options: {
	args: BuildArgs;
	pathToDocker: string;
	verifyDockerIsRunning?: boolean;
	logger?: WranglerLogger;
}): Promise<{ newTag: string }> {
	const { buildCmd, dockerfile } = await constructBuildCommand(
		{
			...options.args,
			setNetworkToHost:
				options.args.setNetworkToHost ??
				Boolean(getCIOverrideNetworkModeHost()),
		},
		options.logger
	);

	const build = await dockerBuild(options.pathToDocker, {
		buildCmd,
		dockerfile,
		verifyDockerIsRunning: options.verifyDockerIsRunning,
	});
	await build.ready;

	return { newTag: options.args.tag };
}

export async function pushContainerImage(options: {
	imageTag: string;
	pathToDocker: string;
	containerConfig?: Exclude<ContainerNormalizedConfig, ImageURIConfig>;
	skipIfRemoteExists?: boolean;
	complianceConfig?: ComplianceConfig;
	logger?: WranglerLogger;
}): Promise<ImageRef> {
	const complianceConfig =
		options.complianceConfig ?? COMPLIANCE_REGION_CONFIG_UNKNOWN;
	const account = await loadContainerAccountDetails(complianceConfig);
	const { external_account_id } = account;

	await ensureContainerLimits({
		pathToDocker: options.pathToDocker,
		imageTag: options.imageTag,
		account,
		containerConfig: options.containerConfig,
		logger: options.logger,
	});

	await dockerLoginImageRegistry(
		options.pathToDocker,
		getCloudflareContainerRegistry(options.complianceConfig),
		complianceConfig
	);

	if (options.skipIfRemoteExists) {
		const imageInfo = await dockerImageInspect(options.pathToDocker, {
			imageTag: options.imageTag,
			formatString: "{{ json .RepoDigests }}",
		});
		options.logger?.debug(
			`'docker image inspect ${options.imageTag}':`,
			imageInfo
		);

		try {
			const remoteDigest = findRemoteDigest(
				imageInfo,
				external_account_id,
				options.imageTag,
				options.logger,
				options.complianceConfig
			);
			const [, hash] = remoteDigest.split("@");

			options.logger?.debug(
				`'docker manifest inspect -v ${resolveImageName(external_account_id, remoteDigest, options.complianceConfig)}:`
			);
			const remoteManifest = runDockerCmdWithOutput(options.pathToDocker, [
				"manifest",
				"inspect",
				"-v",
				resolveImageName(
					external_account_id,
					remoteDigest,
					options.complianceConfig
				),
			]);
			const parsedRemoteManifest = JSON.parse(remoteManifest);

			if (parsedRemoteManifest.Descriptor.digest === hash) {
				options.logger?.log("Image already exists remotely, skipping push");
				options.logger?.debug(
					`Untagging built image: ${options.imageTag} since there was no change.`
				);

				await runDockerCmd(options.pathToDocker, [
					"image",
					"rm",
					options.imageTag,
				]);

				return { remoteDigest };
			}
		} catch (error) {
			if (error instanceof Error) {
				options.logger?.debug(
					`Checking for local image ${options.imageTag} failed with error: ${error.message}`
				);
			}
		}
	}

	const namespacedImageTag = resolveImageName(
		external_account_id,
		options.imageTag,
		options.complianceConfig
	);
	options.logger?.log(
		`Image does not exist remotely, pushing: ${namespacedImageTag}`
	);
	await runDockerCmd(options.pathToDocker, [
		"tag",
		options.imageTag,
		namespacedImageTag,
	]);
	await runDockerCmd(options.pathToDocker, ["push", namespacedImageTag]);

	let remoteDigest: string;
	try {
		const pushedImageInfo = await dockerImageInspect(options.pathToDocker, {
			imageTag: namespacedImageTag,
			formatString: "{{ json .RepoDigests }}",
		});
		remoteDigest = findRemoteDigest(
			pushedImageInfo,
			external_account_id,
			namespacedImageTag,
			options.logger,
			options.complianceConfig
		);
	} catch (error) {
		if (error instanceof Error) {
			options.logger?.debug(
				`Inspecting pushed image ${namespacedImageTag} failed with error: ${error.message}`
			);
		}
		const remoteManifest = runDockerCmdWithOutput(options.pathToDocker, [
			"manifest",
			"inspect",
			"-v",
			namespacedImageTag,
		]);
		remoteDigest = imageRefWithDigest(
			external_account_id,
			namespacedImageTag,
			findManifestDigest(remoteManifest),
			options.complianceConfig
		);
	}

	return { remoteDigest };
}

export async function buildAndMaybePushContainerImage(options: {
	args: BuildArgs;
	pathToDocker: string;
	push: boolean;
	containerConfig?: Exclude<ContainerNormalizedConfig, ImageURIConfig>;
	verifyDockerIsRunning?: boolean;
	complianceConfig?: ComplianceConfig;
	logger?: WranglerLogger;
}): Promise<ImageRef> {
	const imageRef = await buildContainerImage({
		args: options.args,
		pathToDocker: options.pathToDocker,
		verifyDockerIsRunning: options.verifyDockerIsRunning,
		logger: options.logger,
	});

	if (!options.push) {
		return imageRef;
	}

	return pushContainerImage({
		imageTag: imageRef.newTag,
		pathToDocker: options.pathToDocker,
		containerConfig: options.containerConfig,
		skipIfRemoteExists: true,
		complianceConfig: options.complianceConfig,
		logger: options.logger,
	});
}

export async function checkImagePlatform(
	pathToDocker: string,
	imageTag: string,
	expectedPlatform: string = "linux/amd64"
): Promise<void> {
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
