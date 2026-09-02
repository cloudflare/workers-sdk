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
	CONTAINER_IMAGES_BINDING,
	getDurableObjectContainerApps,
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
import { validateDurableObjectContainerApplications } from "./config";
import {
	createDurableObjectNamespaceResolver,
	listDurableObjects,
} from "./deploy";
import { containersScope } from ".";
import type { ApiVersion } from "../versions/types";
import type { CreateDurableObjectApplicationRequest } from "@cloudflare/containers-shared";
import type {
	Config,
	DurableObjectContainerApp,
	DurableObjectContainerImage,
} from "@cloudflare/workers-utils";

const IMAGE_PREPARATION_POLL_INTERVAL_MS = 2_000;
const IMAGE_PREPARATION_TIMEOUT_MS = 15 * 60_000;

type DeployDurableObjectContainerApplicationsArgs = {
	versionId: string;
	accountId: string;
	scriptName: string;
};

type PrepareDurableObjectContainerApplicationsArgs = {
	dryRun: boolean;
	scriptName: string;
};

type DurableObjectContainerApplication = Pick<
	DurableObjectContainerApp,
	"class_name" | "name"
>;

export type VersionedDurableObjectContainerApplication =
	DurableObjectContainerApplication & {
		namespaceId?: string;
	};

export type PreparedContainerImages = Record<string, Record<string, string>>;

function isRegistryImage(
	image: DurableObjectContainerImage
): image is Extract<DurableObjectContainerImage, { image: string }> {
	return typeof image.image === "string";
}

function toCreateApplicationRequest(
	{ name }: DurableObjectContainerApplication,
	namespaceId: string
): CreateDurableObjectApplicationRequest {
	return {
		name,
		scheduling_policy: SchedulingPolicy.DURABLE_OBJECT,
		durable_objects: { namespace_id: namespaceId },
	};
}

function getContainerImageClasses(
	version: ApiVersion
): Set<string> | undefined {
	// Container upload metadata does not include scheduling_policy. This
	// versioned generated binding identifies exactly the Durable Object-managed
	// classes, including classes whose image maps are empty.
	const binding = version.resources.bindings.find(
		(candidate) => candidate.name === CONTAINER_IMAGES_BINDING
	);
	if (binding === undefined) {
		return undefined;
	}

	if (
		binding.type !== "json" ||
		typeof binding.json !== "object" ||
		binding.json === null ||
		Array.isArray(binding.json)
	) {
		throw new UserError(
			`Worker Version ${version.id} has invalid ${CONTAINER_IMAGES_BINDING} metadata.`,
			{
				telemetryMessage:
					"versions deploy invalid durable object container image binding",
			}
		);
	}

	return new Set(Object.keys(binding.json));
}

function getNamespaceId(
	version: ApiVersion,
	scriptName: string,
	className: string
): string | undefined {
	const binding = version.resources.bindings.find(
		(candidate) =>
			candidate.type === "durable_object_namespace" &&
			candidate.class_name === className &&
			(candidate.script_name === undefined ||
				candidate.script_name === scriptName)
	);
	return binding?.type === "durable_object_namespace"
		? binding.namespace_id
		: undefined;
}

function getDurableObjectContainerApplicationsFromVersion(
	version: ApiVersion,
	scriptName: string
): VersionedDurableObjectContainerApplication[] {
	const containerClasses = getContainerImageClasses(version);
	if (containerClasses === undefined) {
		return [];
	}

	const containers = version.resources.script_runtime.containers ?? [];
	return [...containerClasses].sort().map((className) => {
		const matchingContainers = containers.filter(
			(container) => container.class_name === className
		);
		const [container] = matchingContainers;
		if (matchingContainers.length !== 1 || container?.name === undefined) {
			throw new UserError(
				`Worker Version ${version.id} has invalid Durable Object-managed Container metadata for class "${className}".`,
				{
					telemetryMessage:
						"versions deploy invalid durable object container metadata",
				}
			);
		}

		return {
			class_name: className,
			name: container.name,
			namespaceId: getNamespaceId(version, scriptName, className),
		};
	});
}

export function getVersionedDurableObjectContainerApplications(
	versions: ApiVersion[],
	scriptName: string
): VersionedDurableObjectContainerApplication[] {
	const applicationsByVersion = versions.map((version) =>
		getDurableObjectContainerApplicationsFromVersion(version, scriptName)
	);
	const [firstApplications = []] = applicationsByVersion;
	const expectedDefinition = JSON.stringify(
		firstApplications.map(({ class_name, name }) => ({ class_name, name }))
	);

	for (let index = 1; index < applicationsByVersion.length; index++) {
		const applications = applicationsByVersion[index] ?? [];
		const definition = JSON.stringify(
			applications.map(({ class_name, name }) => ({ class_name, name }))
		);
		if (definition !== expectedDefinition) {
			throw new UserError(
				"All Worker Versions in a multi-version deployment must declare identical Durable Object-managed Container applications.",
				{
					telemetryMessage:
						"versions deploy inconsistent durable object container applications",
				}
			);
		}
	}

	return firstApplications.map((application, applicationIndex) => {
		const namespaceIds = new Set(
			applicationsByVersion
				.map((applications) => applications[applicationIndex]?.namespaceId)
				.filter((namespaceId): namespaceId is string => Boolean(namespaceId))
		);
		if (namespaceIds.size > 1) {
			throw new UserError(
				"All Worker Versions in a multi-version deployment must reference the same Durable Object namespaces for their Container applications.",
				{
					telemetryMessage:
						"versions deploy inconsistent durable object container namespaces",
				}
			);
		}

		return {
			...application,
			namespaceId: namespaceIds.values().next().value,
		};
	});
}

async function createApplication(
	application: DurableObjectContainerApplication,
	namespaceId: string
): Promise<void> {
	await ApplicationsService.createApplication(
		toCreateApplicationRequest(application, namespaceId)
	);
}

export async function deployVersionedDurableObjectContainerApplications(
	config: Config,
	{
		applications,
		accountId,
		scriptName,
		allowMissingNamespaces = false,
	}: {
		applications: VersionedDurableObjectContainerApplication[];
		accountId: string;
		scriptName: string;
		allowMissingNamespaces?: boolean;
	}
): Promise<VersionedDurableObjectContainerApplication[]> {
	if (applications.length === 0) {
		return [];
	}

	await fillOpenAPIConfiguration(config, containersScope);
	const namespaces = applications.some(
		(application) => application.namespaceId === undefined
	)
		? await listDurableObjects(config, accountId)
		: [];
	const pendingApplications: VersionedDurableObjectContainerApplication[] = [];
	for (const application of applications) {
		const namespaceId =
			application.namespaceId ??
			namespaces.find(
				(namespace) =>
					namespace.class === application.class_name &&
					namespace.script === scriptName
			)?.id;
		if (namespaceId === undefined) {
			if (allowMissingNamespaces) {
				pendingApplications.push(application);
				continue;
			}
			throw new UserError(
				`Could not deploy Durable Object-managed Container application "${application.name}" because class "${application.class_name}" has no namespace after the Worker Version was deployed.`,
				{
					telemetryMessage:
						"versions deploy durable object container namespace missing",
				}
			);
		}
		await createApplication(application, namespaceId);
	}
	return pendingApplications;
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
	container: DurableObjectContainerApp,
	imageName: string,
	imageConfig: DurableObjectContainerImage,
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
	const tag = buildTag(scriptName, container.class_name, imageName);
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
							"durable object container image preparation failed",
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
							"durable object container image preparation unsupported status",
					}
				);
		}
	}

	throw new UserError(
		"Timed out while preparing the container image on Cloudflare's network.",
		{
			telemetryMessage: "durable object container image preparation timed out",
		}
	);
}

export async function prepareDurableObjectContainerApplications(
	config: Config,
	{ dryRun, scriptName }: PrepareDurableObjectContainerApplicationsArgs
): Promise<PreparedContainerImages> {
	validateDurableObjectContainerApplications(config);

	const containers = getDurableObjectContainerApps(config.containers).filter(
		(container) => Object.keys(container.images ?? {}).length > 0
	);
	if (containers.length === 0) {
		return {};
	}

	if (!dryRun) {
		await fillOpenAPIConfiguration(config, containersScope);
	}

	const imagesByClass: [string, Record<string, string>][] = [];
	const preparedImages = new Map<string, string>();
	for (const container of containers) {
		const classImages: [string, string][] = [];
		for (const [imageName, imageConfig] of Object.entries(
			container.images ?? {}
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
					container,
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
		imagesByClass.push([container.class_name, Object.fromEntries(classImages)]);
	}

	return Object.fromEntries(imagesByClass);
}

export async function deployDurableObjectContainerApplications(
	config: Config,
	{
		versionId,
		accountId,
		scriptName,
	}: DeployDurableObjectContainerApplicationsArgs
): Promise<void> {
	const containers = getDurableObjectContainerApps(config.containers);
	if (containers.length === 0) {
		return;
	}

	await fillOpenAPIConfiguration(config, containersScope);
	const resolveNamespaceId = createDurableObjectNamespaceResolver(config, {
		versionId,
		accountId,
		scriptName,
	});

	for (const container of containers) {
		const namespaceId = await resolveNamespaceId(container.class_name);
		await createApplication(container, namespaceId);
	}
}
