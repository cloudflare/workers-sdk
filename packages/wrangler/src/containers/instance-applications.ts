import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { updateStatus } from "@cloudflare/cli-shared-helpers";
import {
	ApplicationsService,
	ContainerImagePreparationsService,
	ContainerImagePreparationStatus,
	resolveImageName,
	SchedulingPolicy,
} from "@cloudflare/containers-shared";
import {
	getContainerInstanceGroupExports,
	getDockerPath,
	isNonInteractiveOrCI,
	UserError,
} from "@cloudflare/workers-utils";
import { buildAndMaybePush } from "../cloudchamber/build";
import {
	fillOpenAPIConfiguration,
	promiseSpinner,
} from "../cloudchamber/common";
import { logger } from "../logger";
import { getOrSelectAccountId } from "../user";
import { createDurableObjectNamespaceResolver } from "./deploy";
import { containersScope } from ".";
import type { CreateDurableObjectApplicationRequest } from "@cloudflare/containers-shared";
import type {
	Config,
	ContainerInstanceGroupExport,
	ContainerInstanceGroupImage,
} from "@cloudflare/workers-utils";

const IMAGE_PREPARATION_POLL_INTERVAL_MS = 2_000;
const IMAGE_PREPARATION_TIMEOUT_MS = 15 * 60_000;

type DeployContainerInstanceApplicationsArgs = {
	versionId: string;
	accountId: string;
	scriptName: string;
};

type PrepareContainerInstanceApplicationsArgs = {
	dryRun: boolean;
	scriptName: string;
};

export type PreparedContainerImages = Record<string, Record<string, string>>;

function isRegistryImage(
	image: ContainerInstanceGroupImage
): image is Extract<ContainerInstanceGroupImage, { image: string }> {
	return typeof image.image === "string";
}

function toCreateApplicationRequest(
	{ className }: ContainerInstanceGroupExport,
	namespaceId: string,
	scriptName: string
): CreateDurableObjectApplicationRequest {
	return {
		name: `${scriptName}_${className}`,
		scheduling_policy: SchedulingPolicy.DURABLE_OBJECT,
		durable_objects: { namespace_id: namespaceId },
	};
}

function buildTag(
	scriptName: string,
	className: string,
	imageName: string
): string {
	const repository = `${scriptName}-${className}-${imageName}`
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return `${repository}:wrangler-${Date.now().toString(36)}`;
}

async function buildOrResolveImage(
	config: Config,
	group: ContainerInstanceGroupExport,
	imageName: string,
	imageConfig: ContainerInstanceGroupImage,
	scriptName: string,
	dryRun: boolean
): Promise<string> {
	if (isRegistryImage(imageConfig)) {
		if (dryRun) {
			return imageConfig.image;
		}
		return resolveImageName(
			await getOrSelectAccountId(config),
			imageConfig.image,
			config
		);
	}

	const baseDir = config.configPath
		? path.dirname(config.configPath)
		: process.cwd();
	const dockerfile = path.resolve(baseDir, imageConfig.dockerfile);
	const tag = buildTag(scriptName, group.className, imageName);
	logger.log("Building image", tag);
	const imageRef = await buildAndMaybePush(
		{
			tag,
			pathToDockerfile: dockerfile,
			buildContext: path.dirname(dockerfile),
			platform: "linux/amd64",
		},
		getDockerPath(),
		!dryRun,
		undefined,
		true,
		config
	);

	return "remoteDigest" in imageRef ? imageRef.remoteDigest : imageRef.newTag;
}

async function waitForImagePreparation(image: string): Promise<void> {
	const deadline = Date.now() + IMAGE_PREPARATION_TIMEOUT_MS;

	while (Date.now() < deadline) {
		const preparation =
			await ContainerImagePreparationsService.prepareContainerImage({ image });
		switch (preparation.status) {
			case ContainerImagePreparationStatus.READY:
				return;
			case ContainerImagePreparationStatus.ERROR:
				throw new UserError(
					preparation.reason ?? "Container image preparation failed",
					{
						telemetryMessage:
							"container instance group image preparation failed",
					}
				);
			case ContainerImagePreparationStatus.PENDING:
				await setTimeout(IMAGE_PREPARATION_POLL_INTERVAL_MS);
				break;
			default:
				throw new UserError(
					`Container image preparation returned an unsupported status: ${String(preparation.status)}`,
					{
						telemetryMessage:
							"container instance group image preparation unsupported status",
					}
				);
		}
	}

	throw new UserError(
		"Timed out while preparing the container image on Cloudflare's network.",
		{
			telemetryMessage: "container instance group image preparation timed out",
		}
	);
}

export async function prepareContainerInstanceApplications(
	config: Config,
	{ dryRun, scriptName }: PrepareContainerInstanceApplicationsArgs
): Promise<PreparedContainerImages> {
	const groups = getContainerInstanceGroupExports(config.exports).filter(
		({ config: group }) => Object.keys(group.images ?? {}).length > 0
	);
	if (groups.length === 0) {
		return {};
	}

	if (!dryRun) {
		await fillOpenAPIConfiguration(config, containersScope);
	}

	const imagesByClass: [string, Record<string, string>][] = [];
	const preparedImages = new Map<string, string>();
	for (const group of groups) {
		const classImages: [string, string][] = [];
		for (const [imageName, imageConfig] of Object.entries(
			group.config.images ?? {}
		)) {
			const source = isRegistryImage(imageConfig)
				? `image:${imageConfig.image}`
				: `dockerfile:${path.resolve(
						config.configPath ? path.dirname(config.configPath) : process.cwd(),
						imageConfig.dockerfile
					)}`;
			let image = preparedImages.get(source);
			if (image === undefined) {
				image = await buildOrResolveImage(
					config,
					group,
					imageName,
					imageConfig,
					scriptName,
					dryRun
				);

				if (!dryRun) {
					const imageLine = `  ${image}`;
					const message = `Preparing ${imageName} for Cloudflare Containers\n${imageLine}`;
					if (isNonInteractiveOrCI()) {
						updateStatus(message);
						await waitForImagePreparation(image);
					} else {
						await promiseSpinner(waitForImagePreparation(image), {
							message,
						});
					}
					updateStatus(`${imageName} is ready to run\n${imageLine}`);
				}
				preparedImages.set(source, image);
			}

			classImages.push([imageName, image]);
		}
		imagesByClass.push([group.className, Object.fromEntries(classImages)]);
	}

	return Object.fromEntries(imagesByClass);
}

export async function deployContainerInstanceApplications(
	config: Config,
	{ versionId, accountId, scriptName }: DeployContainerInstanceApplicationsArgs
): Promise<void> {
	const groups = getContainerInstanceGroupExports(config.exports);
	if (groups.length === 0) {
		return;
	}

	await fillOpenAPIConfiguration(config, containersScope);
	const resolveNamespaceId = createDurableObjectNamespaceResolver(config, {
		versionId,
		accountId,
		scriptName,
	});

	for (const group of groups) {
		const namespaceId = await resolveNamespaceId(group.className);
		await ApplicationsService.createApplication(
			toCreateApplicationRequest(group, namespaceId, scriptName)
		);
	}
}
