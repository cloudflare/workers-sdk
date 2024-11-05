import {
	cancel,
	crash,
	endSection,
	error,
	log,
	shapes,
	startSection,
	success,
	updateStatus,
} from "@cloudflare/cli";
import { processArgument } from "@cloudflare/cli/args";
import { bold, brandColor, dim, red } from "@cloudflare/cli/colors";
import { inputPrompt } from "@cloudflare/cli/interactive";
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
	application.configuration.labels?.sort((labelA, labelB) =>
		labelA.name.localeCompare(labelB.name)
	);
	application.configuration.ssh_public_key_ids?.sort((keyA, keyB) =>
		keyA.localeCompare(keyB)
	);
	application.configuration.secrets?.sort((secretA, secretB) =>
		secretA.name.localeCompare(secretB.name)
	);
	application.configuration.ports?.sort((portA, portB) =>
		portA.name.localeCompare(portB.name)
	);
	application.configuration.environment_variables?.sort((envA, envB) =>
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
			const differences = diff(
				stripUndefined(normalizeApplicationLists(appConfig)),
				stripUndefined(
					normalizeApplicationLists(applicationToCreateApplication(application))
				)
			);

			if (differences === undefined || differences.length === 0) {
				updateStatus("no changes" + ` ${brandColor(appConfig.name)}`);
				continue;
			}

			for (const diff of differences) {
				console.log(JSON.stringify(diff, null, 4));
			}

			continue;
		}

		updateStatus(
			bold.underline(brandColor("new")) + ` ${brandColor(appConfig.name)}`
		);

		// renderObject(appConfig, 0);
		const s = TOML.stringify({ container_app: [appConfig] });

		function isNumber(c: string) {
			const code = c.charCodeAt(0);
			const zero = "0".charCodeAt(0);
			const nine = "9".charCodeAt(0);
			return code >= zero && code <= nine;
		}

		s.split("\n")
			.map((line) => line.trim())
			.forEach((el) => {
				let line = "";
				let lastAdded = 0;
				const addToLine = (i: number, color = (s: string) => s) => {
					line += color(el.slice(lastAdded, i));
					lastAdded = i;
				};

				const state = {
					render: "none" as "quotes" | "number" | "none" | "section",
				};
				for (let i = 0; i < el.length; i++) {
					const current = el[i];
					const peek = i + 1 < el.length ? el[i + 1] : null;
					const prev = i === 0 ? null : el[i - 1];

					switch (state.render) {
						case "none":
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
								state.render = "none";
							}

							break;
						case "number":
							if (!isNumber(el)) {
								addToLine(i, red);
								state.render = "none";
							}

							break;
						case "section":
							if (current === "]" && prev === "]") {
								addToLine(i + 1, bold);
								state.render = "none";
							}
					}
				}

				switch (state.render) {
					case "none":
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
			});
		actions.push({
			action: "create",
			application: appConfig,
		});
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
