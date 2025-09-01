/**
 * Important! You are probably looking for containers/deploy.ts!
 * This is used for cloudchamber apply, but has been duplicated and modified in containers/deploy.ts to deploy containers during wrangler deploy.
 */
import {
	endSection,
	log,
	logRaw,
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
	InstanceType,
	resolveImageName,
	RolloutsService,
	SchedulingPolicy,
} from "@cloudflare/containers-shared";
import { formatConfigSnippet } from "../config";
import { configRolloutStepsToAPI } from "../containers/deploy";
import { FatalError, UserError } from "../errors";
import { getAccountId } from "../user";
import {
	sortObjectRecursive,
	stripUndefined,
} from "../utils/sortObjectRecursive";
import { promiseSpinner } from "./common";
import { Diff } from "./helpers/diff";
import { cleanForInstanceType } from "./instance-type/instance-type";
import type { Config } from "../config";
import type { ContainerApp, Observability } from "../config/environment";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
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
import type { JsonMap } from "@iarna/toml";

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

export function applyCommandOptionalYargs(yargs: CommonYargsArgv) {
	return yargs.option("skip-defaults", {
		requiresArg: true,
		type: "boolean",
		demandOption: false,
		describe: "Skips recommended defaults added by apply",
	});
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

function containerAppToInstanceType(
	containerApp: ContainerApp
): Partial<UserDeploymentConfiguration> {
	let configuration = (containerApp.configuration ??
		{}) as Partial<UserDeploymentConfiguration>;

	if (containerApp.instance_type !== undefined) {
		if (typeof containerApp.instance_type === "string") {
			return { instance_type: containerApp.instance_type as InstanceType };
		}

		configuration = {
			vcpu: containerApp.instance_type.vcpu,
			memory_mib: containerApp.instance_type.memory_mib,
			disk: {
				size_mb: containerApp.instance_type.disk_mb,
			},
		};
	}

	// if no other configuration is set, we fall back to the default "dev" instance type
	if (
		configuration.disk?.size_mb === undefined &&
		configuration.vcpu === undefined &&
		configuration.memory_mib === undefined
	) {
		return { instance_type: InstanceType.DEV };
	}

	return configuration;
}

function containerAppToCreateApplication(
	accountId: string,
	containerApp: ContainerApp,
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
		...instanceType,
		observability: observabilityConfiguration,
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
		configuration: {
			...configuration,
			// De-sugar image name
			image: resolveImageName(accountId, configuration.image),
		},
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

export async function apply(
	args: {
		skipDefaults: boolean | undefined;
		env?: string;
	},
	config: Config
) {
	startSection(
		"Deploy a container application",
		"deploy changes to your application"
	);

	config.containers ??= [];

	if (config.containers.length === 0) {
		endSection(
			"You don't have any container applications defined in your wrangler.toml",
			"You can set the following configuration in your wrangler.toml"
		);
		const configuration = {
			image: "docker.io/cloudflare/hello-world:1.0",
			instances: 2,
			name: config.name ?? "my-containers-application",
			instance_type: "dev",
		};
		const endConfig: JsonMap =
			args.env !== undefined
				? {
						env: { [args.env]: { containers: [configuration] } },
					}
				: { containers: [configuration] };
		formatConfigSnippet(endConfig, config.configPath)
			.split("\n")
			.forEach((el) => logRaw(`    ${el}`));
		return;
	}

	const applications = await promiseSpinner(
		ApplicationsService.listApplications(),
		{ message: "Loading applications" }
	);
	applications.forEach((app) =>
		cleanupObservability(app.configuration.observability)
	);
	const applicationByNames: Record<ApplicationName, Application> = {};
	// TODO: this is not correct right now as there can be multiple applications
	// with the same name.
	for (const application of applications) {
		applicationByNames[application.name] = application;
	}

	const actions: (
		| { action: "create"; application: CreateApplicationRequest }
		| {
				action: "modify";
				application: ModifyApplicationRequestBody;
				id: ApplicationID;
				name: ApplicationName;
				rollout_step_percentage?: number | number[];
				rollout_kind: CreateApplicationRolloutRequest.kind;
		  }
	)[] = [];

	log(dim("Container application changes\n"));

	for (const appConfigNoDefaults of config.containers) {
		appConfigNoDefaults.configuration ??= {};
		appConfigNoDefaults.configuration.image = appConfigNoDefaults.image;
		const application =
			applicationByNames[
				appConfigNoDefaults.name ??
					// we should never actually reach this point, but just in case
					`${config.name}-${appConfigNoDefaults.class_name}`
			];

		const accountId = await getAccountId(config);
		const appConfig = containerAppToCreateApplication(
			accountId,
			appConfigNoDefaults,
			config.observability,
			application,
			args.skipDefaults
		);

		if (application !== undefined && application !== null) {
			// we need to sort the objects (by key) because the diff algorithm works with
			// lines
			const prevApp = sortObjectRecursive<CreateApplicationRequest>(
				stripUndefined(applicationToCreateApplication(accountId, application))
			);

			// fill up fields that their defaults were changed over-time,
			// maintaining retrocompatibility with the existing app
			if (appConfigNoDefaults.scheduling_policy === undefined) {
				appConfig.scheduling_policy = prevApp.scheduling_policy;
			}

			if (
				prevApp.durable_objects !== undefined &&
				appConfigNoDefaults.durable_objects !== undefined &&
				prevApp.durable_objects.namespace_id !==
					appConfigNoDefaults.durable_objects.namespace_id
			) {
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

			const diff = new Diff(prev, now);
			if (diff.changes === 0) {
				updateStatus(`no changes ${brandColor(application.name)}`);
				continue;
			}

			updateStatus(
				`${brandColor.underline("EDIT")} ${application.name}`,
				false
			);

			newline();

			diff.print();

			newline();

			if (appConfigNoDefaults.rollout_kind !== "none") {
				actions.push({
					action: "modify",
					application: createApplicationToModifyApplication(appConfig),
					id: application.id,
					name: application.name,
					rollout_step_percentage:
						application.durable_objects !== undefined
							? appConfigNoDefaults.rollout_step_percentage ?? 25
							: appConfigNoDefaults.rollout_step_percentage,
					rollout_kind:
						appConfigNoDefaults.rollout_kind == "full_manual"
							? CreateApplicationRolloutRequest.kind.FULL_MANUAL
							: CreateApplicationRolloutRequest.kind.FULL_AUTO,
				});
			} else {
				log("Skipping application rollout");
				newline();
			}

			continue;
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

		s.trimEnd()
			.split("\n")
			.forEach((el) => log(`  ${el}`));

		newline();

		const configToPush = { ...appConfig };

		// add to the actions array to create the app later
		actions.push({
			action: "create",
			application: configToPush,
		});
	}

	if (actions.length == 0) {
		endSection("No changes to be made");
		return;
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

			continue;
		}
	}

	newline();

	endSection("Applied changes");
}

/**
 * applyCommand is able to take the wrangler.toml file and render the changes that it
 * detects.
 */
export async function applyCommand(
	args: StrictYargsOptionsToInterface<typeof applyCommandOptionalYargs>,
	config: Config
) {
	return apply(
		{
			skipDefaults: args.skipDefaults,
			env: args.env,
		},
		config
	);
}
