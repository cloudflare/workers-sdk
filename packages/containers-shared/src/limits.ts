import { UserError } from "@cloudflare/workers-utils/errors";
import { AccountService, InstanceType } from "./client";
import { fetchResult, logger } from "./context";
import { dockerImageInspect } from "./inspect";
import type {
	CompleteAccountCustomer,
	CreateApplicationRequest,
	UserDeploymentConfiguration,
} from "./client";
import type { ContainerNormalizedConfig } from "./types";
import type { ComplianceConfig, ContainerApp } from "@cloudflare/workers-utils";

const MB = 1000 * 1000;
const MiB = 1024 * 1024;

const instanceTypes = {
	// lite is the default instance type when REQUIRE_INSTANCE_TYPE is set
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

const LEGACY_TO_CANONICAL: Record<"dev" | "standard", InstanceType> = {
	dev: InstanceType.LITE,
	standard: InstanceType.STANDARD_1,
};

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

function accountToLimits(account: CompleteAccountCustomer): {
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

export function getInstanceTypeUsage(instanceType: InstanceType): {
	vcpu: number;
	memory_mib: number;
	disk_mb: number;
} {
	return instanceTypes[instanceType];
}

// The API may return a legacy alias (e.g. "standard") for an instance
// type configured as its canonical name ("standard-1"). Normalizing ensures
// deploy diffs don't show a phantom EDIT for instance_type.
export function inferInstanceType(
	config: UserDeploymentConfiguration
): InstanceType | undefined {
	for (const [instanceType, configuration] of Object.entries(instanceTypes)) {
		if (
			config.vcpu === configuration.vcpu &&
			config.memory_mib === configuration.memory_mib &&
			config.disk?.size_mb === configuration.disk_mb
		) {
			const canonical =
				instanceType in LEGACY_TO_CANONICAL
					? LEGACY_TO_CANONICAL[
							instanceType as keyof typeof LEGACY_TO_CANONICAL
						]
					: undefined;
			return (canonical ?? instanceType) as InstanceType;
		}
	}
}

/**
 * Removes any disk, memory, or vCPU set in an object's configuration. Used by
 * Cloudchamber apply to render diffs using the equivalent `instance_type`.
 */
export function cleanForInstanceType(
	app: CreateApplicationRequest
): ContainerApp {
	if (!("configuration" in app)) {
		return app as ContainerApp;
	}

	const instance_type = inferInstanceType(app.configuration);
	if (instance_type !== undefined) {
		app.configuration.instance_type = instance_type;
	}

	delete app.configuration.disk;
	// eslint-disable-next-line @typescript-eslint/no-deprecated -- intentionally cleaning up deprecated `memory` field
	delete app.configuration.memory;
	delete app.configuration.memory_mib;
	delete app.configuration.vcpu;

	return app as ContainerApp;
}

export async function ensureContainerLimits(options: {
	pathToDocker: string;
	imageTag: string;
	account: CompleteAccountCustomer;
	containerConfig?: ContainerNormalizedConfig;
}): Promise<void> {
	const limits = accountToLimits(options.account);
	if (!options.containerConfig) {
		// In this case we are only building an image. There is no container
		// configuration to validate, but the image still needs to fit within the
		// account-level disk limit.
		await ensureImageFitsLimits({
			availableSizeInBytes: limits.disk_mb * MB,
			pathToDocker: options.pathToDocker,
			imageTag: options.imageTag,
		});
		return;
	}

	const usage = configToUsage(options.containerConfig);

	// Test configuration against account limits.
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
	});
}

export async function ensureImageFitsLimits(options: {
	availableSizeInBytes: number;
	pathToDocker: string;
	imageTag: string;
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

	logger.debug(
		`Disk size limits when building container image: availableSize=${Math.ceil(options.availableSizeInBytes / MB)}MB, requiredSize=${Math.ceil(requiredSizeInBytes / MB)}MB`
	);
	if (options.availableSizeInBytes < requiredSizeInBytes) {
		throw new UserError(
			`Image too large: needs ${Math.ceil(requiredSizeInBytes / MB)}MB, but your app is limited to images with size ${options.availableSizeInBytes / MB}MB. You need more disk for this image.`,
			{ telemetryMessage: "cloudchamber limits image too large" }
		);
	}
}

export async function getContainerAccount(
	accountId?: string,
	complianceConfig?: ComplianceConfig
): Promise<CompleteAccountCustomer> {
	if (accountId === undefined) {
		return await AccountService.getMe();
	}

	return await fetchResult<CompleteAccountCustomer>(
		complianceConfig ?? {},
		`/accounts/${accountId}/containers/me`
	);
}
