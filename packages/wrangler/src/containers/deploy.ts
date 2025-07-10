/**
 * Note! much of this is copied and modified from cloudchamber/apply.ts
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
import { bold, brandColor, dim, green, red } from "@cloudflare/cli/colors";
import {
	ApiError,
	ApplicationsService,
	CreateApplicationRolloutRequest,
	DeploymentMutationError,
	resolveImageName,
	RolloutsService,
} from "@cloudflare/containers-shared";
import { buildAndMaybePush } from "../cloudchamber/build";
import {
	cleanForInstanceType,
	fillOpenAPIConfiguration,
	promiseSpinner,
} from "../cloudchamber/common";
import {
	createLine,
	diffLines,
	printLine,
	sortObjectRecursive,
	stripUndefined,
} from "../cloudchamber/helpers/diff";
import { getDockerPath } from "../environment-variables/misc-variables";
import { FatalError, UserError } from "../errors";
import { logger } from "../logger";
import { getAccountId } from "../user";
import { fetchVersion } from "../versions/api";
import { getNormalizedContainerOptions } from "./config";
import { containersScope } from ".";
import type { Result } from "../cloudchamber/helpers/diff";
import type { Config } from "../config";
import type { Observability } from "../config/environment";
import type { ContainerNormalisedConfig } from "./config";
import type {
	Application,
	ApplicationID,
	ApplicationName,
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

/**
 * Converts an existing application from API.listApplications to CreateApplicationRequest. Mostly this just discards unnecessary fields
 */
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
function containerConfigToCreateRequest(
	containerApp: ContainerNormalisedConfig,
	observability: Observability | undefined,
	durable_object_namespace_id: string,
	imageRef: string,
	skipDefaults = false
): CreateApplicationRequest {
	const app: CreateApplicationRequest = {
		name: containerApp.name,
		scheduling_policy: containerApp.scheduling_policy as SchedulingPolicy,
		// setting this in config is deprecated?
		instances: 0,
		max_instances: containerApp.max_instances,
		constraints: {
			...(containerApp.constraints ??
				(!skipDefaults ? { tier: 1 } : undefined)),
			cities: containerApp.constraints?.cities?.map((city) =>
				city.toLowerCase()
			),
			regions: containerApp.constraints?.regions?.map((region) =>
				region.toUpperCase()
			),
		},
		configuration: {
			image: imageRef,
			...("instance_type" in containerApp
				? { instance_type: containerApp.instance_type as InstanceType }
				: { disk: { size_mb: containerApp.disk_size } }),
			// cannot have an existing app if this is a create req
			observability: observabilityToConfiguration(observability, undefined),
		},
		durable_objects: {
			namespace_id: durable_object_namespace_id,
		},
	};
	return app;
}

/**
 * creates or modifies a container application
 */
export async function apply(
	args: {
		skipDefaults: boolean | undefined;
		env?: string;
		/**
		 * If the image was built and pushed, or is a registry link, we have to update the image ref and this will be defined
		 * If it is undefined, the image has not change, and we do not need to update the image ref
		 */
		newImageLink: string | undefined;
		durable_object_namespace_id: string;
	},
	containerConfig: ContainerNormalisedConfig,
	// need some random top level fields
	config: Config
) {
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

	log(dim("Container application changes\n"));

	// TODO: this is not correct right now as there can be multiple applications
	// with the same name.
	/** Previous deployment of this app, if this exists  */
	const prevApp = existingApplications.find(
		(app) => app.name === containerConfig.name
	);
	const accountId = config.account_id || (await getAccountId(config));
	const imageRef = args.newImageLink ?? prevApp?.configuration.image;
	//
	assert(imageRef, "No changes detected but no previous image found");
	const appConfig = containerConfigToCreateRequest(
		containerConfig,
		config.observability,
		args.durable_object_namespace_id,
		resolveImageName(accountId, imageRef),
		args.skipDefaults
	);

	// **************
	// *** MODIFY ***
	// **************

	if (prevApp !== undefined && prevApp !== null) {
		// we need to sort the objects (by key) because the diff algorithm works with lines
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
		} else {
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

export async function maybeBuildContainer(args: {
	containerConfig: ContainerNormalisedConfig;
	/** just the tag component. will be prefixed with the container name */
	imageTag: string;
	dryRun: boolean;
	dockerPath: string;
	configPath: string | undefined;
}): Promise<{ newImageLink: string | undefined }> {
	if ("registry_link" in args.containerConfig) {
		return {
			// We don't know at this point whether the image has changed
			// but we need to make sure API checks so
			// we always set this to the registry link.
			newImageLink: args.containerConfig.registry_link,
		};
	}

	const imageFullName =
		args.containerConfig.name + ":" + args.imageTag.split("-")[0];
	logger.log("Building image", imageFullName);

	const buildResult = await buildAndMaybePush(
		{
			tag: imageFullName,
			pathToDockerfile: args.containerConfig.dockerfile,
			buildContext: args.containerConfig.image_build_context,
			args: args.containerConfig.image_vars,
		},
		args.dockerPath,
		!args.dryRun,
		"disk_size" in args.containerConfig
			? args.containerConfig.disk_size
			: undefined
	);

	if (buildResult.pushed) {
		return { newImageLink: buildResult.image };
	}
	// if the image has not changed, it will not have been pushed
	// so we don't need to update anything when we apply the container config
	return { newImageLink: undefined };
}

export type DeployContainersArgs = {
	versionId: string;
	accountId: string;
	scriptName: string;
	env?: string;
};

export async function deployContainers(
	config: Config,
	{ versionId, accountId, scriptName, env }: DeployContainersArgs
) {
	if (config.containers === undefined || config.containers.length === 0) {
		return;
	}

	await fillOpenAPIConfiguration(config, containersScope);

	const dockerPath = getDockerPath();
	const normalizedContainerConfig = await getNormalizedContainerOptions(config);

	// this is used to find the DOs that are associated with this script
	const version = await fetchVersion(config, accountId, scriptName, versionId);

	for (const container of normalizedContainerConfig) {
		const buildResult = await maybeBuildContainer({
			containerConfig: container,
			imageTag: versionId,
			dryRun: false,
			dockerPath,
			configPath: config.configPath,
		});

		const targetDurableObject = version.resources.bindings.find(
			(durableObject) =>
				durableObject.type === "durable_object_namespace" &&
				durableObject.class_name === container.class_name &&
				// DO cannot be defined in a different script to the container
				durableObject.script_name === undefined &&
				durableObject.namespace_id !== undefined
		);

		if (!targetDurableObject) {
			throw new FatalError(
				"Could not deploy container application as corresponding durable object could not be found"
			);
		}

		assert(
			targetDurableObject.type === "durable_object_namespace" &&
				targetDurableObject.namespace_id !== undefined
		);

		await apply(
			{
				skipDefaults: false,
				env,
				newImageLink: buildResult.newImageLink,
				durable_object_namespace_id: targetDurableObject.namespace_id,
			},
			container,
			config
		);
	}
}

// wrangler config -> config for building or pushing -> api deploy config

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

const renderDiff = (results: Result[]) => {
	let printedLines: string[] = [];
	let printedDiff = false;
	// prints the lines we accumulated to bring context to the edited line
	const printContext = () => {
		let index = 0;
		for (let i = printedLines.length - 1; i >= 0; i--) {
			if (printedLines[i].trim().startsWith("[")) {
				log("");
				index = i;
				break;
			}
		}

		for (let i = index; i < printedLines.length; i++) {
			log(printedLines[i]);
			if (printedLines.length - i > 2) {
				i = printedLines.length - 2;
				printLine(dim("..."), "  ");
			}
		}

		printedLines = [];
	};

	// go line by line and print diff results
	for (const lines of results) {
		const trimmedLines = (lines.value ?? "")
			.split("\n")
			.map((e) => e.trim())
			.filter((e) => e !== "");

		for (const l of trimmedLines) {
			if (lines.added) {
				printContext();
				if (l.startsWith("[")) {
					printLine("");
				}

				printedDiff = true;
				printLine(l, green("+ "));
			} else if (lines.removed) {
				printContext();
				if (l.startsWith("[")) {
					printLine("");
				}

				printedDiff = true;
				printLine(l, red("- "));
			} else {
				// if we had printed a diff before this line, print a little bit more
				// so the user has a bit more context on where the edit happens
				if (printedDiff) {
					let printDots = false;
					if (l.startsWith("[")) {
						printLine("");
						printDots = true;
					}

					printedDiff = false;
					printLine(l, "  ");
					if (printDots) {
						printLine(dim("..."), "  ");
					}
					continue;
				}

				printedLines.push(createLine(l, "  "));
			}
		}
	}
};

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
