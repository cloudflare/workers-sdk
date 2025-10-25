import { dockerImageInspect } from "@cloudflare/containers-shared";
import { UserError } from "@cloudflare/workers-utils";
import { logger } from "../logger";
import { getInstanceTypeUsage } from "./instance-type/instance-type";
import type {
	CompleteAccountCustomer,
	ContainerNormalizedConfig,
} from "@cloudflare/containers-shared";

const MB = 1000 * 1000;
const MiB = 1024 * 1024;

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

export async function ensureContainerLimits(options: {
	pathToDocker: string;
	imageTag: string;
	account: CompleteAccountCustomer;
	containerConfig?: ContainerNormalizedConfig;
}): Promise<void> {
	const limits = accountToLimits(options.account);
	if (!options.containerConfig) {
		// in this case we are only building an image-- we still want to check that the image fits
		// within the account limits on disk size
		await ensureImageFitsLimits({
			availableSizeInBytes: limits.disk_mb * MB,
			pathToDocker: options.pathToDocker,
			imageTag: options.imageTag,
		});
		return;
	}

	const usage = configToUsage(options.containerConfig);

	// test configuration against account limits
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
		throw new UserError(`Exceeded account limits: ${errors.join(" ")}`);
	}

	// check whether an image fits within the configured limits for a container
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
	// inspect the image to determine the disk size needed to support it
	const inspectOutput = await dockerImageInspect(options.pathToDocker, {
		imageTag: options.imageTag,
		formatString: "{{ .Size }} {{ len .RootFS.Layers }}",
	});
	const [sizeStr, layerStr] = inspectOutput.split(" ");
	const size = parseInt(sizeStr, 10);
	const layers = parseInt(layerStr, 10);

	// 16MiB is the layer size adjustments we use in devmapper
	const requiredSizeInBytes = Math.ceil(size * 1.1 + layers * 16 * MiB);

	logger.debug(
		`Disk size limits when building container image: availableSize=${Math.ceil(options.availableSizeInBytes / MB)}MB, requiredSize=${Math.ceil(requiredSizeInBytes / MB)}MB`
	);
	if (options.availableSizeInBytes < requiredSizeInBytes) {
		throw new UserError(
			`Image too large: needs ${Math.ceil(requiredSizeInBytes / MB)}MB, but your app is limited to images with size ${options.availableSizeInBytes / MB}MB. Your need more disk for this image.`
		);
	}
}
