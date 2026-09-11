import path from "node:path";
import {
	buildContainerImages,
	buildAndMaybePush,
	cleanupBuiltImages,
	isDockerfileContainerConfig,
	verifyDockerInstalled,
} from "@cloudflare/containers-shared";
import {
	getDockerPath,
	getDurableObjectContainerApps,
} from "@cloudflare/workers-utils";
import type { BuiltContainerImage } from "@cloudflare/containers-shared";
import type {
	BuiltDurableObjectContainerImage,
	DeployProps,
	VersionsUploadProps,
} from "@cloudflare/deploy-helpers";
import type {
	Config,
	DurableObjectContainerImage,
} from "@cloudflare/workers-utils";

export async function buildDeployContainerImages(
	props: Pick<DeployProps, "containers" | "containersRollout" | "dryRun">
): Promise<BuiltContainerImage[]> {
	if (
		props.containersRollout === "none" ||
		props.containers.standard.normalized.length === 0
	) {
		return [];
	}

	const containersWithDockerfile = props.containers.standard.normalized.filter(
		isDockerfileContainerConfig
	);
	if (containersWithDockerfile.length === 0) {
		return [];
	}

	const dockerPath = getDockerPath();
	await verifyDockerInstalled({
		dockerPath,
		operation: `deploying${props.dryRun ? " (even in dry-run mode)" : ""}`,
		imageNoun:
			containersWithDockerfile.length !== 1
				? "the configured images"
				: "the configured image",
		hint: "If you cannot run Docker locally, you can still deploy your Worker by passing --containers-rollout=none. This will not deploy or update your Container.",
	});

	return buildContainerImages(containersWithDockerfile, dockerPath, false);
}

function isDockerfileDurableObjectContainerImage(
	image: DurableObjectContainerImage
): image is Extract<DurableObjectContainerImage, { dockerfile: string }> {
	return typeof image.dockerfile === "string";
}

function buildDurableObjectImageTag(
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

type DurableObjectContainerBuildProps =
	| Pick<
			DeployProps,
			"command" | "containers" | "containersRollout" | "dryRun" | "name"
	  >
	| Pick<VersionsUploadProps, "command" | "containers" | "dryRun" | "name">;

export async function buildDurableObjectContainerImages(
	props: DurableObjectContainerBuildProps,
	config: Config
): Promise<BuiltDurableObjectContainerImage[]> {
	const durableObjectContainerConfig = getDurableObjectContainerApps(
		props.containers.source
	);
	if (
		(props.command === "deploy" && props.containersRollout === "none") ||
		durableObjectContainerConfig.length === 0 ||
		props.name === undefined
	) {
		return [];
	}

	const imagesToBuild = durableObjectContainerConfig.flatMap((container) =>
		Object.entries(container.images ?? {})
			.filter((entry): entry is [string, { dockerfile: string }] =>
				isDockerfileDurableObjectContainerImage(entry[1])
			)
			.map(([imageName, image]) => ({ container, imageName, image }))
	);
	if (imagesToBuild.length === 0) {
		return [];
	}

	const dockerPath = getDockerPath();
	await verifyDockerInstalled({
		dockerPath,
		operation: `${props.command === "deploy" ? "deploying" : "uploading"}${
			props.dryRun ? " (even in dry-run mode)" : ""
		}`,
		imageNoun:
			imagesToBuild.length !== 1
				? "the configured images"
				: "the configured image",
		hint: "If you cannot run Docker locally, use a prebuilt registry image instead of a Dockerfile path for the affected Durable Object-managed Container images.",
	});

	const builtImages: BuiltDurableObjectContainerImage[] = [];
	const baseDir = config.configPath
		? path.dirname(config.configPath)
		: process.cwd();
	try {
		for (const { container, imageName, image } of imagesToBuild) {
			const dockerfile = path.resolve(baseDir, image.dockerfile);
			const localTag = buildDurableObjectImageTag(
				props.name,
				container.class_name,
				imageName
			);
			await buildAndMaybePush(
				{
					tag: localTag,
					pathToDockerfile: dockerfile,
					buildContext: path.dirname(dockerfile),
					platform: "linux/amd64",
				},
				dockerPath,
				false,
				undefined,
				false
			);
			builtImages.push({
				className: container.class_name,
				imageName,
				localTag,
			});
		}
	} catch (error) {
		await cleanupBuiltImages(builtImages, dockerPath);
		throw error;
	}
	return builtImages;
}
