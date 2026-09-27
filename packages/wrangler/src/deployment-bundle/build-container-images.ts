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
	getResolvedDurableObjectContainerApps,
} from "@cloudflare/workers-utils";
import type {
	BuildArgs,
	BuiltContainerImage,
} from "@cloudflare/containers-shared";
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

type DockerfileDurableObjectContainerImage = Extract<
	DurableObjectContainerImage,
	{ dockerfile: string }
>;

function isDockerfileDurableObjectContainerImage(
	image: DurableObjectContainerImage
): image is DockerfileDurableObjectContainerImage {
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

function getImageBuildOptions(
	config: Config,
	image: DockerfileDurableObjectContainerImage
): Pick<BuildArgs, "pathToDockerfile" | "buildContext" | "args"> {
	const baseDir = config.configPath
		? path.dirname(config.configPath)
		: process.cwd();
	const dockerfile = path.resolve(baseDir, image.dockerfile);
	return {
		pathToDockerfile: dockerfile,
		buildContext:
			image.build_context === undefined
				? path.dirname(dockerfile)
				: path.resolve(baseDir, image.build_context),
		args: image.build_vars,
	};
}

function getImageBuildKey(
	build: Pick<BuildArgs, "pathToDockerfile" | "buildContext" | "args">
): string {
	const vars = build.args ?? {};
	// Reuse only equivalent builds; variable declaration order has no effect.
	return JSON.stringify([
		build.pathToDockerfile,
		build.buildContext,
		Object.keys(vars)
			.sort()
			.map((name) => [name, vars[name]]),
	]);
}

type DurableObjectContainerBuildProps =
	| Pick<
			DeployProps,
			"command" | "containers" | "containersRollout" | "dryRun" | "name"
	  >
	| Pick<VersionsUploadProps, "command" | "containers" | "dryRun" | "name">;

/**
 * Build named Dockerfile images locally before deployment or version upload.
 * Equivalent build inputs share a tag while retaining every class/image mapping.
 */
export async function buildDurableObjectContainerImages(
	props: DurableObjectContainerBuildProps,
	config: Config
): Promise<BuiltDurableObjectContainerImage[]> {
	if (
		(props.command === "deploy" && props.containersRollout === "none") ||
		props.name === undefined
	) {
		return [];
	}
	const durableObjectContainerConfig = getResolvedDurableObjectContainerApps(
		props.containers.source,
		config.exports
	);

	const imagesToBuild = durableObjectContainerConfig.flatMap((container) =>
		Object.entries(container.images ?? {})
			.filter(
				(entry): entry is [string, DockerfileDurableObjectContainerImage] =>
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
	const tagsByBuild = new Map<string, string>();
	try {
		for (const { container, imageName, image } of imagesToBuild) {
			const build = getImageBuildOptions(config, image);
			const source = getImageBuildKey(build);
			let localTag = tagsByBuild.get(source);
			if (localTag === undefined) {
				localTag = buildDurableObjectImageTag(
					props.name,
					container.class_name,
					imageName
				);
				await buildAndMaybePush(
					{
						tag: localTag,
						...build,
						platform: "linux/amd64",
					},
					dockerPath,
					false,
					undefined,
					false
				);
				tagsByBuild.set(source, localTag);
			}
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
