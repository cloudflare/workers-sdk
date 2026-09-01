import assert from "node:assert";
import { setTimeout } from "node:timers/promises";
import {
	endSection,
	log,
	newline,
	shapes,
	startSection,
	success,
	updateStatus,
} from "@cloudflare/cli-shared-helpers";
import {
	bold,
	brandColor,
	dim,
	green,
} from "@cloudflare/cli-shared-helpers/colors";
import {
	buildContainerImage,
	initContainersSharedContext,
	pushContainerImage,
	resolveImageName,
} from "@cloudflare/containers-shared";
import {
	APIError,
	FatalError,
	formatConfigSnippet,
	getDockerPath,
	UserError,
} from "@cloudflare/workers-utils";
import { fetchResult, logger } from "../../shared/context";
import { Diff } from "./line-diff";
import { fetchVersion } from "./versions-api";
import type { DockerfileContainerConfig } from "../../shared/types";
import type { ApiVersion } from "./versions-types";
import type {
	ContainerNormalizedConfig,
	ImageRef,
	InstanceType,
} from "@cloudflare/containers-shared";
import type {
	ComplianceConfig,
	Config,
	ContainerApp,
	WorkerMetadataBinding,
} from "@cloudflare/workers-utils";

type DeployContainersArgs = {
	versionId: string;
	accountId: string;
	scriptName: string;
};

type ApplicationID = string;
type ApplicationName = string;

type ObservabilityConfiguration = {
	logs?: {
		enabled?: boolean;
	};
};

type UserDeploymentConfiguration = {
	image: string;
	wrangler_ssh?: unknown;
	authorized_keys?: unknown;
	trusted_user_ca_keys?: unknown;
	ssh_public_key_ids?: unknown;
	secrets?: unknown;
	instance_type?: InstanceType;
	vcpu?: number;
	/**
	 * @deprecated intentionally retained for API compatibility.
	 */
	memory?: unknown;
	memory_mib?: number;
	disk?: { size_mb?: number };
	environment_variables?: unknown;
	labels?: unknown;
	network?: unknown;
	command?: unknown;
	entrypoint?: unknown;
	dns?: unknown;
	ports?: unknown;
	checks?: unknown;
	provisioner?: unknown;
	observability?: ObservabilityConfiguration;
	experimental_flags?: unknown;
};

type ModifyUserDeploymentConfiguration = Partial<UserDeploymentConfiguration>;

type ApplicationConstraints = ContainerNormalizedConfig["constraints"] & {
	region?: string;
	tier?: number;
	pops?: string[];
};

type CreateApplicationRequest = {
	name: string;
	scheduling_policy: ContainerNormalizedConfig["scheduling_policy"];
	instances: number;
	max_instances?: number;
	constraints?: ApplicationConstraints;
	configuration: UserDeploymentConfiguration;
	durable_objects?: { namespace_id: string };
	affinities?: ContainerNormalizedConfig["affinities"];
	rollout_active_grace_period?: number;
};

type ModifyApplicationRequestBody = {
	scheduling_policy?: ContainerNormalizedConfig["scheduling_policy"];
	max_instances?: number;
	constraints?: ApplicationConstraints;
	configuration?: ModifyUserDeploymentConfiguration;
	durable_objects?: { namespace_id: string };
	affinities?: ContainerNormalizedConfig["affinities"];
	rollout_active_grace_period?: number;
};

type Application = CreateApplicationRequest & {
	id: ApplicationID;
	configuration: UserDeploymentConfiguration;
	durable_objects?: { namespace_id?: string };
};

type RolloutStepRequest = {
	step_size: { percentage: number };
	description: string;
};

type CreateApplicationRolloutRequest = {
	target_configuration: ModifyUserDeploymentConfiguration;
	strategy: "rolling";
	step_percentage?: number;
	steps?: RolloutStepRequest[];
	description: string;
	kind?: "full_auto" | "full_manual";
};

export async function buildContainerForDeploy(
	containerConfig: DockerfileContainerConfig,
	imageTag: string,
	dryRun: boolean,
	pathToDocker: string,
	verifyDockerIsRunning?: boolean,
	complianceConfig?: Config
): Promise<ImageRef> {
	const imageFullName = containerConfig.name + ":" + imageTag.split("-")[0];
	logger.log("Building image", imageFullName);

	const imageRef = await buildContainerImage({
		args: {
			tag: imageFullName,
			pathToDockerfile: containerConfig.dockerfile,
			buildContext: containerConfig.image_build_context,
			args: containerConfig.image_vars,
		},
		pathToDocker,
		verifyDockerIsRunning,
		logger: getContainersLogger(),
	});

	if (dryRun) {
		return imageRef;
	}

	if (complianceConfig === undefined) {
		throw new Error("Container image push requires Wrangler config");
	}

	return await pushContainerImage({
		imageTag: imageRef.newTag,
		pathToDocker,
		containerConfig,
		skipIfRemoteExists: true,
		complianceConfig,
		logger: getContainersLogger(),
	});
}

export async function deployContainers(
	config: Config,
	normalisedContainerConfig: ContainerNormalizedConfig[],
	{ versionId, accountId, scriptName }: DeployContainersArgs
) {
	initContainersSharedContext({
		accountId,
		apiFamily: "containers",
		fetchResult,
	});

	const pathToDocker = getDockerPath();
	const boundDOs = new Set(
		config.durable_objects.bindings.map((b) => b.class_name)
	);

	let imageRef: ImageRef;
	let maybeVersionInfo: ApiVersion | undefined;
	let maybeAllDurableObjects: DurableObjectNamespace[] | undefined;

	for (const container of normalisedContainerConfig) {
		if ("dockerfile" in container) {
			imageRef = await buildContainerForDeploy(
				container,
				versionId,
				false,
				pathToDocker,
				false,
				config
			);
		} else {
			imageRef = { newTag: container.image_uri };
		}

		if (boundDOs.has(container.class_name)) {
			maybeVersionInfo ??= await fetchUploadedVersion(
				config,
				accountId,
				scriptName,
				versionId
			);
			type DurableObjectBinding = Extract<
				WorkerMetadataBinding,
				{ type: "durable_object_namespace" }
			>;
			const targetDurableObject = maybeVersionInfo.resources.bindings.find(
				(binding): binding is DurableObjectBinding =>
					binding.type === "durable_object_namespace" &&
					binding.class_name === container.class_name &&
					(binding.script_name === undefined ||
						binding.script_name === scriptName) &&
					binding.namespace_id !== undefined
			);
			if (!targetDurableObject) {
				throw new UserError(
					"Could not deploy container application as durable object was not found in list of bindings",
					{
						telemetryMessage:
							"containers deploy durable object binding missing",
					}
				);
			}
			assert(
				targetDurableObject && targetDurableObject.namespace_id !== undefined
			);

			await apply(
				{
					imageRef,
					durable_object_namespace_id: targetDurableObject.namespace_id,
				},
				container,
				config,
				accountId
			);
		} else {
			maybeAllDurableObjects ??= await listDurableObjects(config, accountId);
			const targetDurableObject = maybeAllDurableObjects.find(
				(durableObject) =>
					durableObject.class === container.class_name &&
					durableObject.script === scriptName
			);

			assert(targetDurableObject, "Durable Object not returned from list API");
			await apply(
				{
					imageRef,
					durable_object_namespace_id: targetDurableObject.id,
				},
				container,
				config,
				accountId
			);
		}
	}
}

async function fetchUploadedVersion(
	config: Config,
	accountId: string,
	scriptName: string,
	versionId: string
): Promise<ApiVersion> {
	for (let attempt = 0; attempt < 5; attempt++) {
		try {
			return await fetchVersion(config, accountId, scriptName, versionId, undefined);
		} catch (error) {
			if (
				!(error instanceof APIError) ||
				error.code !== 100146 ||
				attempt === 4
			) {
				throw error;
			}
			await setTimeout(500);
		}
	}
	throw new Error("Unable to fetch uploaded Worker version");
}

export type DurableObjectNamespace = {
	id: string;
	class: string;
	name: string;
	script: string;
	useSqlite: boolean;
	preview?: { id: string; slug: string; name: string };
};

export async function listDurableObjects(
	complianceConfig: ComplianceConfig,
	accountId: string
): Promise<DurableObjectNamespace[]> {
	return await fetchResult<DurableObjectNamespace[]>(
		complianceConfig,
		`/accounts/${accountId}/workers/durable_objects/namespaces`,
		{},
		new URLSearchParams({ per_page: "1000" })
	);
}

function mergeDeep<T>(target: T, source: Partial<T>): T {
	if (typeof target !== "object" || target === null) {
		return source as T;
	}

	if (typeof source !== "object" || source === null) {
		return target;
	}

	const result: T = { ...target };

	for (const key of Object.keys(source)) {
		const srcVal = source[key as keyof T];
		const tgtVal = target[key as keyof T];

		if (isObject(tgtVal) && isObject(srcVal)) {
			result[key as keyof T] = mergeDeep(tgtVal, srcVal as Partial<T[keyof T]>);
		} else {
			result[key as keyof T] = srcVal as T[keyof T];
		}
	}

	return result;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createApplicationToModifyApplication(
	req: CreateApplicationRequest
): ModifyApplicationRequestBody {
	return {
		configuration: req.configuration,
		max_instances: req.max_instances,
		constraints: req.constraints,
		affinities: req.affinities,
		scheduling_policy: req.scheduling_policy,
		rollout_active_grace_period: req.rollout_active_grace_period,
	};
}

function observabilityToConfiguration(
	observabilityFromConfig: boolean,
	existingObservabilityConfig: ObservabilityConfiguration | undefined
): ObservabilityConfiguration | undefined {
	const logsAlreadyEnabled = existingObservabilityConfig?.logs?.enabled;

	if (observabilityFromConfig) {
		return { logs: { enabled: true } };
	} else if (logsAlreadyEnabled === undefined) {
		return undefined;
	} else {
		return { logs: { enabled: false } };
	}
}

function containerConfigToCreateRequest(
	accountId: string,
	containerApp: ContainerNormalizedConfig,
	imageRef: string,
	durableObjectNamespaceId: string,
	complianceConfig: ComplianceConfig,
	prevApp?: Application
): CreateApplicationRequest {
	return {
		name: containerApp.name,
		scheduling_policy: containerApp.scheduling_policy,
		configuration: {
			image: resolveImageName(accountId, imageRef, complianceConfig),
			...("instance_type" in containerApp
				? { instance_type: containerApp.instance_type }
				: {
						disk: { size_mb: containerApp.disk_bytes / (1000 * 1000) },
						memory_mib: containerApp.memory_mib,
						vcpu: containerApp.vcpu,
					}),
			observability: observabilityToConfiguration(
				containerApp.observability.logs_enabled,
				prevApp?.configuration.observability
			),
			wrangler_ssh: containerApp.wrangler_ssh,
			authorized_keys: containerApp.authorized_keys,
			trusted_user_ca_keys: containerApp.trusted_user_ca_keys,
		},
		instances: 0,
		max_instances: containerApp.max_instances,
		constraints: containerApp.constraints,
		affinities: containerApp.affinities,
		durable_objects: {
			namespace_id: durableObjectNamespaceId,
		},
		rollout_active_grace_period: containerApp.rollout_active_grace_period,
	};
}

function formatContainerSnippetForDisplay<
	T extends {
		configuration?: ModifyApplicationRequestBody["configuration"];
	},
>(container: T, configPath: Config["configPath"]) {
	const configurationForDisplay =
		container.configuration === undefined
			? undefined
			: Object.fromEntries(
					Object.entries(container.configuration).map(([key, value]) => [
						key === "wrangler_ssh" ? "ssh" : key,
						value,
					])
				);

	return formatConfigSnippet(
		{
			containers: [
				{
					...container,
					configuration: configurationForDisplay,
				} as unknown as ContainerApp,
			],
		},
		configPath
	);
}

async function apply(
	args: {
		imageRef: ImageRef;
		durable_object_namespace_id: string;
	},
	containerConfig: ContainerNormalizedConfig,
	config: Config,
	accountId: string
) {
	if (!config.containers || config.containers.length === 0) {
		return;
	}
	startSection(
		"Deploy a container application",
		"deploy changes to your application"
	);

	const existingApplications = await fetchResult<Application[]>(
		config,
		`/accounts/${accountId}/containers/applications`
	);
	const prevApp = existingApplications.find(
		(app) => app.name === containerConfig.name
	);

	const imageRef =
		"remoteDigest" in args.imageRef
			? args.imageRef.remoteDigest
			: args.imageRef.newTag;
	log(dim("Container application changes\n"));

	const appConfig = mergeIfUnsafe(
		config,
		containerConfigToCreateRequest(
			accountId,
			containerConfig,
			imageRef,
			args.durable_object_namespace_id,
			config,
			prevApp
		),
		containerConfig.name
	);

	if (prevApp !== undefined && prevApp !== null) {
		if (!prevApp.durable_objects?.namespace_id) {
			throw new FatalError(
				"The previous deploy of this container application was not associated with a durable object",
				{
					telemetryMessage: "containers deploy previous durable object missing",
				}
			);
		}
		if (
			prevApp.durable_objects.namespace_id !== args.durable_object_namespace_id
		) {
			throw new UserError(
				`There is already an application with the name ${containerConfig.name} deployed that is associated with a different durable object namespace (${prevApp.durable_objects.namespace_id}). Either change the container name or delete the existing application first.`,
				{
					telemetryMessage:
						"trying to redeploy container to different durable object",
				}
			);
		}

		const normalisedPrevApp = sortObjectRecursive<ModifyApplicationRequestBody>(
			stripUndefined(
				cleanApplicationFromAPI(prevApp, containerConfig, accountId, config)
			)
		);

		const modifyReq = mergeIfUnsafe(
			config,
			createApplicationToModifyApplication(appConfig),
			appConfig.name
		);
		const nowContainer = stripUndefined(
			mergeDeep(
				normalisedPrevApp,
				sortObjectRecursive<ModifyApplicationRequestBody>(modifyReq)
			)
		);

		const prev = formatContainerSnippetForDisplay(
			normalisedPrevApp,
			config.configPath
		);

		const now = formatContainerSnippetForDisplay(
			nowContainer,
			config.configPath
		);

		const diff = new Diff(prev, now);

		if (diff.changes === 0) {
			updateStatus(`no changes ${brandColor(prevApp.name)}`);
			endSection("No changes to be made");
			return;
		}

		updateStatus(`${brandColor.underline("EDIT")} ${prevApp.name}`, false);

		newline();
		diff.print();
		newline();

		if (containerConfig.rollout_kind !== "none") {
			await doAction(
				{
					action: "modify",
					application: modifyReq,
					id: prevApp.id,
					name: prevApp.name,
					rollout_step_percentage: containerConfig.rollout_step_percentage,
					rollout_kind:
						containerConfig.rollout_kind === "full_manual"
							? "full_manual"
							: "full_auto",
				},
				config,
				accountId
			);
		} else {
			log("Skipping application rollout");
			newline();
		}
	} else {
		updateStatus(bold.underline(green.underline("NEW")) + ` ${appConfig.name}`);

		const configStr = formatContainerSnippetForDisplay(
			appConfig,
			config.configPath
		);

		configStr
			.trimEnd()
			.split("\n")
			.forEach((el) => log(`  ${el}`));
		newline();

		await doAction(
			{
				action: "create",
				application: appConfig,
			},
			config,
			accountId
		);
	}
	newline();
	endSection("Applied changes");
}

function mergeIfUnsafe<
	T extends CreateApplicationRequest | ModifyApplicationRequestBody,
>(fullConfig: Config, containerConfig: T, name: string) {
	const unsafeContainerConfig = fullConfig.containers?.find((original) => {
		return original.name === name && original.unsafe !== undefined;
	});

	if (unsafeContainerConfig) {
		return mergeDeep<T>(
			containerConfig,
			unsafeContainerConfig.unsafe as Partial<T>
		);
	} else {
		return containerConfig;
	}
}

export function formatError(err: APIError): string {
	if (err.notes.length > 0) {
		return err.notes.map((note) => note.text).join("\n");
	}
	return err.message;
}

const doAction = async (
	action:
		| { action: "create"; application: CreateApplicationRequest }
		| {
				action: "modify";
				application: ModifyApplicationRequestBody;
				id: ApplicationID;
				name: ApplicationName;
				rollout_step_percentage: number | number[];
				rollout_kind: CreateApplicationRolloutRequest["kind"];
		  },
	config: Config,
	accountId: string
) => {
	if (action.action === "create") {
		let application: Application;
		try {
			application = await fetchResult<Application>(
				config,
				`/accounts/${accountId}/containers/applications`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(action.application),
				}
			);
		} catch (err) {
			if (!(err instanceof Error)) {
				throw err;
			}

			if (!(err instanceof APIError)) {
				throw new FatalError(
					`Unexpected error creating application: ${err.message}`,
					{ telemetryMessage: "containers deploy create unexpected error" }
				);
			}

			if (err.status === 400) {
				throw new UserError(
					`Error creating application due to a misconfiguration:\n${formatError(err)}`,
					{ telemetryMessage: "containers deploy create misconfiguration" }
				);
			}

			throw new UserError(`Error creating application:\n${formatError(err)}`, {
				telemetryMessage: "containers deploy create request failed",
			});
		}

		success(
			`Created application ${brandColor(action.application.name)} (Application ID: ${application.id})`,
			{
				shape: shapes.bar,
			}
		);
	}

	if (action.action === "modify") {
		try {
			await fetchResult<Application>(
				config,
				`/accounts/${accountId}/containers/applications/${action.id}`,
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(action.application),
				}
			);
		} catch (err) {
			if (!(err instanceof Error)) {
				throw err;
			}

			if (!(err instanceof APIError)) {
				throw new UserError(
					`Unexpected error modifying application "${action.name}": ${err.message}`,
					{ telemetryMessage: "containers deploy modify unexpected error" }
				);
			}

			if (err.status === 400) {
				throw new UserError(
					`Error modifying application "${action.name}" due to a misconfiguration:\n\n\t${formatError(err)}`,
					{ telemetryMessage: "containers deploy modify misconfiguration" }
				);
			}

			throw new UserError(
				`Error modifying application "${action.name}":\n${formatError(err)}`,
				{ telemetryMessage: "containers deploy modify request failed" }
			);
		}

		try {
			await fetchResult(
				config,
				`/accounts/${accountId}/containers/applications/${action.id}/rollouts`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						description: "Progressive update",
						strategy: "rolling",
						target_configuration: action.application.configuration ?? {},
						...configRolloutStepsToAPI(action.rollout_step_percentage),
						kind: action.rollout_kind,
					} satisfies CreateApplicationRolloutRequest),
				}
			);
		} catch (err) {
			if (!(err instanceof Error)) {
				throw err;
			}

			if (!(err instanceof APIError)) {
				throw new UserError(
					`Unexpected error rolling out application "${action.name}":\n${err.message}`,
					{ telemetryMessage: "containers deploy rollout unexpected error" }
				);
			}

			if (err.status === 400) {
				throw new UserError(
					`Error rolling out application "${action.name}" due to a misconfiguration:\n\n\t${formatError(err)}`,
					{ telemetryMessage: "containers deploy rollout misconfiguration" }
				);
			}

			throw new UserError(
				`Error rolling out application "${action.name}":\n${formatError(err)}`,
				{ telemetryMessage: "containers deploy rollout request failed" }
			);
		}

		success(
			`Modified application ${brandColor(action.name)} (Application ID: ${action.id})`,
			{
				shape: shapes.bar,
			}
		);
	}
};

export function cleanApplicationFromAPI(
	prev: Application,
	currentConfig: ContainerNormalizedConfig,
	accountId: string,
	complianceConfig?: ComplianceConfig
): Partial<ModifyApplicationRequestBody> &
	Pick<Application, "configuration" | "name"> {
	const cleanedPreviousApp: Partial<ModifyApplicationRequestBody> &
		Pick<Application, "configuration" | "name"> = {
		configuration: {
			...prev.configuration,
			image: resolveImageName(
				accountId,
				prev.configuration.image,
				complianceConfig
			),
		},
		constraints: prev.constraints,
		max_instances: prev.max_instances,
		name: prev.name,
		scheduling_policy: prev.scheduling_policy,
		affinities: prev.affinities,
		rollout_active_grace_period: prev.rollout_active_grace_period,
	};

	if ("instance_type" in currentConfig) {
		const instance_type = inferInstanceType(cleanedPreviousApp.configuration);
		if (!instance_type) {
			return prev;
		}
		cleanedPreviousApp.configuration.instance_type = instance_type;

		delete cleanedPreviousApp.configuration.disk;
		delete cleanedPreviousApp.configuration.memory;
		delete cleanedPreviousApp.configuration.memory_mib;
		delete cleanedPreviousApp.configuration.vcpu;
	}

	return cleanedPreviousApp;
}

export const configRolloutStepsToAPI = (rolloutSteps: number | number[]) => {
	if (typeof rolloutSteps === "number") {
		return { step_percentage: rolloutSteps };
	} else {
		const output: RolloutStepRequest[] = [];
		let index = 1;
		for (const step of rolloutSteps) {
			output.push({
				step_size: { percentage: step },
				description: `Step ${index} of ${rolloutSteps.length} - rollout at ${step}% of instances`,
			});
			index++;
		}
		return { steps: output };
	}
};

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

const LEGACY_TO_CANONICAL: Record<"dev" | "standard", InstanceType> = {
	dev: "lite" as InstanceType,
	standard: "standard-1" as InstanceType,
};

function inferInstanceType(
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

function stripUndefined<T>(value: T): T {
	if (Array.isArray(value)) {
		return value.map((item) => stripUndefined(item)) as T;
	}

	if (!isObject(value)) {
		return value;
	}

	return Object.fromEntries(
		Object.entries(value)
			.filter(([, entryValue]) => entryValue !== undefined)
			.map(([key, entryValue]) => [key, stripUndefined(entryValue)])
	) as T;
}

function sortObjectRecursive<T>(value: T): T {
	if (Array.isArray(value)) {
		return value.map((item) => sortObjectRecursive(item)) as T;
	}

	if (!isObject(value)) {
		return value;
	}

	return Object.fromEntries(
		Object.entries(value)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([key, entryValue]) => [key, sortObjectRecursive(entryValue)])
	) as T;
}

function getContainersLogger() {
	return {
		debug: logger.debug,
		debugWithSanitization:
			logger.debugWithSanitization ??
			((label: string, ...args: unknown[]) => logger.debug(label, ...args)),
		log: logger.log,
		info: logger.info,
		warn: logger.warn,
		error: logger.error,
	};
}
