/**
 * Note! Much of this is copied and modified from cloudchamber/apply.ts
 * However this code is only used for containers interactions, not cloudchamber ones!
 */
import assert from "assert";
import {
	endSection,
	log,
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
	DeploymentMutationError,
	resolveImageName,
	RolloutsService,
} from "@cloudflare/containers-shared";
import { cleanForInstanceType, promiseSpinner } from "../cloudchamber/common";
import {
	diffLines,
	printLine,
	renderDiff,
	sortObjectRecursive,
	stripUndefined,
} from "../cloudchamber/helpers/diff";
import { FatalError, UserError } from "../errors";
import { getAccountId } from "../user";
import type { Config } from "../config";
import type { Observability } from "../config/environment";
import type {
	Application,
	ApplicationID,
	ApplicationName,
	ContainerNormalisedConfig,
	CreateApplicationRequest,
	InstanceType,
	ModifyApplicationRequestBody,
	ModifyDeploymentV2RequestBody,
	Observability as ObservabilityConfiguration,
	SchedulingPolicy,
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
		instances: req.max_instances !== undefined ? 0 : req.instances,
		max_instances: req.max_instances,
		constraints: req.constraints,
		affinities: req.affinities,
		scheduling_policy: req.scheduling_policy,
	};
}

function applicationToCreateApplication(
	accountId: string,
	application: Application
): CreateApplicationRequest {
	const app: CreateApplicationRequest = {
		configuration: {
			...application.configuration,
			image: resolveImageName(accountId, application.configuration.image),
		},
		constraints: application.constraints,
		max_instances: application.max_instances,
		name: application.name,
		scheduling_policy: application.scheduling_policy,
		affinities: application.affinities,
		instances:
			application.max_instances !== undefined ? 0 : application.instances,
		jobs: application.jobs ? true : undefined,
		durable_objects: application.durable_objects,
	};
	return app;
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

function observabilityToConfiguration(
	observability: Observability | undefined,
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

	const observabilityLogsEnabled =
		observability?.logs?.enabled === true ||
		(observability?.enabled === true && observability?.logs?.enabled !== false);
	const logsAlreadyEnabled = existingObservabilityConfig?.logs?.enabled;

	if (observabilityLogsEnabled) {
		return { logs: { enabled: true } };
	} else {
		if (logsAlreadyEnabled === undefined) {
			return undefined;
		} else {
			return { logs: { enabled: false } };
		}
	}
}

/**
 *
 * Turns the normalised container config from wrangler config into
 * a CreateApplicationRequest that can be sent to the API.
 * If we want to modify instead, the ModifyRequestBody is a subset of this
 *
 */
function containerConfigToCreateApplication(
	accountId: string,
	containerApp: ContainerNormalisedConfig,
	observability: Observability | undefined,
	durable_object_namespace_id: string,
	imageRef: string
): CreateApplicationRequest {
	const app: CreateApplicationRequest = {
		name: containerApp.name,
		scheduling_policy: containerApp.scheduling_policy as SchedulingPolicy,

		configuration: {
			// De-sugar image name
			image: resolveImageName(accountId, imageRef),
			...("instance_type" in containerApp
				? { instance_type: containerApp.instance_type as InstanceType }
				: { disk: { size_mb: containerApp.disk_size } }),
			// cannot have an existing app if this is a create req
			observability: observabilityToConfiguration(observability, undefined),
		},
		// instances: containerApp.instances ?? 0,
		instances: 0,
		max_instances: containerApp.max_instances,
		constraints: {
			...(containerApp.constraints ?? { tier: 1 }),
			cities: containerApp.constraints?.cities?.map((city) =>
				city.toLowerCase()
			),
			regions: containerApp.constraints?.regions?.map((region) =>
				region.toUpperCase()
			),
		},
		durable_objects: {
			namespace_id: durable_object_namespace_id,
		},
		// other fields?
		// jobs?
		// affinities?: ApplicationAffinities;
		// priorities?: ApplicationPriorities;
	};

	return app;
}

export async function apply(
	args: {
		imageUpdateRequired?: boolean;
		/**
		 * If the image was built and pushed, or is a registry link, we have to update the image ref and this will be defined
		 * If it is undefined, the image has not change, and we do not need to update the image ref
		 */
		newImageLink: string | undefined;
		durable_object_namespace_id: string;
	},
	containerConfig: ContainerNormalisedConfig,
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

	// TODO: JSON formatting is a bit bad due to the trimming.
	// Try to do a conditional on `configFormat`

	log(dim("Container application changes\n"));

	const accountId = config.account_id || (await getAccountId(config));
	const imageRef = args.newImageLink ?? prevApp?.configuration.image;
	assert(imageRef, "No changes detected but no previous image found");
	const appConfig = containerConfigToCreateApplication(
		accountId,
		containerConfig,
		config.observability,
		args.durable_object_namespace_id,
		imageRef
	);

	if (prevApp !== undefined && prevApp !== null) {
		// we need to sort the objects (by key) because the diff algorithm works with
		// lines
		const normalisedPrevApp = sortObjectRecursive<CreateApplicationRequest>(
			stripUndefined(applicationToCreateApplication(accountId, prevApp))
		);

		if (!normalisedPrevApp.durable_objects?.namespace_id) {
			throw new FatalError(
				"The previous deploy of this container application was not associated with a durable object"
			);
		}
		if (
			normalisedPrevApp.durable_objects.namespace_id !==
			args.durable_object_namespace_id
		) {
			throw new UserError(
				`Application "${normalisedPrevApp.name}" is assigned to durable object ${normalisedPrevApp.durable_objects.namespace_id}, but a new DO namespace is being assigned to the application,
					you should delete the container application and deploy again`
			);
		}
		// i am not entirely sure this does anything?
		const prevContainer = appConfig.configuration.instance_type
			? cleanForInstanceType(normalisedPrevApp)
			: normalisedPrevApp;
		const nowContainer = mergeDeep(
			prevContainer,
			sortObjectRecursive<CreateApplicationRequest>(appConfig)
		);

		const prev = JSON.stringify({ containers: [normalisedPrevApp] });
		const now = JSON.stringify({ containers: [nowContainer] });

		const results = diffLines(prev, now);
		const changes = results.find((l) => l.added || l.removed) !== undefined;

		if (!changes) {
			updateStatus(`no changes ${brandColor(prevApp.name)}`);
		}

		updateStatus(`${brandColor.underline("EDIT")} ${prevApp.name}`, false);

		renderDiff(results);

		if (containerConfig.rollout_kind !== "none") {
			await doAction({
				action: "modify",
				application: createApplicationToModifyApplication(appConfig),
				id: prevApp.id,
				name: prevApp.name,
				rollout_step_percentage:
					prevApp.durable_objects !== undefined
						? containerConfig.rollout_step_percentage
						: containerConfig.rollout_step_percentage,
				rollout_kind:
					containerConfig.rollout_kind == "full_manual"
						? CreateApplicationRolloutRequest.kind.FULL_MANUAL
						: CreateApplicationRolloutRequest.kind.FULL_AUTO,
			});
		} else {
			log("Skipping application rollout");
		}
	} else {
		// **************
		// *** CREATE ***
		// **************

		// print the header of the app
		updateStatus(bold.underline(green.underline("NEW")) + ` ${appConfig.name}`);

		const configStr = JSON.stringify({ containers: [appConfig] }, null, 2);

		// go line by line and pretty print it
		configStr
			.split("\n")
			.map((line) => line.trim())
			.forEach((el) => {
				printLine(el, "  ");
			});

		// add to the actions array to create the app later
		await doAction({
			action: "create",
			application: appConfig,
		});
	}
	printLine("");
	endSection("Applied changes");
}

function formatError(err: ApiError): string {
	// TODO: this is bad bad. Please fix like we do in create.ts.
	// On Cloudchamber API side, we have to improve as well the object validation errors,
	// so we can detect them here better and pinpoint to the user what's going on.
	if (
		err.body.error === DeploymentMutationError.VALIDATE_INPUT &&
		err.body.details !== undefined
	) {
		let message = "";
		for (const key in err.body.details) {
			message += `  ${brandColor(key)} ${err.body.details[key]}\n`;
		}

		return message;
	}

	if (err.body.error !== undefined) {
		return `  ${err.body.error}`;
	}

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
				rollout_step_percentage?: number;
				rollout_kind: CreateApplicationRolloutRequest.kind;
		  }
) => {
	if (action.action === "create") {
		let application: Application;
		try {
			application = await promiseSpinner(
				ApplicationsService.createApplication(action.application),
				{ message: `Creating ${action.application.name}` }
			);
		} catch (err) {
			if (!(err instanceof Error)) {
				throw err;
			}

			if (!(err instanceof ApiError)) {
				throw new UserError(
					`Unexpected error creating application: ${err.message}`
				);
			}

			if (err.status === 400) {
				throw new UserError(
					`Error creating application due to a misconfiguration\n${formatError(err)}`
				);
			}

			throw new UserError(
				`Error creating application due to an internal error (request id: ${err.body.request_id}):\n${formatError(err)}`
			);
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
				ApplicationsService.modifyApplication(action.id, {
					...action.application,
					instances:
						action.application.max_instances !== undefined
							? undefined
							: action.application.instances,
				}),
				{ message: `Modifying ${action.application.name}` }
			);
		} catch (err) {
			if (!(err instanceof Error)) {
				throw err;
			}

			if (!(err instanceof ApiError)) {
				throw new UserError(
					`Unexpected error modifying application ${action.name}: ${err.message}`
				);
			}

			if (err.status === 400) {
				throw new UserError(
					`Error modifying application ${action.name} due to a misconfiguration:\n\n\t${formatError(err)}`
				);
			}

			throw new UserError(
				`Error modifying application ${action.name} due to an internal error (request id: ${err.body.request_id}):\n${formatError(err)}`
			);
		}

		if (action.rollout_step_percentage !== undefined) {
			try {
				await promiseSpinner(
					RolloutsService.createApplicationRollout(action.id, {
						description: "Progressive update",
						strategy: CreateApplicationRolloutRequest.strategy.ROLLING,
						target_configuration:
							(action.application
								.configuration as ModifyDeploymentV2RequestBody) ?? {},
						step_percentage: action.rollout_step_percentage,
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
						`Unexpected error rolling out application ${action.name}:\n${err.message}`
					);
				}

				if (err.status === 400) {
					throw new UserError(
						`Error rolling out application ${action.name} due to a misconfiguration:\n\n\t${formatError(err)}`
					);
				}

				throw new UserError(
					`Error rolling out application ${action.name} due to an internal error (request id: ${err.body.request_id}): ${formatError(err)}`
				);
			}
		}

		success(`Modified application ${brandColor(action.name)}`, {
			shape: shapes.bar,
		});
	}
	printLine("");
};
