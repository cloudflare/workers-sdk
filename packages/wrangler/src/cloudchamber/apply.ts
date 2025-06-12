import {
	cancel,
	endSection,
	log,
	logRaw,
	shapes,
	startSection,
	success,
	updateStatus,
} from "@cloudflare/cli";
import { processArgument } from "@cloudflare/cli/args";
import { bold, brandColor, dim, green, red } from "@cloudflare/cli/colors";
import {
	ApiError,
	ApplicationsService,
	CreateApplicationRolloutRequest,
	DeploymentMutationError,
	RolloutsService,
	SchedulingPolicy,
} from "@cloudflare/containers-shared";
import { formatConfigSnippet } from "../config";
import { UserError } from "../errors";
import { promiseSpinner } from "./common";
import { diffLines } from "./helpers/diff";
import type { Config } from "../config";
import type { ContainerApp } from "../config/environment";
import type {
	CommonYargsArgvJSON,
	StrictYargsOptionsToInterfaceJSON,
} from "../yargs-types";
import type {
	Application,
	ApplicationID,
	ApplicationName,
	CreateApplicationRequest,
	ModifyApplicationRequestBody,
	ModifyDeploymentV2RequestBody,
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

export function applyCommandOptionalYargs(yargs: CommonYargsArgvJSON) {
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

function containerAppToCreateApplication(
	containerApp: ContainerApp,
	skipDefaults = false
): CreateApplicationRequest {
	const configuration =
		containerApp.configuration as UserDeploymentConfiguration;
	const app: CreateApplicationRequest = {
		...containerApp,
		configuration,
		instances: containerApp.instances ?? 0,
		scheduling_policy:
			(containerApp.scheduling_policy as SchedulingPolicy) ??
			SchedulingPolicy.REGIONAL,
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

	return app;
}

function isNumber(c: string | number) {
	if (typeof c === "number") {
		return true;
	}
	const code = c.charCodeAt(0);
	const zero = "0".charCodeAt(0);
	const nine = "9".charCodeAt(0);
	return code >= zero && code <= nine;
}

/**
 * createLine takes a string and goes through each character, rendering possibly syntax highlighting.
 * Useful to render TOML files.
 */
function createLine(el: string, startWith = ""): string {
	let line = startWith;
	let lastAdded = 0;
	const addToLine = (i: number, color = (s: string) => s) => {
		line += color(el.slice(lastAdded, i));
		lastAdded = i;
	};

	const state = {
		render: "left" as "quotes" | "number" | "left" | "right" | "section",
	};
	for (let i = 0; i < el.length; i++) {
		const current = el[i];
		const peek = i + 1 < el.length ? el[i + 1] : null;
		const prev = i === 0 ? null : el[i - 1];

		switch (state.render) {
			case "left":
				if (current === "=") {
					state.render = "right";
				}

				break;
			case "right":
				if (current === '"') {
					addToLine(i);
					state.render = "quotes";
					break;
				}

				if (isNumber(current)) {
					addToLine(i);
					state.render = "number";
					break;
				}

				if (current === "[" && peek === "[") {
					state.render = "section";
				}

				break;
			case "quotes":
				if (current === '"') {
					addToLine(i + 1, brandColor);
					state.render = "right";
				}

				break;
			case "number":
				if (!isNumber(el)) {
					addToLine(i, red);
					state.render = "right";
				}

				break;
			case "section":
				if (current === "]" && prev === "]") {
					addToLine(i + 1);
					state.render = "right";
				}
		}
	}

	switch (state.render) {
		case "left":
			addToLine(el.length);
			break;
		case "right":
			addToLine(el.length);
			break;
		case "quotes":
			addToLine(el.length, brandColor);
			break;
		case "number":
			addToLine(el.length, red);
			break;
		case "section":
			// might be unreachable
			addToLine(el.length, bold);
			break;
	}

	return line;
}

/**
 * printLine takes a line and prints it by using createLine and use printFunc
 */
function printLine(el: string, startWith = "", printFunc = log) {
	printFunc(createLine(el, startWith));
}

/**
 * Removes from the object every undefined property
 */
function stripUndefined<T = Record<string, unknown>>(r: T): T {
	for (const k in r) {
		if (r[k] === undefined) {
			delete r[k];
		}
	}

	return r;
}

/**
 * Take an object and sort its keys in alphabetical order.
 */
function sortObjectKeys(unordered: Record<string | number, unknown>) {
	if (Array.isArray(unordered)) {
		return unordered;
	}

	return Object.keys(unordered)
		.sort()
		.reduce(
			(obj, key) => {
				obj[key] = unordered[key];
				return obj;
			},
			{} as Record<string, unknown>
		);
}

/**
 * Take an object and sort its keys in alphabetical order recursively.
 * Useful to normalize objects so they can be compared when rendered.
 * It will copy the object and not mutate it.
 */
function sortObjectRecursive<T = Record<string | number, unknown>>(
	object: Record<string | number, unknown> | Record<string | number, unknown>[]
): T {
	if (typeof object !== "object") {
		return object;
	}

	if (Array.isArray(object)) {
		return object.map((obj) => sortObjectRecursive(obj)) as T;
	}

	const objectCopy: Record<string | number, unknown> = { ...object };
	for (const [key, value] of Object.entries(object)) {
		if (typeof value === "object") {
			if (value === null) {
				continue;
			}
			objectCopy[key] = sortObjectRecursive(
				value as Record<string, unknown>
			) as unknown;
		}
	}

	return sortObjectKeys(objectCopy) as T;
}

export async function apply(
	args: { skipDefaults: boolean | undefined; json: boolean; env?: string },
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
		};
		const endConfig: JsonMap =
			args.env !== undefined
				? {
						env: { [args.env]: { containers: [configuration] } },
					}
				: { containers: [configuration] };
		formatConfigSnippet(endConfig, config.configPath)
			.split("\n")
			.forEach((el) => {
				printLine(el, "  ", logRaw);
			});
		return;
	}

	const applications = await promiseSpinner(
		ApplicationsService.listApplications(),
		{ json: args.json, message: "Loading applications" }
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
				rollout_step_percentage?: number;
				rollout_kind: CreateApplicationRolloutRequest.kind;
		  }
	)[] = [];

	// TODO: JSON formatting is a bit bad due to the trimming.
	// Try to do a conditional on `configFormat`

	log(dim("Container application changes\n"));

	for (const appConfigNoDefaults of config.containers) {
		const appConfig = containerAppToCreateApplication(
			appConfigNoDefaults,
			args.skipDefaults
		);

		const application = applicationByNames[appConfig.name];
		if (application !== undefined && application !== null) {
			// we need to sort the objects (by key) because the diff algorithm works with
			// lines
			const prevApp = sortObjectRecursive<CreateApplicationRequest>(
				stripUndefined(applicationToCreateApplication(application))
			);

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

			const prev = formatConfigSnippet(
				{ containers: [prevApp as ContainerApp] },
				config.configPath
			);

			const now = formatConfigSnippet(
				{
					containers: [
						mergeDeep(
							prevApp,
							sortObjectRecursive<CreateApplicationRequest>(appConfig)
						) as ContainerApp,
					],
				},
				config.configPath
			);
			const results = diffLines(prev, now);
			const changes = results.find((l) => l.added || l.removed) !== undefined;
			if (!changes) {
				updateStatus(`no changes ${brandColor(application.name)}`);
				continue;
			}

			updateStatus(
				`${brandColor.underline("EDIT")} ${application.name}`,
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
			}

			printLine("");
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

		// go line by line and pretty print it
		s.split("\n")
			.map((line) => line.trim())
			.forEach((el) => {
				printLine(el, "  ");
			});

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

	const yes = await processArgument<boolean>(
		{ confirm: args.json ? true : undefined },
		"confirm",
		{
			type: "confirm",
			question: "Do you want to apply these changes?",
			label: "",
		}
	);
	if (!yes) {
		cancel("Not applying changes");
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

		return `  ${err.body.error}`;
	}

	for (const action of actions) {
		if (action.action === "create") {
			let application: Application;
			try {
				application = await promiseSpinner(
					ApplicationsService.createApplication(action.application),
					{ json: args.json, message: `creating ${action.application.name}` }
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
						configuration: undefined,
					})
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
							json: args.json,
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

/**
 * applyCommand is able to take the wrangler.toml file and render the changes that it
 * detects.
 */
export async function applyCommand(
	args: StrictYargsOptionsToInterfaceJSON<typeof applyCommandOptionalYargs>,
	config: Config
) {
	return apply(
		{ skipDefaults: args.skipDefaults, env: args.env, json: args.json },
		config
	);
}
