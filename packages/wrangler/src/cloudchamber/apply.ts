import { isArray } from "util";
import {
	cancel,
	crash,
	endSection,
	log,
	shapes,
	startSection,
	success,
	updateStatus,
} from "@cloudflare/cli";
import { processArgument } from "@cloudflare/cli/args";
import { bold, brandColor, dim, red } from "@cloudflare/cli/colors";
import TOML from "@iarna/toml";
import diff from "deep-diff";
import { Config } from "../config";
import {
	CommonYargsArgvJSON,
	StrictYargsOptionsToInterfaceJSON,
} from "../yargs-types";
import {
	ApiError,
	Application,
	ApplicationID,
	ApplicationName,
	ApplicationsService,
	CreateApplicationRequest,
	DeploymentMutationError,
	ModifyApplicationRequestBody,
} from "./client";
import { promiseSpinner } from "./common";
import { wrap } from "./helpers/wrap";
import type { JsonMap } from "@iarna/toml";

export function applyCommandOptionalYargs(yargs: CommonYargsArgvJSON) {
	return yargs;
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

function isNumber(c: string | number) {
	if (typeof c === "number") return true;
	const code = c.charCodeAt(0);
	const zero = "0".charCodeAt(0);
	const nine = "9".charCodeAt(0);
	return code >= zero && code <= nine;
}

function printLine(el: string, startWith = "") {
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

	log(line);
}

// TODO: has to do it recursively. But we can get away without doing that.
function stripUndefined<T = Record<string, unknown>>(r: T): T {
	for (const k in r) {
		if (r[k] === undefined) {
			delete r[k];
		}
	}

	return r;
}

function normalizeApplicationLists(
	application: CreateApplicationRequest
): CreateApplicationRequest {
	application.configuration?.labels?.sort((labelA, labelB) =>
		labelA.name.localeCompare(labelB.name)
	);
	application.configuration?.ssh_public_key_ids?.sort((keyA, keyB) =>
		keyA.localeCompare(keyB)
	);
	application.configuration?.secrets?.sort((secretA, secretB) =>
		secretA.name.localeCompare(secretB.name)
	);
	application.configuration?.ports?.sort((portA, portB) =>
		portA.name.localeCompare(portB.name)
	);
	application.configuration?.environment_variables?.sort((envA, envB) =>
		envA.name.localeCompare(envB.name)
	);
	return application;
}

function getPathValue(
	obj: unknown,
	path: (string | number)[]
): unknown | undefined {
	return path.reduce(
		(acc, key) =>
			acc !== undefined && acc !== null
				? acc[key as keyof typeof acc]
				: undefined,
		obj
	);
}

export async function applyCommand(
	args: StrictYargsOptionsToInterfaceJSON<typeof applyCommandOptionalYargs>,
	config: Config
) {
	startSection(
		"Deploy a container application",
		"deploy all the changes of you application"
	);

	const environment = args.env;
	if (config.container_app.length === 0) {
		endSection(
			"You don't have any container applications defined in your wrangler.toml",
			"You can create one with\n\t" +
				brandColor(
					`[[${environment !== undefined ? "env." + environment + "." : ""}container_app]]`
				)
		);
		return;
	}

	const applications = await promiseSpinner(
		ApplicationsService.listApplications(),
		{ json: args.json, message: "loading applications" }
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
		  }
	)[] = [];

	log(dim("Container application changes\n"));

	for (const appConfig of config.container_app) {
		const application = applicationByNames[appConfig.name];
		if (application !== undefined && application !== null) {
			const prevApplication = stripUndefined(
				applicationToCreateApplication(application)
			);
			const differences = diff(
				prevApplication,
				stripUndefined(normalizeApplicationLists(appConfig))
			);

			if (differences === undefined) {
				endSection("No changes to be made");
				return;
			}

			for (const diff of differences.sort(
				(a, b) => (a.path?.length ?? 0) - (b.path?.length ?? 0)
			)) {
				console.log(JSON.stringify(diff, null, 4));
				if (diff.path === undefined) continue;
				switch (diff.kind) {
					case "A":
						{
							const title = diff.path.filter((a) => !isNumber(a));
							const start: Record<string, unknown> = {};
							const startNew: Record<string, unknown> = {};
							let current: Record<string, unknown> = start;
							let currentNew = startNew;

							for (let i = 0; i < title.length; i++) {
								const element = title[i];
								const obj = {};
								const objNew = {};
								if (i + 1 >= title.length) {
									current[element] = getPathValue(appConfig, title);
									currentNew[element] = getPathValue(prevApplication, title);
								} else {
									current[element] = obj;
									currentNew[element] = objNew;
								}

								current = obj;
								currentNew = objNew;
							}

							const object = {
								container_app: start,
							};

							const objectNew = {
								container_app: startNew,
							};

							const newValue = TOML.stringify(objectNew as JsonMap)
								.split("\n")
								.map((s) => s.trim());

							TOML.stringify(object as JsonMap)
								.split("\n")
								.map((s) => s.trim())
								.forEach((l, i) => {
									if (l === "") {
										printLine(l);
										return;
									}

									if (l !== newValue[i]) {
										printLine(l, "- ");
										printLine(newValue[i], "+ ");
									} else {
										printLine(newValue[i]);
									}
								});
						}

						break;
					case "N":
						{
							const title = diff.path.filter((a) => !isNumber(a));
							const start: Record<string, unknown> = {};
							let current: Record<string, unknown> = start;
							for (let i = 0; i < title.length; i++) {
								const element = title[i];
								const obj = {};
								if (i + 1 >= title.length) {
									current[element] = diff.rhs;
								} else {
									current[element] = obj;
								}

								current = obj;
							}

							const object = {
								container_app: start,
							};

							TOML.stringify(object as JsonMap)
								.split("\n")
								.map((s) => s.trim())
								.forEach((l) => {
									if (l === "") {
										printLine(l);
										return;
									}

									printLine(l, "+ ");
								});
						}
						break;
					case "D":
						{
							const title = diff.path.filter((a) => !isNumber(a));
							const start: Record<string, unknown> = {};
							let current: Record<string, unknown> = start;
							for (let i = 0; i < title.length; i++) {
								const element = title[i];
								const obj = {};
								if (i + 1 >= title.length) {
									current[element] = diff.lhs;
								} else {
									current[element] = obj;
								}

								current = obj;
							}

							const object = {
								container_app: start,
							};

							TOML.stringify(object as JsonMap)
								.split("\n")
								.map((s) => s.trim())
								.forEach((l) => {
									if (l === "") {
										printLine(l);
										return;
									}

									printLine(l, "- ");
								});
						}
						break;
					case "E":
						{
							{
								const title = diff.path.filter((a) => !isNumber(a));
								const isAnArray =
									(diff.path.length - 1 >= 0
										? isNumber(diff.path[diff.path.length - 1])
										: false) ||
									(diff.path.length - 2 >= 0
										? isNumber(diff.path[diff.path.length - 2])
										: false);

								const start: Record<string, unknown> = {};
								const startNew: Record<string, unknown> = {};
								let current: Record<string, unknown> = start;
								let currentNew = startNew;

								for (let i = 0; i < title.length; i++) {
									const element = title[i];
									const obj = {};
									const objNew = {};
									if (i + 1 >= title.length) {
										current[element] = diff.lhs;
										currentNew[element] = diff.rhs;
									} else if (i + 2 >= title.length && isAnArray) {
										const key = diff.path[diff.path.length - 1];
										const pathValue = getPathValue(
											appConfig,
											diff.path.slice(0, diff.path.length - 1)
										);
										currentNew[element] = [pathValue];
										current[element] = [
											{
												...(pathValue as {}),
												[key]: diff.lhs,
											},
										];
									} else {
										current[element] = obj;
										currentNew[element] = objNew;
									}

									current = obj;
									currentNew = objNew;
								}

								const object = {
									container_app: start,
								};

								const objectNew = {
									container_app: startNew,
								};

								const newValue = TOML.stringify(objectNew as JsonMap)
									.split("\n")
									.map((s) => s.trim());

								TOML.stringify(object as JsonMap)
									.split("\n")
									.map((s) => s.trim())
									.forEach((l, i) => {
										if (l === "") {
											printLine(l);
											return;
										}

										if (l !== newValue[i]) {
											printLine(l, "- ");
											printLine(newValue[i], "+ ");
										} else {
											printLine(newValue[i]);
										}
									});
							}
						}
						break;
				}
			}

			actions.push({
				action: "create",
				application: appConfig,
			});

			continue;
		}

		updateStatus(
			bold.underline(brandColor("new")) + ` ${brandColor(appConfig.name)}`
		);

		const s = TOML.stringify({ container_app: [appConfig] });

		s.split("\n")
			.map((line) => line.trim())
			.forEach((el) => {
				printLine(el);
			});
		actions.push({
			action: "create",
			application: appConfig,
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
					let message = "";
					if (
						err.body.error === DeploymentMutationError.VALIDATE_INPUT &&
						err.body.details !== undefined
					) {
						for (const key in err.body.details) {
							message += `  ${brandColor(key)} ${err.body.details[key]}\n`;
						}
					} else {
						message += `  ${err.body.error}`;
					}

					crash(
						`Error creating application due to a misconfiguration\n${message}`
					);
				}

				crash(
					`Error creating application due to an internal error (request id: ${err.body.request_id}): ${err.body.error}`
				);
			}

			success(`Created application ${brandColor(action.application.name)}`, {
				shape: shapes.bar,
			});
			continue;
		} else if (action.action === "modify") {
		}
	}

	log("");
	endSection("Applied changes");
}

/*
 *
		for (const diff of differences) {
				// console.log(JSON.stringify(diff, null, 4));

				switch (diff.kind) {
					// Edit
					case "E":
						if (diff.path === undefined) {
							throw new Error("unreachable");
						}

						const key = diff.path[diff.path.length - 1];
						if (typeof key !== "number") {
							const now = getPathValue(appConfig, diff.path);
							const prev = getPathValue(application, diff.path);
							printObjectPath(diff.path.slice(0, diff.path.length - 1));
							if (now !== undefined && prev === undefined) {
								printValue(key, now, "+ ");
							} else if (now === undefined && prev !== undefined) {
								printValue(key, now, "- ");
							} else if (now !== undefined && prev !== undefined) {
								printValue(key, prev, "- ");
								printValue(key, now, "+ ");
							}
						} else {
							const key = diff.path[diff.path.length - 2];
							printObjectPath(diff.path.slice(0, diff.path.length - 2));
							const now = getPathValue(
								appConfig,
								diff.path.slice(0, diff.path.length - 1)
							);
							const prev = getPathValue(
								application,
								diff.path.slice(0, diff.path.length - 1)
							);
							if (now !== undefined && prev === undefined) {
								printValue(key, now, "+ ");
							} else if (now === undefined && prev !== undefined) {
								printValue(key, now, "- ");
							} else if (now !== undefined && prev !== undefined) {
								printValue(key, prev, "- ");
								printValue(key, now, "+ ");
							}
						}

						break;
					// Change occurred within an array
					case "A":
						break;
					// Newly added property/element
					case "N":
						if (diff.path === undefined) {
							throw new Error("unreachable");
						}

						const now = getPathValue(appConfig, diff.path);
						let object = appConfig;
						const copy: Record<string, unknown> = {};
						let start: Record<string, unknown> = {};
						for (const p of diff.path as string[]) {
							start[p] = object[p as keyof object];
							object = object[p as keyof object];
						}
						// printObjectPath(diff.path.slice(0, diff.path.length - 1));
						// if (now !== undefined && prev === undefined) {
						// 	printValue(key, now, "+ ");
						// } else if (now === undefined && prev !== undefined) {
						// 	printValue(key, now, "- ");
						// } else if (now !== undefined && prev !== undefined) {
						// 	printValue(key, prev, "- ");
						// 	printValue(key, now, "+ ");
						// }
						break;
					// Deleted property
					case "D":
						break;
				}
			}
 * */
