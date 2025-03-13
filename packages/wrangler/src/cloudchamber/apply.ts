import {
	cancel,
	crash,
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
import { formatConfigSnippet } from "../config";
import {
	ApiError,
	ApplicationsService,
	DeploymentMutationError,
	SchedulingPolicy,
} from "./client";
import { promiseSpinner } from "./common";
import { diffLines } from "./helpers/diff";
import { wrap } from "./helpers/wrap";
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
	UserDeploymentConfiguration,
} from "./client";
import type { JsonMap } from "@iarna/toml";

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
		instances: req.instances,
		constraints: req.constraints,
		affinities: req.affinities,
		scheduling_policy: req.scheduling_policy,
	};
}

function applicationToCreateApplication(
	application: Application
): CreateApplicationRequest {
	return {
		configuration: application.configuration,
		constraints: application.constraints,
		name: application.name,
		scheduling_policy: application.scheduling_policy,
		affinities: application.affinities,
		instances: application.instances,
		jobs: application.jobs ? true : undefined,
	};
}

function containerAppToCreateApplication(
	containerApp: ContainerApp,
	skipDefaults = false
): CreateApplicationRequest {
	const configuration =
		containerApp.configuration as UserDeploymentConfiguration;
	return {
		...containerApp,
		configuration,
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

/**
 * applyCommand is able to take the wrangler.toml file and render the changes that it
 * detects.
 */
export async function applyCommand(
	args: StrictYargsOptionsToInterfaceJSON<typeof applyCommandOptionalYargs>,
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

		delete (appConfig as Record<string, unknown>)["class_name"];

		const application = applicationByNames[appConfig.name];
		if (application !== undefined && application !== null) {
			// we need to sort the objects (by key) because the diff algorithm works with
			// lines
			const prevApp = sortObjectRecursive<CreateApplicationRequest>(
				stripUndefined(applicationToCreateApplication(application))
			);

			const prev = formatConfigSnippet(
				{ containers: [prevApp as ContainerApp] },
				config.configPath
			);
			const now = formatConfigSnippet(
				{
					containers: [
						sortObjectRecursive<CreateApplicationRequest>(
							appConfig
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

			actions.push({
				action: "modify",
				application: createApplicationToModifyApplication(appConfig),
				id: application.id,
				name: application.name,
			});

			printLine("");
			continue;
		}

		// print the header of the app
		updateStatus(bold.underline(green.underline("NEW")) + ` ${appConfig.name}`);

		const s = formatConfigSnippet(
			{ containers: [appConfig as ContainerApp] },
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
			const [_result, err] = await wrap(
				promiseSpinner(
					ApplicationsService.createApplication(action.application),
					{ json: args.json, message: `creating ${action.application.name}` }
				)
			);
			if (err !== null) {
				if (!(err instanceof ApiError)) {
					crash(`Unexpected error creating application: ${err.message}`);
				}

				if (err.status === 400) {
					crash(
						`Error creating application due to a misconfiguration\n${formatError(err)}`
					);
				}

				crash(
					`Error creating application due to an internal error (request id: ${err.body.request_id}): ${formatError(err)}`
				);
			}

			success(`Created application ${brandColor(action.application.name)}`, {
				shape: shapes.bar,
			});
			printLine("");
			continue;
		}

		if (action.action === "modify") {
			const [_result, err] = await wrap(
				promiseSpinner(
					ApplicationsService.modifyApplication(action.id, action.application),
					{
						json: args.json,
						message: `modifying application ${action.name}`,
					}
				)
			);
			if (err !== null) {
				if (!(err instanceof ApiError)) {
					crash(
						`Unexpected error modifying application ${action.name}: ${err.message}`
					);
				}

				if (err.status === 400) {
					crash(
						`Error modifying application ${action.name} due to a ${brandColor.underline("misconfiguration")}\n\n\t${formatError(err)}`
					);
				}

				crash(
					`Error modifying application ${action.name} due to an internal error (request id: ${err.body.request_id}): ${formatError(err)}`
				);
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
