/**
 * Note! much of this is copied and modified from cloudchamber/apply.ts
 */

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
	getCloudflareContainerRegistry,
	InstanceType,
	RolloutsService,
	SchedulingPolicy,
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
import { formatConfigSnippet } from "../config";
import { getDockerPath } from "../environment-variables/misc-variables";
import { FatalError, UserError } from "../errors";
import { logger } from "../logger";
import { getAccountId } from "../user";
import { fetchVersion } from "../versions/api";
import { getNormalizedContainerOptions } from "./config";
import { containersScope } from ".";
import type { Config } from "../config";
import type { ContainerApp, Observability } from "../config/environment";
import type { ContainerNormalisedConfig } from "./config";
import type {
	Application,
	ApplicationID,
	ApplicationName,
	CreateApplicationRequest,
	ModifyApplicationRequestBody,
	ModifyDeploymentV2RequestBody,
	Observability as ObservabilityConfiguration,
	UserDeploymentConfiguration,
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
	application: Application
): CreateApplicationRequest {
	const app: CreateApplicationRequest = {
		configuration: application.configuration,
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

function containerAppToInstanceType(
	containerApp: ContainerApp
): InstanceType | undefined {
	if (containerApp.instance_type !== undefined) {
		return containerApp.instance_type as InstanceType;
	}

	// if no other configuration is set, we fall back to the default "dev" instance type
	const configuration =
		containerApp.configuration as UserDeploymentConfiguration;
	if (
		configuration.disk === undefined &&
		configuration.vcpu === undefined &&
		configuration.memory === undefined &&
		configuration.memory_mib === undefined
	) {
		return InstanceType.DEV;
	}
}

function containerAppToCreateApplication(
	containerApp: ContainerNormalisedConfig,
	observability: Observability | undefined,
	existingApp: Application | undefined,
	skipDefaults = false
): CreateApplicationRequest {
	const observabilityConfiguration = observabilityToConfiguration(
		observability,
		existingApp?.configuration.observability
	);
	const instanceType = containerAppToInstanceType(containerApp);
	const configuration: UserDeploymentConfiguration = {
		...(containerApp.configuration as UserDeploymentConfiguration),
		observability: observabilityConfiguration,
		instance_type: instanceType,
	};

	// this should have been set to a default value of worker-name-class-name if unspecified by the user
	if (containerApp.name === undefined) {
		throw new FatalError("Container application name failed to be set", 1, {
			telemetryMessage: true,
		});
	}
	const app: CreateApplicationRequest = {
		...containerApp,
		name: containerApp.name,
		configuration,
		instances: containerApp.instances ?? 0,
		scheduling_policy:
			(containerApp.scheduling_policy as SchedulingPolicy) ??
			SchedulingPolicy.DEFAULT,
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
	};

	// delete the fields that should not be sent to API
	delete (app as Record<string, unknown>)["class_name"];
	delete (app as Record<string, unknown>)["image"];
	delete (app as Record<string, unknown>)["image_build_context"];
	delete (app as Record<string, unknown>)["image_vars"];
	delete (app as Record<string, unknown>)["rollout_step_percentage"];
	delete (app as Record<string, unknown>)["rollout_kind"];
	delete (app as Record<string, unknown>)["instance_type"];

	return app;
}

// Resolve an image name to the full unambiguous name.
//
// For now, this only converts images stored in the managed registry to contain
// the user's account ID in the path.
async function resolveImageName(
	config: Config,
	image: string
): Promise<string> {
	let url: URL;
	try {
		url = new URL(`http://${image}`);
	} catch (_) {
		return image;
	}

	if (url.hostname !== getCloudflareContainerRegistry()) {
		return image;
	}

	const accountId = config.account_id || (await getAccountId(config));
	if (url.pathname.startsWith(`/${accountId}`)) {
		return image;
	}

	return `${url.hostname}/${accountId}${url.pathname}`;
}

export async function apply(
	args: {
		skipDefaults: boolean | undefined;
		env?: string;
		imageUpdateRequired?: boolean;
	},
	containerConfig: ContainerNormalisedConfig,
	newImageLink: string | undefined,
	// need some random top level fields
	config: Config,
	durable_object_namespace_id: string | undefined
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
	const existingAppsByName: Record<ApplicationName, Application> = {};
	// TODO: this is not correct right now as there can be multiple applications
	// with the same name.
	for (const application of existingApplications) {
		existingAppsByName[application.name] = application;
	}

	const actions: (
		| { action: "create"; application: CreateApplicationRequest }
		| {
				action: "modify";
				application: ModifyApplicationRequestBody;
				id: ApplicationID;
				name: ApplicationName;
				rollout_step_percentage?: number;
				rollout_kind: CreateApplicationRolloutRequest.kind;
		  }
	)[] = [];

	// TODO: JSON formatting is a bit bad due to the trimming.
	// Try to do a conditional on `configFormat`

	log(dim("Container application changes\n"));

	const existingApp = existingAppsByName[containerConfig.name];

	// TODO copy over image link
	if (!args.imageUpdateRequired && existingApp) {
		// deployConfig.image = existingAppConfig.configuration.image;
	}

	const appConfig = containerAppToCreateApplication(
		containerConfig,
		config.observability,
		existingApp,
		args.skipDefaults
	);

	// MODIFY
	if (existingApp !== undefined && existingApp !== null) {
		// we need to sort the objects (by key) because the diff algorithm works with
		// lines
		const prevApp = sortObjectRecursive<CreateApplicationRequest>(
			stripUndefined(applicationToCreateApplication(existingApp))
		);

		// fill up fields that their defaults were changed over-time,
		// maintaining retrocompatibility with the existing app
		if (containerConfig.scheduling_policy === undefined) {
			appConfig.scheduling_policy = prevApp.scheduling_policy;
		}

		if (!prevApp.durable_objects?.namespace_id) {
			throw new FatalError("dunno this should not happen?");
		}
		if (prevApp.durable_objects.namespace_id !== durable_object_namespace_id) {
			throw new UserError(
				`Application "${prevApp.name}" is assigned to durable object ${prevApp.durable_objects.namespace_id}, but a new DO namespace is being assigned to the application,
					you should delete the container application and deploy again`
			);
		}

		const prevContainer =
			appConfig.configuration.instance_type !== undefined
				? cleanForInstanceType(prevApp)
				: (prevApp as ContainerApp);
		const nowContainer = mergeDeep(
			prevContainer as CreateApplicationRequest,
			sortObjectRecursive<CreateApplicationRequest>(appConfig)
		) as ContainerApp;

		const prev = formatConfigSnippet(
			{ containers: [prevContainer] },
			config.configPath
		);

		const now = formatConfigSnippet(
			{ containers: [nowContainer] },
			config.configPath
		);
		const results = diffLines(prev, now);
		const changes = results.find((l) => l.added || l.removed) !== undefined;
		if (!changes) {
			updateStatus(`no changes ${brandColor(existingApp.name)}`);
		} else {
			updateStatus(
				`${brandColor.underline("EDIT")} ${existingApp.name}`,
				false
			);

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

			if (containerConfig.rollout_kind !== "none") {
				actions.push({
					action: "modify",
					application: createApplicationToModifyApplication(appConfig),
					id: existingApp.id,
					name: existingApp.name,
					rollout_step_percentage:
						existingApp.durable_objects !== undefined
							? containerConfig.rollout_step_percentage ?? 25
							: containerConfig.rollout_step_percentage,
					rollout_kind:
						containerConfig.rollout_kind == "full_manual"
							? CreateApplicationRolloutRequest.kind.FULL_MANUAL
							: CreateApplicationRolloutRequest.kind.FULL_AUTO,
				});
			} else {
				log("Skipping application rollout");
			}

			printLine("");
		}
	}

	// print the header of the app
	updateStatus(bold.underline(green.underline("NEW")) + ` ${appConfig.name}`);

	const s = formatConfigSnippet(
		{
			containers: [
				{
					...appConfig,
					instances:
						appConfig.max_instances !== undefined
							? // trick until we allow setting instances to undefined in the API
								undefined
							: appConfig.instances,
				} as ContainerApp,
			],
		},
		config.configPath
	);

	// go line by line and pretty print it
	s.split("\n")
		.map((line) => line.trim())
		.forEach((el) => {
			printLine(el, "  ");
		});

	const configToPush = {
		...appConfig,

		configuration: {
			...appConfig.configuration,

			// De-sugar image name. We do it here so that the user
			// sees the simplified image name in diffs.
			image: await resolveImageName(config, appConfig.configuration.image),
		},
	};

	// add to the actions array to create the app later
	actions.push({
		action: "create",
		application: configToPush,
	});

	if (actions.length == 0) {
		endSection("No changes to be made");
		return;
	}

	for (const action of actions) {
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

			printLine("");
			continue;
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

			printLine("");
			continue;
		}
	}

	endSection("Applied changes");
}

export async function maybeBuildContainer(args: {
	containerConfig: ContainerNormalisedConfig;
	/** just the tag component. will be prefixed with the container name */
	imageTag: string;
	dryRun: boolean;
	dockerPath: string;
	configPath: string | undefined;
}): Promise<{ image: string; imageUpdated: boolean }> {
	try {
		if ("registry_link" in args.containerConfig) {
			return {
				image: args.containerConfig.registry_link,
				// We don't know at this point whether the image was updated or not
				// but we need to make sure downstream checks if it was updated so
				// we set this to true.
				imageUpdated: true,
			};
		}
	} catch (err) {
		if (err instanceof Error) {
			throw new UserError(err.message);
		}
		throw err;
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

	return { image: buildResult.image, imageUpdated: buildResult.pushed };
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
	for (const container of normalizedContainerConfig) {
		const buildResult = await maybeBuildContainer({
			containerConfig: container,
			imageTag: versionId,
			dryRun: false,
			dockerPath,
			configPath: config.configPath,
		});
		const newImageLink = buildResult.image;

		// then we also want to get the DO namespace id
		const version = await fetchVersion(
			config,
			accountId,
			scriptName,
			versionId
		);
		const targetDurableObject = version.resources.bindings.find(
			(durableObject) =>
				durableObject.type === "durable_object_namespace" &&
				durableObject.class_name === container.class_name &&
				durableObject.script_name === undefined &&
				durableObject.namespace_id !== undefined
		);

		if (!targetDurableObject) {
			throw new UserError(
				"Could not deploy container application as durable object was not found in list of bindings"
			);
		}

		if (
			targetDurableObject.type !== "durable_object_namespace" ||
			targetDurableObject.namespace_id === undefined
		) {
			throw new Error("unreachable");
		}

		await apply(
			{
				skipDefaults: false,
				env,
				imageUpdateRequired: buildResult.imageUpdated,
			},
			container,
			newImageLink,
			config,
			targetDurableObject.namespace_id
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
