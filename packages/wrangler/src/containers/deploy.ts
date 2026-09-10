/**
 * Note! Much of this is copied and modified from cloudchamber/apply.ts
 * However this code is only used for containers interactions, not cloudchamber ones!
 */
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
	ApiError,
	ApplicationsService,
	CreateApplicationRolloutRequest,
	resolveImageName,
	RolloutsService,
} from "@cloudflare/containers-shared";
import {
	APIError,
	FatalError,
	formatConfigSnippet,
	getDockerPath,
	UserError,
} from "@cloudflare/workers-utils";
import { fetchPagedListResult } from "../cfetch";
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
	dispatchNamespace?: string;
	versionId: string;
	accountId: string;
	scriptName: string;
};

type ObservabilityWriteTarget = "top-level" | "configuration";

export function createDurableObjectNamespaceResolver(
	config: Config,
	{ versionId, accountId, scriptName, dispatchNamespace }: DeployContainersArgs
): (className: string) => Promise<string> {
	const boundDOs = new Set(
		config.durable_objects.bindings.map((binding) => binding.class_name)
	);
	let maybeVersionInfo: ApiVersion | undefined;
	let maybeAllDurableObjects: DurableObjectNamespace[] | undefined;

	return async (className: string) => {
		// Worker version endpoints do not address dispatch scripts. Resolve those
		// from the account list, including their dispatch namespace in the identity.
		if (boundDOs.has(className) && dispatchNamespace === undefined) {
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
					binding.class_name === className &&
					(binding.script_name === undefined ||
						binding.script_name === scriptName) &&
					binding.namespace_id !== undefined
			);
			if (!targetDurableObject?.namespace_id) {
				throw new UserError(
					"Could not deploy container configuration as durable object was not found in list of bindings",
					{
						telemetryMessage:
							"containers deploy durable object binding missing",
					}
				);
			}
			return targetDurableObject.namespace_id;
		}

		maybeAllDurableObjects ??= await listDurableObjects(config, accountId);
		const targetDurableObject = maybeAllDurableObjects.find(
			(durableObject) =>
				durableObject.class === className &&
				durableObject.script === scriptName &&
				durableObject.preview === undefined &&
				durableObject.dispatch_namespace === dispatchNamespace
		);
		if (!targetDurableObject) {
			throw new UserError(
				"Could not deploy container configuration as durable object was not found in the account namespace list",
				{
					telemetryMessage:
						"containers deploy durable object namespace missing",
				}
			);
		}
		return targetDurableObject.id;
	};
}

export async function deployContainers(
	config: Config,
	normalisedContainerConfig: ContainerNormalizedConfig[],
	{ versionId, accountId, scriptName, dispatchNamespace }: DeployContainersArgs
) {
	await fillOpenAPIConfiguration(config, containersScope);

	const pathToDocker = getDockerPath();
	const resolveNamespaceId = createDurableObjectNamespaceResolver(config, {
		versionId,
		accountId,
		scriptName,
		dispatchNamespace,
	});

	let imageRef: ImageRef;

	for (const container of normalisedContainerConfig) {
		if ("dockerfile" in container) {
			imageRef = await buildContainer(
				container,
				versionId,
				false, // dry runs will have already exited by this point
				pathToDocker,
				false,
				config
			);
		} else {
			imageRef = { newTag: container.image_uri };
		}

		const namespaceId = await resolveNamespaceId(container.class_name);
		await apply(
			{
				imageRef,
				durable_object_namespace_id: namespaceId,
			},
			container,
			config
		);
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
			return await fetchVersion(config, accountId, scriptName, versionId);
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
	use_sqlite: boolean;
	dispatch_namespace?: string;
	/**
	 * Set when the namespace belongs to a Worker preview. For those, `script` is
	 * the parent Worker's name, so `preview.id` is what distinguishes a
	 * preview's namespace from the parent's and from other previews'.
	 */
	preview?: { id: string; slug: string; name: string };
};
export async function listDurableObjects(
	complianceConfig: ComplianceConfig,
	accountId: string
): Promise<DurableObjectNamespace[]> {
	return await fetchPagedListResult<DurableObjectNamespace>(
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

function hasLegacyRolloutObservabilityEnabled(
	app: Application | undefined
): boolean {
	return (
		isLegacyObservabilityEnabled(app?.configuration.observability) ||
		isLegacyObservabilityEnabled(
			app?.scheduling_hint?.target.configuration.observability
		)
	);
}

function getLatestLegacyObservabilityState(
	app: Application | undefined
): DeploymentObservabilityConfiguration | undefined {
	return (
		app?.scheduling_hint?.target.configuration.observability ??
		app?.configuration.observability
	);
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

	if (hasLegacyRolloutObservabilityEnabled(prevApp)) {
		return "configuration";
	}

	return "top-level";
}

function hasMixedEnabledObservability(app: Application): boolean {
	return (
		app.observability?.logs?.enabled === true &&
		isLegacyObservabilityEnabled(app.configuration.observability)
	);
}

function requiresObservabilityMigration(
	app: Application,
	observability: ContainerNormalizedConfig["observability"]
): boolean {
	return (
		hasLegacyRolloutObservabilityEnabled(app) &&
		(app.observability?.logs?.enabled === true ||
			(usesTopLevelObservability(app) && observability.logs_enabled))
	);
}

function buildLegacyObservabilityMigrationPatch(
	app: Application
): ApplicationObservabilityConfiguration {
	const observability = app.configuration.observability;
	assert(observability?.logs?.enabled === true);

	// Coordinator clears legacy observability when a top-level PATCH matches it.
	return { logs: observability.logs };
}

function migrateLegacyObservabilityState(
	app: Application,
	observability: ApplicationObservabilityConfiguration
): Application {
	const configuration = { ...app.configuration };
	delete configuration.observability;

	return {
		...app,
		configuration,
		observability,
	};
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

function buildTopLevelObservabilityPatch(
	observability: ContainerNormalizedConfig["observability"],
	prevApp: Application | undefined,
	writeTarget: ObservabilityWriteTarget
): ApplicationObservabilityConfiguration | undefined {
	if (writeTarget === "configuration" && !usesTopLevelObservability(prevApp)) {
		return undefined;
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
			? buildTopLevelObservability(observability)
			: undefined;
	}

	const nextObservability = buildTopLevelObservability(observability);
	return isSameApplicationObservability(
		nextObservability,
		prevApp?.observability
	)
		? undefined
		: nextObservability;
}

function buildConfigurationObservabilityPatch(
	observability: ContainerNormalizedConfig["observability"],
	prevApp: Application | undefined
): DeploymentObservabilityConfiguration | undefined {
	const latestLegacyLogsEnabled =
		getLatestLegacyObservabilityState(prevApp)?.logs?.enabled;

	if (observability.logs_enabled === latestLegacyLogsEnabled) {
		// Application PATCHes and rollout targets treat configuration as a partial
		// update, so omitting unchanged legacy observability preserves it.
		return undefined;
	}

	if (!observability.logs_enabled && latestLegacyLogsEnabled === undefined) {
		return undefined;
	}

	return buildConfigurationObservability(observability);
}

function buildApplicationObservabilityPatch(
	observability: ContainerNormalizedConfig["observability"],
	writeTarget: ObservabilityWriteTarget,
	prevApp: Application | undefined
): {
	observability?: ApplicationObservabilityConfiguration;
	configurationObservability?: DeploymentObservabilityConfiguration;
} {
	const nextTopLevelObservability = buildTopLevelObservabilityPatch(
		observability,
		prevApp,
		writeTarget
	);

	if (writeTarget === "configuration") {
		const nextConfigurationObservability = buildConfigurationObservabilityPatch(
			observability,
			prevApp
		);

		return {
			...(nextTopLevelObservability !== undefined
				? { observability: nextTopLevelObservability }
				: {}),
			...(nextConfigurationObservability !== undefined
				? {
						configurationObservability: nextConfigurationObservability,
					}
				: {}),
		};
	}

	return nextTopLevelObservability !== undefined
		? { observability: nextTopLevelObservability }
		: {};
}

function assertCanUseApplicationObservabilityTargeting(
	prevApp: Application,
	containerConfig: ContainerNormalizedConfig
) {
	if (!hasTopLevelOnlyObservabilityFields(containerConfig.observability)) {
		return;
	}

	if (!hasLegacyRolloutObservabilityEnabled(prevApp)) {
		return;
	}

	throw new UserError(
		`Application-level observability targeting cannot be enabled for container ${containerConfig.name} while it still uses legacy rollout-based observability. Set containers[].observability.enabled = false in your Wrangler config and deploy once, then deploy again with target_instance_percentage or target_instance_count.`,
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
	complianceConfig: ComplianceConfig,
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
			image: resolveImageName(accountId, imageRef, complianceConfig),
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
	let prevApp = existingApplications.find(
		(app) => app.name === containerConfig.name
	);

	const imageRef =
		"remoteDigest" in args.imageRef
			? args.imageRef.remoteDigest
			: args.imageRef.newTag;
	log(dim("Container application changes\n"));

	const accountId = await getOrSelectAccountId(config);
	let migratedLegacyObservability = false;

	if (prevApp !== undefined) {
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

		if (containerConfig.rollout_kind !== "none") {
			if (
				requiresObservabilityMigration(
					prevApp,
					containerConfig.observability
				) &&
				(prevApp.active_rollout_id !== undefined ||
					isLegacyObservabilityEnabled(
						prevApp.scheduling_hint?.target.configuration.observability
					))
			) {
				throw new UserError(
					`Cannot migrate observability configuration for container ${containerConfig.name} while an application rollout is active. Wait for the rollout to finish, then deploy again.`,
					{
						telemetryMessage:
							"containers deploy observability migration rollout active",
					}
				);
			}

			if (hasMixedEnabledObservability(prevApp)) {
				const migrationObservability =
					buildLegacyObservabilityMigrationPatch(prevApp);
				await doAction({
					action: "modify",
					application: { observability: migrationObservability },
					id: prevApp.id,
					name: prevApp.name,
					successMessage: `Migrated observability configuration for ${brandColor(prevApp.name)} (Application ID: ${prevApp.id})`,
				});
				prevApp = migrateLegacyObservabilityState(
					prevApp,
					migrationObservability
				);
				migratedLegacyObservability = true;
			}
		}
	}

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
				config,
				observabilityWriteTarget,
				prevApp
			),
			containerConfig.name
		)
	);

	if (prevApp !== undefined && prevApp !== null) {
		// we need to sort the objects (by key) because the diff algorithm works with lines
		const normalisedPrevApp = sortObjectRecursive<ModifyApplicationRequestBody>(
			stripUndefined(
				cleanApplicationFromAPI(
					prevApp,
					containerConfig,
					accountId,
					observabilityWriteTarget,
					config
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
		// Top-level observability is replaced as a unit. A deep merge would retain
		// targeting fields that the user removed from their config.
		if (normalizedModifyReq.observability !== undefined) {
			nowContainer.observability = normalizedModifyReq.observability;
		}
		const shouldCreateRollout = hasRolloutDiff(normalisedPrevApp, nowContainer);

		const prev = formatContainerSnippetForDisplay(
			normalisedPrevApp,
			config.configPath
		);

		const now = formatContainerSnippetForDisplay(
			nowContainer,
			config.configPath
		);
		// eslint-disable-next-line @typescript-eslint/no-deprecated -- Diff is used here for formatted config string diffing, not JSON objects
		const diff = new Diff(prev, now);

		if (diff.changes === 0) {
			if (migratedLegacyObservability) {
				newline();
				endSection("Applied changes");
				return;
			}
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
				successMessage?: string;
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
			action.successMessage ??
				`Modified application ${brandColor(action.name)} (Application ID: ${action.id})`,
			{
				shape: shapes.bar,
			}
		);
	}
};

/**
 * clean up application object received from API so that we get a nicer diff when comparing it to the current config.
 *
 * @param prev - Previously deployed application returned by the API.
 * @param currentConfig - Current normalized container configuration.
 * @param accountId - Cloudflare account ID that owns managed-registry images.
 * @param observabilityWriteTarget - API field used for observability updates.
 * @param complianceConfig - Compliance configuration used to normalize managed-registry image references.
 * @returns The cleaned application fields used to generate the deployment diff.
 */
export function cleanApplicationFromAPI(
	prev: Application,
	currentConfig: ContainerNormalizedConfig,
	accountId: string,
	observabilityWriteTarget: ObservabilityWriteTarget,
	complianceConfig?: ComplianceConfig
): Partial<ModifyApplicationRequestBody> & Pick<Application, "configuration"> {
	const configuration = {
		...prev.configuration,
		image: resolveImageName(
			accountId,
			prev.configuration.image,
			complianceConfig
		),
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

	if (
		observabilityWriteTarget === "configuration" &&
		getLatestLegacyObservabilityState(prev) !== undefined
	) {
		cleanedPreviousApp.configuration.observability =
			getLatestLegacyObservabilityState(prev);
	}

	if (prev.observability !== undefined) {
		cleanedPreviousApp.observability = prev.observability;
	}

	if ("instance_type" in currentConfig) {
		// returns undefined if we can't infer it.
		const instance_type = inferInstanceType(cleanedPreviousApp.configuration);
		if (!instance_type) {
			// API-only fields must not affect either the rendered diff or the rollout
			// decision when the stored limits do not map to a named instance type.
			return cleanedPreviousApp;
		}
		cleanedPreviousApp.configuration.instance_type = instance_type;

		delete cleanedPreviousApp.configuration.disk;
		// eslint-disable-next-line @typescript-eslint/no-deprecated -- intentionally cleaning up deprecated `memory` field
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
