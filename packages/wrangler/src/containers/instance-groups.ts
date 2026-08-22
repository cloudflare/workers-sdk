import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { updateStatus } from "@cloudflare/cli-shared-helpers";
import {
	ContainerImagePreparationsService,
	ContainerImagePreparationStatus,
	ContainerInstanceGroupsService,
	resolveImageName,
} from "@cloudflare/containers-shared";
import {
	getContainerInstanceGroupExports,
	getDockerPath,
	isDockerfile,
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
import type { PutContainerInstanceGroupRequestBody } from "@cloudflare/containers-shared";
import type {
	Config,
	ContainerInstanceGroupExport,
	ContainerInstanceGroupImage,
} from "@cloudflare/workers-utils";

const IMAGE_PREPARATION_POLL_INTERVAL_MS = 2_000;
const IMAGE_PREPARATION_TIMEOUT_MS = 15 * 60_000;

type DeployContainerInstanceGroupsArgs = {
	versionId: string;
	accountId: string;
	scriptName: string;
};

type PrepareContainerInstanceGroupsArgs = {
	dryRun: boolean;
	scriptName: string;
};

function toRequestBody({
	className,
}: ContainerInstanceGroupExport): PutContainerInstanceGroupRequestBody {
	return {
		class_name: className,
		name: className,
	};
}

function buildTag(
	scriptName: string,
	className: string,
	imageBinding: string
): string {
	const repository = `${scriptName}-${className}-${imageBinding}`
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return `${repository}:wrangler-${Date.now().toString(36)}`;
}

async function buildOrResolveImage(
	config: Config,
	group: ContainerInstanceGroupExport,
	imageConfig: ContainerInstanceGroupImage,
	scriptName: string,
	dryRun: boolean
): Promise<string> {
	const image = imageConfig.image;

	if (!isDockerfile(image, config.configPath)) {
		if (dryRun) {
			return image;
		}
		return resolveImageName(await getOrSelectAccountId(config), image, config);
	}

	const baseDir = config.configPath
		? path.dirname(config.configPath)
		: process.cwd();
	const dockerfile = path.resolve(baseDir, image);
	const tag = buildTag(scriptName, group.className, imageConfig.binding);
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

export async function prepareContainerInstanceGroups(
	config: Config,
	{ dryRun, scriptName }: PrepareContainerInstanceGroupsArgs
): Promise<Record<string, string>> {
	const groups = getContainerInstanceGroupExports(config.exports).filter(
		({ config: group }) => (group.images?.length ?? 0) > 0
	);
	if (groups.length === 0) {
		return {};
	}

	if (!dryRun) {
		await fillOpenAPIConfiguration(config, containersScope);
	}

	const bindings: Record<string, string> = {};
	const preparedImages = new Map<string, string>();
	for (const group of groups) {
		for (const imageConfig of group.config.images ?? []) {
			let image = preparedImages.get(imageConfig.image);
			if (image === undefined) {
				image = await buildOrResolveImage(
					config,
					group,
					imageConfig,
					scriptName,
					dryRun
				);

				if (!dryRun) {
					const imageLine = `  ${image}`;
					const message = `Preparing ${imageConfig.binding} for Cloudflare Containers\n${imageLine}`;
					if (isNonInteractiveOrCI()) {
						updateStatus(message);
						await waitForImagePreparation(image);
					} else {
						await promiseSpinner(waitForImagePreparation(image), {
							message,
						});
					}
					updateStatus(`${imageConfig.binding} is ready to run\n${imageLine}`);
				}
				preparedImages.set(imageConfig.image, image);
			}

			bindings[imageConfig.binding] = image;
		}
	}

	return bindings;
}

export async function deployContainerInstanceGroups(
	config: Config,
	{ versionId, accountId, scriptName }: DeployContainerInstanceGroupsArgs
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
		await ContainerInstanceGroupsService.putContainerInstanceGroup(
			namespaceId,
			toRequestBody(group)
		);
	}
}
