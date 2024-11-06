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
import TOML, { JsonMap } from "@iarna/toml";
import diff, { Diff } from "deep-diff";
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

class TrieChangesNode {
	children: Record<string | number, TrieChangesNode> = {};
	diffs: Diff<unknown>[] = [];

	insert(d: Diff<unknown>) {
		if (d.path === undefined) {
			throw new Error("unreachable, path not defined");
		}

		let current: TrieChangesNode = this;
		for (const part of d.path) {
			if (part in current.children) {
				current = current.children[part];
			} else {
				current.children[part] = new TrieChangesNode();
				current = current.children[part];
			}
		}

		current.diffs.push(d);
	}

	query(
		parts: (string | number)[]
	): [TrieChangesNode, "complete" | "partial"] | undefined {
		let current: TrieChangesNode = this;
		for (const part of parts) {
			if (part in current.children) {
				current = current.children[part];
			} else {
				return [current, "partial"];
			}
		}

		if (current.diffs.length === 0) return undefined;

		return [current, "complete"];
	}
}

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

function isNumber(c: string) {
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
			const diffTrie = new TrieChangesNode();
			const prevApplication = stripUndefined(
				applicationToCreateApplication(application)
			);
			const differences = diff(
				prevApplication,
				stripUndefined(normalizeApplicationLists(appConfig))
			);

			console.log(JSON.stringify(differences, null, 4));

			if (differences === undefined || differences.length === 0) {
				updateStatus("no changes" + ` ${brandColor(appConfig.name)}`);
				continue;
			}

			for (const d of differences) {
				diffTrie.insert(d);
			}

			updateStatus(
				bold.underline(brandColor("edit")) + ` ${brandColor(appConfig.name)}`
			);

			const s = TOML.stringify({ container_app: [appConfig] });
			const s2 = TOML.stringify({ container_app: [prevApplication] });
			const render = (s: string) => {
				let currentPath: (string | number)[] = [];
				s.split("\n")
					.map((s) => s.trim())
					.forEach((line) => {
						if (line === "") {
							printLine("");
							return;
						}

						// out of scope:
						//  rendering diff of something like: `bla = [ [ { } ] ]`
						const containerAppArrayStr = "[[container_app.";
						const containerAppStrObj = "[container_app.";
						if (line.startsWith(containerAppArrayStr)) {
							const key = line.slice(
								containerAppArrayStr.length,
								line.length - 2
							);
							const keyParts = key.split(".");
							let i = 0;
							let j = 0;
							for (; j < currentPath.length && i < keyParts.length; j++) {
								if (typeof currentPath[j] === "number") {
									continue;
								}

								if (currentPath[j] === keyParts[i]) {
									i++;
									continue;
								}

								break;
							}
							// here we have j pointing to the part that is not equal to keyParts
							if (i < keyParts.length) {
								currentPath = currentPath.slice(0, j);
								currentPath.push(...keyParts.slice(i), 0);
							} else {
								// here we have keyParts have matched until this path everything.
								currentPath = currentPath.slice(0, j + 1);
								const last = currentPath.length - 1;
								if (typeof currentPath[last] !== "number") {
									throw new Error("internal error");
								}

								currentPath[last]++;
							}
							const node = diffTrie.query(currentPath);
							if (node === undefined) {
								return;
							}

							const [changes] = node;
							if (changes.diffs.length > 0) {
								const diff = changes.diffs[0];
								switch (diff.kind) {
									// New property
									case "N":
										printLine(line, "+ ");
										break;
									// New element in array
									case "A":
										break;
									// Deleted element
									case "D":
										printLine(line, "- ");
										break;
									// Edited element
									case "E":
										printLine(line);
										break;
									default:
										printLine(line);
								}
							} else {
								printLine(line);
							}

							// so theorically we have the right path here.
							//
						} else if (line.startsWith(containerAppStrObj)) {
							const key = line.slice(
								containerAppStrObj.length,
								line.length - 1
							);
							const keyParts = key.split(".");
							let i = 0;
							let j = 0;
							for (; j < currentPath.length && i < keyParts.length; j++) {
								if (typeof currentPath[j] === "number") {
									continue;
								}

								if (currentPath[j] === keyParts[i]) {
									i++;
									continue;
								}

								break;
							}
							if (i < keyParts.length) {
								currentPath = currentPath.slice(0, j);
								currentPath.push(...keyParts.slice(i));
							} else {
								throw new Error("unreachable");
							}

							const node = diffTrie.query(currentPath);
							if (node === undefined) {
								return;
							}

							const [changes] = node;
							if (changes.diffs.length > 0) {
								const diff = changes.diffs[0];
								switch (diff.kind) {
									// New property
									case "N":
										printLine(line, "+ ");
										break;
									// New element in array
									case "A":
										break;
									// Deleted element
									case "D":
										printLine(line, "- ");
										break;
									// Edited element
									case "E":
										printLine(line);
										break;
									default:
										printLine(line);
								}
							} else {
								printLine(line);
							}
						} else {
							const key = line.split(" = ")[0].trim();
							currentPath.push(key);
							const node = diffTrie.query(currentPath);
							if (node === undefined) {
								currentPath.pop();
								return;
							}

							const [changes] = node;
							if (changes.diffs.length > 0) {
								const diff = changes.diffs[0];
								switch (diff.kind) {
									// New property
									case "N":
										printLine(line, "+ ");
										break;
									// New element in array
									case "A":
										break;
									// Deleted element
									case "D":
										printLine(line, "- ");
										break;
									// Edited element
									case "E":
										printLine(line, "+ ");
										break;
									default:
										printLine(line);
								}
							} else {
								printLine(line);
							}

							currentPath.pop();
						}
					});
			};

			const render2 = (s: string) => {
				let currentPath: (string | number)[] = [];
				s.split("\n")
					.map((s) => s.trim())
					.filter((s) => s !== "")
					.forEach((line) => {
						if (line === "") {
							printLine("");
							return;
						}

						// out of scope:
						//  rendering diff of something like: `bla = [ [ { } ] ]`
						const containerAppArrayStr = "[[container_app.";
						const containerAppStrObj = "[container_app.";
						if (line.startsWith(containerAppArrayStr)) {
							const key = line.slice(
								containerAppArrayStr.length,
								line.length - 2
							);
							const keyParts = key.split(".");

							let i = 0;
							let j = 0;
							for (; j < currentPath.length && i < keyParts.length; j++) {
								if (typeof currentPath[j] === "number") {
									continue;
								}

								if (currentPath[j] === keyParts[i]) {
									i++;
									continue;
								}

								break;
							}
							// here we have j pointing to the part that is not equal to keyParts
							if (i < keyParts.length) {
								currentPath = currentPath.slice(0, j);
								currentPath.push(...keyParts.slice(i), 0);
							} else {
								// here we have keyParts have matched until this path everything.
								currentPath = currentPath.slice(0, j + 1);
								const last = currentPath.length - 1;
								if (typeof currentPath[last] !== "number") {
									throw new Error("internal error");
								}

								currentPath[last]++;
							}
							const node = diffTrie.query(currentPath);
							if (node === undefined) {
								return;
							}

							const [changes] = node;
							if (changes.diffs.length > 0) {
								const diff = changes.diffs[0];
								switch (diff.kind) {
									case "D":
										printLine(line, "- ");
										break;
								}
							}
						} else if (line.startsWith(containerAppStrObj)) {
							const key = line.slice(
								containerAppStrObj.length,
								line.length - 1
							);
							const keyParts = key.split(".");
							let i = 0;
							let j = 0;
							for (; j < currentPath.length && i < keyParts.length; j++) {
								if (typeof currentPath[j] === "number") {
									continue;
								}

								if (currentPath[j] === keyParts[i]) {
									i++;
									continue;
								}

								break;
							}
							if (i < keyParts.length) {
								currentPath = currentPath.slice(0, j);
								currentPath.push(...keyParts.slice(i));
							} else {
								throw new Error("unreachable");
							}

							const node = diffTrie.query(currentPath);
							if (node === undefined) {
								return;
							}

							const [changes] = node;
							const diff = changes.diffs[0];
							switch (diff.kind) {
								case "D":
									printLine(line, "- ");
							}
						} else {
							const key = line.split(" = ")[0].trim();
							currentPath.push(key);
							const node = diffTrie.query(currentPath);
							if (node === undefined) {
								currentPath.pop();
								return;
							}

							const [changes] = node;
							if (changes.diffs.length > 0) {
								const diff = changes.diffs[0];
								switch (diff.kind) {
									case "D":
										printLine(line, "- ");
										break;
								}
							}
						}
					});
			};

			render(s);
			render2(s2);

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
