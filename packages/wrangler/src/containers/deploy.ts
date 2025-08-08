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
	};
}

export async function apply(
	args: {
		imageUpdateRequired?: boolean;
		/**
		 * If the image was built and pushed, or is a registry link, we have to update the image ref and this will be defined
		 * If it is undefined, the image has not changed, and we do not need to update the image ref
		 */
		newImageLink: string | undefined;
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

	log(dim("Container application changes\n"));

	const accountId = config.account_id || (await getAccountId(config));
	const imageRef = args.newImageLink ?? prevApp?.configuration.image;

	// image ref is undefined if the image is a dockerfile and has not changed since the last deploy
	// if image ref is undefined and there is no previous app, something weird has happened.
	assert(imageRef, "No changes detected but no previous image found");

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
				ApplicationsService.modifyApplication(action.id, action.application),
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
						target_configuration: action.application.configuration ?? {},
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
