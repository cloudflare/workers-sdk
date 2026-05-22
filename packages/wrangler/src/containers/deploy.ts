/**
 * Note! Much of this is copied and modified from cloudchamber/apply.ts
 * However this code is only used for containers interactions, not cloudchamber ones!
 */
import assert from "node:assert";
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
	ApiError,
	ApplicationsService,
	CreateApplicationRolloutRequest,
	resolveImageName,
	RolloutsService,
} from "@cloudflare/containers-shared";
import {
	FatalError,
	formatConfigSnippet,
	getDockerPath,
	UserError,
} from "@cloudflare/workers-utils";
import { fetchResult } from "../cfetch";
import {
	fillOpenAPIConfiguration,
	promiseSpinner,
} from "../cloudchamber/common";
import { inferInstanceType } from "../cloudchamber/instance-type/instance-type";
import { buildContainer } from "../containers/build";
import { getOrSelectAccountId } from "../user";
import { Diff } from "../utils/diff";
import {
	sortObjectRecursive,
	stripUndefined,
} from "../utils/sortObjectRecursive";
import { fetchVersion } from "../versions/api";
import { containersScope } from ".";
import type { ImageRef } from "../cloudchamber/build";
import type { ApiVersion } from "../versions/types";
import type {
	Application,
	ApplicationObservability as ApplicationObservabilityConfiguration,
	ApplicationID,
	ApplicationName,
	ContainerNormalizedConfig,
	CreateApplicationRequest,
	ModifyApplicationRequestBody,
	Observability as DeploymentObservabilityConfiguration,
	RolloutStepRequest,
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

type ObservabilityWriteTarget = "top-level" | "configuration";

export async function deployContainers(
	config: Config,
	normalisedContainerConfig: ContainerNormalizedConfig[],
	{ versionId, accountId, scriptName }: DeployContainersArgs
) {
	await fillOpenAPIConfiguration(config, containersScope);

	const pathToDocker = getDockerPath();
	const boundDOs = new Set(
		config.durable_objects.bindings.map((b) => b.class_name)
	);

	let imageRef: ImageRef;
	let maybeVersionInfo: ApiVersion | undefined;
	let maybeAllDurableObjects: DurableObjectNamespace[] | undefined;

	for (const container of normalisedContainerConfig) {
		if ("dockerfile" in container) {
			imageRef = await buildContainer(
				container,
				versionId,
				false, // dry runs will have already exited by this point
				pathToDocker
			);
		} else {
			imageRef = { newTag: container.image_uri };
		}

		// Only bound DOs are returned in version info. For unbound DOs, we need to list all DO namespaces.
		if (boundDOs.has(container.class_name)) {
			maybeVersionInfo ??= await fetchVersion(
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
					// DO cannot be defined in a different script to the container
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
				config
			);
		} else {
			// The DO is unbound, so we need to list all DO namespaces to find the right one
			// TODO: use the list API with filters when it exists
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
				config
			);
		}
	}
}

type DurableObjectNamespace = {
	id: string;
	class: string;
	name: string;
	script: string;
	useSqlite: boolean;
};
async function listDurableObjects(
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
/**
 * Source overwrites target
 */
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
		observability: req.observability,
		max_instances: req.max_instances,
		constraints: req.constraints,
		affinities: req.affinities,
		scheduling_policy: req.scheduling_policy,
		rollout_active_grace_period: req.rollout_active_grace_period,
	};
}

function isLegacyObservabilityEnabled(
	observability: DeploymentObservabilityConfiguration | undefined
): boolean {
	return observability?.logs?.enabled === true;
}

function usesTopLevelObservability(app: Application | undefined): boolean {
	return app?.observability !== undefined;
}

function hasTopLevelOnlyObservabilityFields(
	observability: ContainerNormalizedConfig["observability"]
): boolean {
	return (
		observability.target_instance_percentage !== undefined ||
		observability.target_instance_count !== undefined
	);
}

function selectObservabilityWriteTarget(
	prevApp: Application | undefined
): ObservabilityWriteTarget {
	if (prevApp === undefined) {
		return "top-level";
	}

	if (usesTopLevelObservability(prevApp)) {
		return "top-level";
	}

	if (isLegacyObservabilityEnabled(prevApp.configuration.observability)) {
		return "configuration";
	}

	return "top-level";
}

function buildTopLevelObservability(
	observability: ContainerNormalizedConfig["observability"]
): ApplicationObservabilityConfiguration {
	return stripUndefined({
		logs: { enabled: observability.logs_enabled },
		target_instance_percentage: observability.target_instance_percentage,
		target_instance_count: observability.target_instance_count,
	});
}

function buildConfigurationObservability(
	observability: ContainerNormalizedConfig["observability"]
): DeploymentObservabilityConfiguration {
	return {
		logs: {
			enabled: observability.logs_enabled,
		},
	};
}

function isSameApplicationObservability(
	left: ApplicationObservabilityConfiguration | undefined,
	right: ApplicationObservabilityConfiguration | undefined
): boolean {
	return (
		left?.logs?.enabled === right?.logs?.enabled &&
		left?.target_instance_percentage === right?.target_instance_percentage &&
		left?.target_instance_count === right?.target_instance_count
	);
}

function buildApplicationObservabilityPatch(
	observability: ContainerNormalizedConfig["observability"],
	writeTarget: ObservabilityWriteTarget,
	prevApp: Application | undefined
): {
	observability?: ApplicationObservabilityConfiguration;
	configurationObservability?: DeploymentObservabilityConfiguration;
} {
	if (writeTarget === "configuration") {
		if (observability.logs_enabled) {
			return isLegacyObservabilityEnabled(prevApp?.configuration.observability)
				? {}
				: {
						configurationObservability:
							buildConfigurationObservability(observability),
					};
		}

		return isLegacyObservabilityEnabled(prevApp?.configuration.observability)
			? {
					configurationObservability:
						buildConfigurationObservability(observability),
				}
			: {};
	}

	const shouldWriteDisabledTopLevelObservability =
		prevApp?.observability !== undefined &&
		(prevApp.observability.logs?.enabled === true ||
			prevApp.observability.target_instance_percentage !== undefined ||
			prevApp.observability.target_instance_count !== undefined);

	if (
		!observability.logs_enabled &&
		!hasTopLevelOnlyObservabilityFields(observability)
	) {
		return shouldWriteDisabledTopLevelObservability
			? {
					observability: buildTopLevelObservability(observability),
				}
			: {};
	}

	const nextObservability = buildTopLevelObservability(observability);
	return isSameApplicationObservability(
		nextObservability,
		prevApp?.observability
	)
		? {}
		: { observability: nextObservability };
}

function assertCanUseApplicationObservabilityTargeting(
	prevApp: Application,
	containerConfig: ContainerNormalizedConfig
) {
	if (!hasTopLevelOnlyObservabilityFields(containerConfig.observability)) {
		return;
	}

	if (
		!isLegacyObservabilityEnabled(prevApp.configuration.observability) &&
		!isLegacyObservabilityEnabled(
			prevApp.scheduling_hint?.target.configuration.observability
		)
	) {
		return;
	}

	throw new UserError(
		`Application-level observability targeting cannot be enabled for container ${containerConfig.name} until legacy configuration.observability is disabled with a rollout first.`,
		{
			telemetryMessage: "containers deploy observability migration blocked",
		}
	);
}

function hasRolloutDiff(
	prevApp: ModifyApplicationRequestBody,
	nextApp: ModifyApplicationRequestBody
): boolean {
	const normalizedPrevApp = stripUndefined({ ...prevApp });
	const normalizedNextApp = stripUndefined({ ...nextApp });

	delete normalizedPrevApp.observability;
	delete normalizedNextApp.observability;

	return (
		JSON.stringify(sortObjectRecursive(normalizedPrevApp)) !==
		JSON.stringify(sortObjectRecursive(normalizedNextApp))
	);
}

/**
 *
 * Turns the normalised container config from wrangler config into
 * a CreateApplicationRequest that can be sent to the API.
 * If we want to modify instead, the ModifyRequestBody is a subset of this
 *
 */
function containerConfigToCreateRequest(
	accountId: string,
	containerApp: ContainerNormalizedConfig,
	imageRef: string,
	durableObjectNamespaceId: string,
	observabilityWriteTarget: ObservabilityWriteTarget,
	prevApp?: Application
): CreateApplicationRequest {
	const { observability, configurationObservability } =
		buildApplicationObservabilityPatch(
			containerApp.observability,
			observabilityWriteTarget,
			prevApp
		);

	return {
		name: containerApp.name,
		scheduling_policy: containerApp.scheduling_policy,
		...(observability !== undefined ? { observability } : {}),
		configuration: {
			// De-sugar image name
			image: resolveImageName(accountId, imageRef),
			// if disk/memory/vcpu is not defined in config, AND instance_type is also not defined, this will already have been defaulted to 'dev'
			...("instance_type" in containerApp
				? { instance_type: containerApp.instance_type }
				: {
						disk: { size_mb: containerApp.disk_bytes / (1000 * 1000) },
						memory_mib: containerApp.memory_mib,
						vcpu: containerApp.vcpu,
					}),
			...(configurationObservability !== undefined
				? { observability: configurationObservability }
				: {}),
			wrangler_ssh: containerApp.wrangler_ssh,
			authorized_keys: containerApp.authorized_keys,
			trusted_user_ca_keys: containerApp.trusted_user_ca_keys,
		},
		// deprecated in favour of max_instances
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
	// Normalize field names from the API into the Wrangler specific format
	// Example: `container.configuration.wrangler_ssh` (API) => `container.configuration.ssh` (Wrangler)
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

export async function apply(
	args: {
		imageRef: ImageRef;
		durable_object_namespace_id: string;
	},
	containerConfig: ContainerNormalizedConfig,
	config: Config
) {
	if (!config.containers || config.containers.length === 0) {
		return;
	}
	startSection(
		"Deploy a container application",
		"deploy changes to your application"
	);

	const existingApplications = await promiseSpinner(
		ApplicationsService.listApplications(),
		{ message: "Loading applications" }
	);
	// TODO: this is not correct right now as there can be multiple applications
	// with the same name.
	/** Previous deployment of this app, if this exists  */
	const prevApp = existingApplications.find(
		(app) => app.name === containerConfig.name
	);

	// if there is a remote digest, it indicates that the image already exists in the managed registry
	// so we should try and use the tag from the previous deployment if possible.
	// however deployments that fail after push may result in no previous app but the image still existing
	const imageRef =
		"remoteDigest" in args.imageRef
			? (prevApp?.configuration.image ?? args.imageRef.remoteDigest)
			: args.imageRef.newTag;
	log(dim("Container application changes\n"));

	const accountId = await getOrSelectAccountId(config);
	const observabilityWriteTarget = selectObservabilityWriteTarget(prevApp);

	if (prevApp !== undefined) {
		assertCanUseApplicationObservabilityTargeting(prevApp, containerConfig);
	}

	// let's always convert normalised container config -> CreateApplicationRequest
	// since CreateApplicationRequest is a superset of ModifyApplicationRequestBody
	const appConfig = stripUndefined(
		mergeIfUnsafe(
			config,
			containerConfigToCreateRequest(
				accountId,
				containerConfig,
				imageRef,
				args.durable_object_namespace_id,
				observabilityWriteTarget,
				prevApp
			),
			containerConfig.name
		)
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

		// we need to sort the objects (by key) because the diff algorithm works with lines
		const normalisedPrevApp = sortObjectRecursive<ModifyApplicationRequestBody>(
			stripUndefined(
				cleanApplicationFromAPI(
					prevApp,
					containerConfig,
					accountId,
					observabilityWriteTarget
				)
			)
		);

		// this will have removed the unsafe fields, so we need to add them back in after
		const modifyReq = stripUndefined(
			mergeIfUnsafe(
				config,
				createApplicationToModifyApplication(appConfig),
				appConfig.name
			)
		);
		const normalizedModifyReq =
			sortObjectRecursive<ModifyApplicationRequestBody>(modifyReq);
		/** only used for diffing */
		const nowContainer = mergeDeep(normalisedPrevApp, normalizedModifyReq);
		const shouldCreateRollout = hasRolloutDiff(normalisedPrevApp, nowContainer);

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
			await doAction({
				action: "modify",
				application: modifyReq,
				id: prevApp.id,
				name: prevApp.name,
				...(shouldCreateRollout
					? {
							rollout_step_percentage: containerConfig.rollout_step_percentage,
							rollout_kind:
								containerConfig.rollout_kind == "full_manual"
									? CreateApplicationRolloutRequest.kind.FULL_MANUAL
									: CreateApplicationRolloutRequest.kind.FULL_AUTO,
						}
					: {}),
			});
		} else {
			log("Skipping application rollout");
			newline();
		}
	} else {
		// **************
		// *** CREATE ***
		// **************

		// print the header of the app
		updateStatus(bold.underline(green.underline("NEW")) + ` ${appConfig.name}`);

		const configStr = formatContainerSnippetForDisplay(
			appConfig,
			config.configPath
		);

		// go line by line and pretty print it
		configStr
			.trimEnd()
			.split("\n")
			.forEach((el) => log(`  ${el}`));
		newline();
		// add to the actions array to create the app later

		await doAction({
			action: "create",
			application: appConfig,
		});
	}
	newline();
	endSection("Applied changes");
}

/**
 * If there is an unsafe container config that matches this container by class_name,
 * merge the unsafe config into the Create/Modify request.
 */
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

export function formatError(err: ApiError): string {
	try {
		const maybeError = JSON.parse(err.body.error);

		if (maybeError.error !== undefined) {
			const message = [];
			message.push(`${maybeError.error}`);
			if (
				maybeError.details !== undefined &&
				typeof maybeError.details === "object"
			) {
				for (const key in maybeError.details) {
					message.push(`${brandColor(key)} ${maybeError.details[key]}`);
				}
			}
			return message.join("\n");
		}
	} catch {}
	// if we can't make it pretty, just dump out the error body
	return JSON.stringify(err.body);
}

const doAction = async (
	action:
		| { action: "create"; application: CreateApplicationRequest }
		| {
				action: "modify";
				application: ModifyApplicationRequestBody;
				id: ApplicationID;
				name: ApplicationName;
				rollout_step_percentage?: number | number[];
				rollout_kind?: CreateApplicationRolloutRequest.kind;
		  }
) => {
	if (action.action === "create") {
		let application: Application;
		try {
			application = await promiseSpinner(
				ApplicationsService.createApplication(action.application),
				{ message: `Creating "${action.application.name}"` }
			);
		} catch (err) {
			if (!(err instanceof Error)) {
				throw err;
			}

			if (!(err instanceof ApiError)) {
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
			await promiseSpinner(
				ApplicationsService.modifyApplication(action.id, action.application),
				{ message: `Modifying ${action.application.name}` }
			);
		} catch (err) {
			if (!(err instanceof Error)) {
				throw err;
			}

			if (!(err instanceof ApiError)) {
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

		if (
			action.rollout_step_percentage !== undefined &&
			action.rollout_kind !== undefined
		) {
			try {
				await promiseSpinner(
					RolloutsService.createApplicationRollout(action.id, {
						description: "Progressive update",
						strategy: CreateApplicationRolloutRequest.strategy.ROLLING,
						target_configuration: action.application.configuration ?? {},
						...configRolloutStepsToAPI(action.rollout_step_percentage),
						kind: action.rollout_kind,
					}),
					{
						message: `rolling out container version ${action.name}`,
					}
				);
			} catch (err) {
				if (!(err instanceof Error)) {
					throw err;
				}

				if (!(err instanceof ApiError)) {
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
		}

		success(
			`Modified application ${brandColor(action.name)} (Application ID: ${action.id})`,
			{
				shape: shapes.bar,
			}
		);
	}
};

/**
 * clean up application object received from API so that we get a nicer diff when comparing it to the current config.
 */
export function cleanApplicationFromAPI(
	prev: Application,
	currentConfig: ContainerNormalizedConfig,
	accountId: string,
	observabilityWriteTarget: ObservabilityWriteTarget
): Partial<ModifyApplicationRequestBody> & Pick<Application, "configuration"> {
	const configuration = {
		...prev.configuration,
		image: resolveImageName(accountId, prev.configuration.image),
	};

	if (observabilityWriteTarget === "top-level") {
		delete configuration.observability;
	}

	const cleanedPreviousApp: Partial<ModifyApplicationRequestBody> &
		Pick<Application, "configuration"> = {
		configuration,
		constraints: prev.constraints,
		max_instances: prev.max_instances,
		name: prev.name,
		scheduling_policy: prev.scheduling_policy,
		affinities: prev.affinities,
		rollout_active_grace_period: prev.rollout_active_grace_period,
	};

	if ("instance_type" in currentConfig) {
		// returns undefined if we can't infer it.
		const instance_type = inferInstanceType(cleanedPreviousApp.configuration);
		if (instance_type) {
			cleanedPreviousApp.configuration.instance_type = instance_type;

			delete cleanedPreviousApp.configuration.disk;
			delete cleanedPreviousApp.configuration.memory;
			delete cleanedPreviousApp.configuration.memory_mib;
			delete cleanedPreviousApp.configuration.vcpu;
		}
	}

	if (
		observabilityWriteTarget === "configuration" &&
		prev.configuration.observability !== undefined
	) {
		cleanedPreviousApp.configuration.observability =
			prev.configuration.observability;
	}

	if (
		observabilityWriteTarget === "top-level" &&
		prev.observability !== undefined
	) {
		cleanedPreviousApp.observability = prev.observability;
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
