/**
 * Note! Much of this is copied and modified from cloudchamber/apply.ts
 * However this code is only used for containers interactions, not cloudchamber ones!
 */
import {
	endSection,
	log,
	newline,
	shapes,
	startSection,
	success,
	updateStatus,
} from "@cloudflare/cli";
import { bold, brandColor, dim, green } from "@cloudflare/cli/colors";
import {
	ApiError,
	ApplicationsService,
	CreateApplicationRolloutRequest,
	resolveImageName,
	RolloutsService,
} from "@cloudflare/containers-shared";
import { promiseSpinner } from "../cloudchamber/common";
import { Diff } from "../cloudchamber/helpers/diff";
import { inferInstanceType } from "../cloudchamber/instance-type/instance-type";
import { formatConfigSnippet } from "../config";
import { FatalError, UserError } from "../errors";
import { getAccountId } from "../user";
import {
	sortObjectRecursive,
	stripUndefined,
} from "../utils/sortObjectRecursive";
import type { ImageRef } from "../cloudchamber/build";
import type { Config } from "../config";
import type { ContainerApp } from "../config/environment";
import type {
	Application,
	ApplicationID,
	ApplicationName,
	ContainerNormalizedConfig,
	CreateApplicationRequest,
	ModifyApplicationRequestBody,
	Observability as ObservabilityConfiguration,
	RolloutStepRequest,
} from "@cloudflare/containers-shared";

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

function cleanupObservability(
	observability: ObservabilityConfiguration | undefined
) {
	if (observability === undefined) {
		return;
	}

	// `logging` field is deprecated, so if the server returns both `logging` and `logs`
	// fields, drop the `logging` one.
	if (observability.logging !== undefined && observability.logs !== undefined) {
		delete observability.logging;
	}
}

/**
 * Resolves current configuration based on previous deployment.
 */
function observabilityToConfiguration(
	/** Taken from current wrangler config */
	observabilityFromConfig: boolean,
	/** From previous deployment */
	existingObservabilityConfig: ObservabilityConfiguration | undefined
): ObservabilityConfiguration | undefined {
	// Let's use logs for the sake of simplicity of explanation.
	//
	// The first column specifies if logs are enabled in the current Wrangler config.
	// The second column specifies if logs are currently enabled for the application.
	// The third column specifies what the expected function result should be so that
	// diff is minimal.
	//
	// | Wrangler  | Existing  | Result    |
	// | --------- | --------- | --------- |
	// | undefined | undefined | undefined |
	// | undefined | false     | false     |
	// | undefined | true      | false     |
	// | false     | undefined | undefined |
	// | false     | false     | false     |
	// | false     | true      | false     |
	// | true      | undefined | true      |
	// | true      | false     | true      |
	// | true      | true      | true      |
	//
	// Because the result is the same for Wrangler undefined and false, the table may be
	// compressed as follows:

	//
	// | Wrangler          | Existing                 | Result    |
	// | ----------------- | ------------------------ | --------- |
	// | false / undefined | undefined                | undefined |
	// | false / undefined | false / true             | false     |
	// | true              | undefined / false / true | true      |

	const logsAlreadyEnabled = existingObservabilityConfig?.logs?.enabled;

	if (observabilityFromConfig) {
		return { logs: { enabled: true } };
	} else if (logsAlreadyEnabled === undefined) {
		return undefined;
	} else {
		return { logs: { enabled: false } };
	}
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
	prevApp?: Application
): CreateApplicationRequest {
	return {
		name: containerApp.name,
		scheduling_policy: containerApp.scheduling_policy,
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
			observability: observabilityToConfiguration(
				containerApp.observability.logs_enabled,
				prevApp?.configuration.observability
			),
		},
		// deprecated in favour of max_instances
		instances: 0,
		max_instances: containerApp.max_instances,
		constraints: containerApp.constraints,
		durable_objects: {
			namespace_id: durableObjectNamespaceId,
		},
		rollout_active_grace_period: containerApp.rollout_active_grace_period,
	};
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
	existingApplications.forEach((app) =>
		cleanupObservability(app.configuration.observability)
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
			? prevApp?.configuration.image ?? args.imageRef.remoteDigest
			: args.imageRef.newTag;
	log(dim("Container application changes\n"));

	const accountId = config.account_id || (await getAccountId(config));

	// let's always convert normalised container config -> CreateApplicationRequest
	// since CreateApplicationRequest is a superset of ModifyApplicationRequestBody
	const appConfig = containerConfigToCreateRequest(
		accountId,
		containerConfig,
		imageRef,
		args.durable_object_namespace_id,
		prevApp
	);

	if (prevApp !== undefined && prevApp !== null) {
		if (!prevApp.durable_objects?.namespace_id) {
			throw new FatalError(
				"The previous deploy of this container application was not associated with a durable object"
			);
		}
		if (
			prevApp.durable_objects.namespace_id !== args.durable_object_namespace_id
		) {
			throw new UserError(
				`Application "${prevApp.name}" is assigned to durable object ${prevApp.durable_objects.namespace_id}, but a new DO namespace is being assigned to the application,
					you should delete the container application and deploy again`,
				{
					telemetryMessage:
						"trying to redeploy container to different durable object",
				}
			);
		}

		// we need to sort the objects (by key) because the diff algorithm works with lines
		const normalisedPrevApp = sortObjectRecursive<ModifyApplicationRequestBody>(
			stripUndefined(
				cleanApplicationFromAPI(prevApp, containerConfig, accountId)
			)
		);

		const modifyReq = createApplicationToModifyApplication(appConfig);
		/** only used for diffing */
		const nowContainer = mergeDeep(
			normalisedPrevApp,
			sortObjectRecursive<ModifyApplicationRequestBody>(modifyReq)
		);

		const prev = formatConfigSnippet(
			// note this really is a CreateApplicationRequest, not a ContainerApp
			// but this function doesn't actually care about the type
			{ containers: [normalisedPrevApp as ContainerApp] },
			config.configPath
		);

		const now = formatConfigSnippet(
			{ containers: [nowContainer as ContainerApp] },
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
				rollout_step_percentage: containerConfig.rollout_step_percentage,
				rollout_kind:
					containerConfig.rollout_kind == "full_manual"
						? CreateApplicationRolloutRequest.kind.FULL_MANUAL
						: CreateApplicationRolloutRequest.kind.FULL_AUTO,
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

		const configStr = formatConfigSnippet(
			{ containers: [appConfig as ContainerApp] },
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

function formatError(err: ApiError): string {
	try {
		const maybeError = JSON.parse(err.body.error);
		if (
			maybeError.error !== undefined &&
			maybeError.details !== undefined &&
			typeof maybeError.details === "object"
		) {
			let message = "";
			message += `${maybeError.error}\n`;
			for (const key in maybeError.details) {
				message += `${brandColor(key)} ${maybeError.details[key]}\n`;
			}
			return message;
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
				rollout_step_percentage: number | number[];
				rollout_kind: CreateApplicationRolloutRequest.kind;
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
					`Unexpected error creating application: ${err.message}`
				);
			}

			if (err.status === 400) {
				throw new UserError(
					`Error creating application due to a misconfiguration:\n${formatError(err)}`
				);
			}

			throw new UserError(`Error creating application:\n${formatError(err)}`);
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
					`Unexpected error modifying application "${action.name}": ${err.message}`
				);
			}

			if (err.status === 400) {
				throw new UserError(
					`Error modifying application "${action.name}" due to a misconfiguration:\n\n\t${formatError(err)}`
				);
			}

			throw new UserError(
				`Error modifying application "${action.name}":\n${formatError(err)}`
			);
		}

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
					`Unexpected error rolling out application "${action.name}":\n${err.message}`
				);
			}

			if (err.status === 400) {
				throw new UserError(
					`Error rolling out application "${action.name}" due to a misconfiguration:\n\n\t${formatError(err)}`
				);
			}

			throw new UserError(
				`Error rolling out application "${action.name}":\n${formatError(err)}`
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

/**
 * clean up application object received from API so that we get a nicer diff when comparing it to the current config.
 */
export function cleanApplicationFromAPI(
	prev: Application,
	currentConfig: ContainerNormalizedConfig,
	accountId: string
): Partial<ModifyApplicationRequestBody> & Pick<Application, "configuration"> {
	const cleanedPreviousApp: Partial<ModifyApplicationRequestBody> &
		Pick<Application, "configuration"> = {
		configuration: {
			...prev.configuration,
			image: resolveImageName(accountId, prev.configuration.image),
		},
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
		if (!instance_type) {
			// just leave as is if we can't infer the instance type
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
