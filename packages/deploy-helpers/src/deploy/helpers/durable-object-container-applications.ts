import assert from "node:assert";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { updateStatus } from "@cloudflare/cli-shared-helpers";
import {
	ApplicationsService,
	ContainerImagePreparationsService,
	ContainerImagePreparationStatus,
	createDurableObjectNamespaceResolver,
	listDurableObjects,
	pushImageIfChanged,
	resolveImageName,
	SchedulingPolicy,
} from "@cloudflare/containers-shared";
import {
	CONTAINER_IMAGES_BINDING,
	getDockerPath,
	getDurableObjectClassNameToUseSQLiteMap,
	UserError,
	validateDurableObjectContainerApplications,
} from "@cloudflare/workers-utils";
import type {
	BuiltDurableObjectContainerImage,
	ContainerlessConfig,
} from "../../shared/types";
import type { ApiVersion } from "./versions-types";
import type { CreateDurableObjectApplicationRequest } from "@cloudflare/containers-shared";
import type {
	Config,
	DurableObjectContainerApp,
	DurableObjectContainerImage,
} from "@cloudflare/workers-utils";

const IMAGE_PREPARATION_POLL_INTERVAL_MS = 2_000;
const IMAGE_PREPARATION_TIMEOUT_MS = 15 * 60_000;

type DeployDurableObjectContainerApplicationsArgs = {
	dispatchNamespace?: string;
	versionId: string;
	accountId: string;
	scriptName: string;
};

type PrepareDurableObjectContainerApplicationsArgs = {
	accountId: string | undefined;
	dispatchNamespace?: string;
	dryRun: boolean;
	scriptName: string;
};

export type DurableObjectContainerApplication = Pick<
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

export async function createDurableObjectContainerApplication(
	application: DurableObjectContainerApplication,
	namespaceId: string
): Promise<void> {
	await ApplicationsService.createApplication(
		toCreateApplicationRequest(application, namespaceId)
	);
}

function getContainerImageClasses(
	version: ApiVersion
): Set<string> | undefined {
	// The temporary image binding is reserved for Wrangler, including empty maps.
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

/** Resolve every versioned application's namespace without creating applications. */
export async function resolveVersionedDurableObjectContainerApplications(
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

	const namespaces = applications.some(
		(application) => application.namespaceId === undefined
	)
		? await listDurableObjects(config, accountId)
		: [];
	return applications.map((application) => {
		const namespaceId =
			application.namespaceId ??
			namespaces.find(
				(namespace) =>
					namespace.class === application.class_name &&
					namespace.script === scriptName &&
					namespace.preview === undefined &&
					namespace.dispatch_namespace === undefined
			)?.id;
		if (namespaceId === undefined) {
			if (allowMissingNamespaces) {
				return application;
			}
			throw new UserError(
				`Could not deploy Durable Object-managed Container application "${application.name}" because class "${application.class_name}" has no namespace after the Worker Version was deployed.`,
				{
					telemetryMessage:
						"versions deploy durable object container namespace missing",
				}
			);
		}
		return { ...application, namespaceId };
	});
}

/** Create applications only after every deployed namespace has been resolved. */
export async function deployVersionedDurableObjectContainerApplications(
	config: Config,
	args: {
		applications: VersionedDurableObjectContainerApplication[];
		accountId: string;
		scriptName: string;
	}
): Promise<void> {
	if (args.applications.length === 0) {
		return;
	}
	const applications = await resolveVersionedDurableObjectContainerApplications(
		config,
		args
	);
	for (const application of applications) {
		// The strict resolution above checks the whole set before any mutation.
		if (application.namespaceId !== undefined) {
			await createDurableObjectContainerApplication(
				application,
				application.namespaceId
			);
		}
	}
}

async function buildOrResolveImage(
	config: ContainerlessConfig,
	container: DurableObjectContainerApp,
	imageName: string,
	imageConfig: DurableObjectContainerImage,
	builtImages: BuiltDurableObjectContainerImage[],
	dryRun: boolean,
	accountId: string | undefined
): Promise<string> {
	if (isRegistryImage(imageConfig)) {
		if (dryRun) {
			return imageConfig.image;
		}
		assert(accountId, "Expected accountId to resolve container image name");
		return resolveImageName(accountId, imageConfig.image, config);
	}

	const builtImage = builtImages.find(
		(candidate) =>
			candidate.className === container.class_name &&
			candidate.imageName === imageName
	);
	if (builtImage === undefined) {
		throw new Error(
			`Container image "${imageName}" for Durable Object class "${container.class_name}" was not built before upload.`
		);
	}
	if (dryRun) {
		return builtImage.localTag;
	}

	try {
		const imageRef = await pushImageIfChanged({
			pathToDocker: getDockerPath(),
			sourceTag: builtImage.localTag,
			targetTag: builtImage.localTag,
			accountId,
			complianceConfig: config,
			cleanupSourceTag: true,
			displayName: `${container.class_name}/${imageName}`,
		});
		builtImage.localTagCleaned = true;

		return "remoteDigest" in imageRef ? imageRef.remoteDigest : imageRef.newTag;
	} catch (error) {
		if (error instanceof Error) {
			throw new UserError(error.message, {
				cause: error,
				telemetryMessage: "durable object container image push failed",
			});
		}
		throw new UserError("An unknown error occurred", {
			telemetryMessage: "durable object container image push failed",
		});
	}
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
	config: ContainerlessConfig,
	durableObjectContainerConfig: DurableObjectContainerApp[],
	builtImages: BuiltDurableObjectContainerImage[],
	{
		accountId,
		dryRun,
		scriptName,
		dispatchNamespace,
	}: PrepareDurableObjectContainerApplicationsArgs
): Promise<PreparedContainerImages> {
	validateDurableObjectContainerApplications(
		config,
		durableObjectContainerConfig
	);
	if (!dryRun) {
		assert(accountId, "Expected accountId to prepare container applications");
		const storageByClass = getDurableObjectClassNameToUseSQLiteMap(
			config.migrations,
			config.exports
		);
		const unknownStorage = durableObjectContainerConfig.filter(
			(container) => storageByClass.get(container.class_name) === undefined
		);
		if (unknownStorage.length > 0) {
			const namespaces = await listDurableObjects(config, accountId);
			for (const container of unknownStorage) {
				if (
					namespaces.some(
						(namespace) =>
							namespace.class === container.class_name &&
							namespace.script === scriptName &&
							namespace.preview === undefined &&
							namespace.dispatch_namespace === dispatchNamespace &&
							namespace.use_sqlite === false
					)
				) {
					throw new UserError(
						`The container ${container.name} references Durable Object class ${container.class_name}, which uses the legacy KV storage backend. Durable Object-managed Containers require SQLite-backed Durable Objects.`,
						{
							telemetryMessage:
								"durable object container class uses legacy storage",
						}
					);
				}
			}
		}
	}

	const containers = durableObjectContainerConfig.filter(
		(container) => Object.keys(container.images ?? {}).length > 0
	);
	if (containers.length === 0) {
		return {};
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
					builtImages,
					dryRun,
					accountId
				);

				if (!dryRun) {
					const imageLine = `  ${image}`;
					updateStatus(
						`Preparing ${imageName} for Cloudflare Containers\n${imageLine}`
					);
					await waitForImagePreparation(image);
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
	config: ContainerlessConfig,
	durableObjectContainerConfig: DurableObjectContainerApp[],
	{
		versionId,
		accountId,
		scriptName,
		dispatchNamespace,
	}: DeployDurableObjectContainerApplicationsArgs
): Promise<void> {
	const containers = durableObjectContainerConfig;
	if (containers.length === 0) {
		return;
	}

	const resolveNamespaceId = createDurableObjectNamespaceResolver(config, {
		versionId,
		accountId,
		scriptName,
		dispatchNamespace,
	});

	// Resolve the entire set before creating any applications.
	const applications = [];
	for (const container of containers) {
		applications.push({
			container,
			namespaceId: await resolveNamespaceId(container.class_name),
		});
	}
	for (const { container, namespaceId } of applications) {
		await createDurableObjectContainerApplication(container, namespaceId);
	}
}
