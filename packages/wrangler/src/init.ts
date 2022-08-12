import * as fs from "node:fs";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import TOML from "@iarna/toml";
import { findUp } from "find-up";
import { version as wranglerVersion } from "../package.json";

import { fetchDashboardScript } from "./cfetch/internal";
import { readConfig } from "./config";
import { confirm, select } from "./dialogs";
import { initializeGit, isGitInstalled, isInsideGitRepo } from "./git-client";
import { logger } from "./logger";
import { getPackageManager } from "./package-manager";
import { parsePackageJSON, parseTOML, readFileSync } from "./parse";
import { requireAuth } from "./user";
import { CommandLineArgsError, printWranglerBanner } from "./index";
import type { ConfigPath } from "./index";

import type { Argv, ArgumentsCamelCase } from "yargs";

export async function initOptions(yargs: Argv) {
	return yargs
		.positional("name", {
			describe: "The name of your worker",
			type: "string",
		})
		.option("type", {
			describe: "The type of worker to create",
			type: "string",
			choices: ["rust", "javascript", "webpack"],
			hidden: true,
			deprecated: true,
		})
		.option("site", {
			hidden: true,
			type: "boolean",
			deprecated: true,
		})
		.option("yes", {
			describe: 'Answer "yes" to any prompts for new projects',
			type: "boolean",
			alias: "y",
		})
		.option("from-dash", {
			describe: "Download script from the dashboard for local development",
			type: "string",
			requiresArg: true,
			hidden: true,
		});
}

interface InitArgs {
	name: string;
	type?: string;
	site?: boolean;
	yes?: boolean;
}

export async function initHandler(args: ArgumentsCamelCase<InitArgs>) {
	await printWranglerBanner();
	if (args.type) {
		let message = "The --type option is no longer supported.";
		if (args.type === "webpack") {
			message +=
				"\nIf you wish to use webpack then you will need to create a custom build.";
			// TODO: Add a link to docs
		}
		throw new CommandLineArgsError(message);
	}

	const devDepsToInstall: string[] = [];
	const instructions: string[] = [];
	let shouldRunPackageManagerInstall = false;
	const fromDashScriptName = args["from-dash"] as string;
	const creationDirectory = path.resolve(
		process.cwd(),
		(args.name ? args.name : fromDashScriptName) ?? ""
	);

	if (args.site) {
		const gitDirectory =
			creationDirectory !== process.cwd()
				? path.basename(creationDirectory)
				: "my-site";
		const message =
			"The --site option is no longer supported.\n" +
			"If you wish to create a brand new Worker Sites project then clone the `worker-sites-template` starter repository:\n\n" +
			"```\n" +
			`git clone --depth=1 --branch=wrangler2 https://github.com/cloudflare/worker-sites-template ${gitDirectory}\n` +
			`cd ${gitDirectory}\n` +
			"```\n\n" +
			"Find out more about how to create and maintain Sites projects at https://developers.cloudflare.com/workers/platform/sites.\n" +
			"Have you considered using Cloudflare Pages instead? See https://pages.cloudflare.com/.";
		throw new CommandLineArgsError(message);
	}

	// TODO: make sure args.name is a valid identifier for a worker name
	const workerName = path
		.basename(creationDirectory)
		.toLowerCase()
		.replaceAll(/[^a-z0-9\-_]/gm, "-");

	const packageManager = await getPackageManager(creationDirectory);

	// TODO: ask which directory to make the worker in (defaults to args.name)
	// TODO: if args.name isn't provided, ask what to name the worker
	// Note: `--from-dash` will be a fallback creationDir/Worker name if none is provided.

	const wranglerTomlDestination = path.join(
		creationDirectory,
		"./wrangler.toml"
	);
	let justCreatedWranglerToml = false;

	if (fs.existsSync(wranglerTomlDestination)) {
		let shouldContinue = false;
		logger.warn(
			`${path.relative(process.cwd(), wranglerTomlDestination)} already exists!`
		);
		if (!fromDashScriptName) {
			shouldContinue = await confirm(
				"Do you want to continue initializing this project?"
			);
		}
		if (!shouldContinue) {
			return;
		}
	} else {
		await mkdir(creationDirectory, { recursive: true });
		const compatibilityDate = new Date().toISOString().substring(0, 10);

		try {
			await writeFile(
				wranglerTomlDestination,
				TOML.stringify({
					name: workerName,
					compatibility_date: compatibilityDate,
				}) + "\n"
			);

			logger.log(
				`✨ Created ${path.relative(process.cwd(), wranglerTomlDestination)}`
			);
			justCreatedWranglerToml = true;
		} catch (err) {
			throw new Error(
				`Failed to create ${path.relative(
					process.cwd(),
					wranglerTomlDestination
				)}.\n${(err as Error).message ?? err}`
			);
		}
	}

	const yesFlag = args.yes ?? false;

	if (!(await isInsideGitRepo(creationDirectory)) && (await isGitInstalled())) {
		const shouldInitGit =
			yesFlag ||
			(await confirm("Would you like to use git to manage this Worker?"));
		if (shouldInitGit) {
			await initializeGit(creationDirectory);
			await writeFile(
				path.join(creationDirectory, ".gitignore"),
				readFileSync(path.join(__dirname, "../templates/gitignore"))
			);
			logger.log(
				args.name && args.name !== "."
					? `✨ Initialized git repository at ${path.relative(
							process.cwd(),
							creationDirectory
					  )}`
					: `✨ Initialized git repository`
			);
		}
	}

	const isolatedInit = !!args.name;
	let pathToPackageJson = await findPath(
		isolatedInit,
		creationDirectory,
		"package.json"
	);
	let shouldCreatePackageJson = false;

	if (!pathToPackageJson) {
		// If no package.json exists, ask to create one
		shouldCreatePackageJson =
			yesFlag ||
			(await confirm("No package.json found. Would you like to create one?"));

		if (shouldCreatePackageJson) {
			await writeFile(
				path.join(creationDirectory, "./package.json"),
				JSON.stringify(
					{
						name: workerName,
						version: "0.0.0",
						devDependencies: {
							wrangler: wranglerVersion,
						},
						private: true,
					},
					null,
					"  "
				) + "\n"
			);

			shouldRunPackageManagerInstall = true;
			pathToPackageJson = path.join(creationDirectory, "package.json");
			logger.log(
				`✨ Created ${path.relative(process.cwd(), pathToPackageJson)}`
			);
		} else {
			return;
		}
	} else {
		// If package.json exists and wrangler isn't installed,
		// then ask to add wrangler to devDependencies
		const packageJson = parsePackageJSON(
			readFileSync(pathToPackageJson),
			pathToPackageJson
		);
		if (
			!(
				packageJson.devDependencies?.wrangler ||
				packageJson.dependencies?.wrangler
			)
		) {
			const shouldInstall =
				yesFlag ||
				(await confirm(
					`Would you like to install wrangler into ${path.relative(
						process.cwd(),
						pathToPackageJson
					)}?`
				));
			if (shouldInstall) {
				devDepsToInstall.push(`wrangler@${wranglerVersion}`);
			}
		}
	}

	let isTypescriptProject = false;
	let pathToTSConfig = await findPath(
		isolatedInit,
		creationDirectory,
		"tsconfig.json"
	);
	if (!pathToTSConfig) {
		// If there's no tsconfig, offer to create one
		// and install @cloudflare/workers-types
		if (yesFlag || (await confirm("Would you like to use TypeScript?"))) {
			isTypescriptProject = true;
			await writeFile(
				path.join(creationDirectory, "./tsconfig.json"),
				readFileSync(path.join(__dirname, "../templates/tsconfig.json"))
			);
			devDepsToInstall.push("@cloudflare/workers-types");
			devDepsToInstall.push("typescript");
			pathToTSConfig = path.join(creationDirectory, "tsconfig.json");
			logger.log(`✨ Created ${path.relative(process.cwd(), pathToTSConfig)}`);
		}
	} else {
		isTypescriptProject = true;
		// If there's a tsconfig, check if @cloudflare/workers-types
		// is already installed, and offer to install it if not
		const packageJson = parsePackageJSON(
			readFileSync(pathToPackageJson),
			pathToPackageJson
		);
		if (
			!(
				packageJson.devDependencies?.["@cloudflare/workers-types"] ||
				packageJson.dependencies?.["@cloudflare/workers-types"]
			)
		) {
			const shouldInstall = await confirm(
				"Would you like to install the type definitions for Workers into your package.json?"
			);
			if (shouldInstall) {
				devDepsToInstall.push("@cloudflare/workers-types");
				// We don't update the tsconfig.json because
				// it could be complicated in existing projects
				// and we don't want to break them. Instead, we simply
				// tell the user that they need to update their tsconfig.json
				instructions.push(
					`🚨 Please add "@cloudflare/workers-types" to compilerOptions.types in ${path.relative(
						process.cwd(),
						pathToTSConfig
					)}`
				);
			}
		}
	}

	const packageJsonContent = parsePackageJSON(
		readFileSync(pathToPackageJson),
		pathToPackageJson
	);
	const shouldWritePackageJsonScripts =
		!packageJsonContent.scripts?.start &&
		!packageJsonContent.scripts?.publish &&
		shouldCreatePackageJson;

	/*
	 * Passes the array of accumulated devDeps to install through to
	 * the package manager. Also generates a human-readable list
	 * of packages it installed.
	 * If there are no devDeps to install, optionally runs
	 * the package manager's install command.
	 */
	async function installPackages(
		shouldRunInstall: boolean,
		depsToInstall: string[]
	) {
		//lets install the devDeps they asked for
		//and run their package manager's install command if needed
		if (depsToInstall.length > 0) {
			const formatter = new Intl.ListFormat("en", {
				style: "long",
				type: "conjunction",
			});
			await packageManager.addDevDeps(...depsToInstall);
			const versionlessPackages = depsToInstall.map((dep) =>
				dep === `wrangler@${wranglerVersion}` ? "wrangler" : dep
			);

			logger.log(
				`✨ Installed ${formatter.format(
					versionlessPackages
				)} into devDependencies`
			);
		} else {
			if (shouldRunInstall) {
				await packageManager.install();
			}
		}
	}

	async function writePackageJsonScriptsAndUpdateWranglerToml(
		isWritingScripts: boolean,
		isCreatingWranglerToml: boolean,
		packagePath: string,
		scriptPath: string,
		extraToml: TOML.JsonMap
	) {
		if (isCreatingWranglerToml) {
			// rewrite wrangler.toml with main = "path/to/script" and any additional config specified in `extraToml`
			const parsedWranglerToml = parseTOML(
				readFileSync(wranglerTomlDestination)
			);
			const newToml = {
				name: parsedWranglerToml.name,
				main: scriptPath,
				compatibility_date: parsedWranglerToml.compatibility_date,
				...extraToml,
			};
			fs.writeFileSync(wranglerTomlDestination, TOML.stringify(newToml));
		}
		const isNamedWorker =
			isCreatingWranglerToml && path.dirname(packagePath) !== process.cwd();

		if (isWritingScripts) {
			await writeFile(
				packagePath,
				JSON.stringify(
					{
						...packageJsonContent,
						scripts: {
							...packageJsonContent.scripts,
							start: isCreatingWranglerToml
								? `wrangler dev`
								: `wrangler dev ${scriptPath}`,
							deploy: isCreatingWranglerToml
								? `wrangler publish`
								: `wrangler publish ${scriptPath}`,
						},
					},
					null,
					2
				) + "\n"
			);
			instructions.push(
				`\nTo start developing your Worker, run \`${
					isNamedWorker ? `cd ${args.name} && ` : ""
				}npm start\``
			);
			instructions.push(
				`To publish your Worker to the Internet, run \`npm run deploy\``
			);
		} else {
			instructions.push(
				`\nTo start developing your Worker, run \`npx wrangler dev\`${
					isCreatingWranglerToml ? "" : ` ${scriptPath}`
				}`
			);
			instructions.push(
				`To publish your Worker to the Internet, run \`npx wrangler publish\`${
					isCreatingWranglerToml ? "" : ` ${scriptPath}`
				}`
			);
		}
	}

	async function getNewWorkerType(newWorkerFilename: string) {
		return select(
			`Would you like to create a Worker at ${newWorkerFilename}?`,
			[
				{
					value: "none",
					label: "None",
				},
				{
					value: "fetch",
					label: "Fetch handler",
				},
				{
					value: "scheduled",
					label: "Scheduled handler",
				},
			],
			1
		) as Promise<"none" | "fetch" | "scheduled">;
	}

	function getNewWorkerTemplate(
		lang: "js" | "ts",
		workerType: "fetch" | "scheduled"
	) {
		const templates = {
			"js-fetch": "new-worker.js",
			"js-scheduled": "new-worker-scheduled.js",
			"ts-fetch": "new-worker.ts",
			"ts-scheduled": "new-worker-scheduled.ts",
		};

		return templates[`${lang}-${workerType}`];
	}

	function getNewWorkerToml(workerType: "fetch" | "scheduled"): TOML.JsonMap {
		if (workerType === "scheduled") {
			return {
				triggers: {
					crons: ["1 * * * *"],
				},
			};
		}

		return {};
	}

	if (isTypescriptProject) {
		if (!fs.existsSync(path.join(creationDirectory, "./src/index.ts"))) {
			const newWorkerFilename = path.relative(
				process.cwd(),
				path.join(creationDirectory, "./src/index.ts")
			);
			if (fromDashScriptName) {
				const config = readConfig(args.config as ConfigPath, args);
				const accountId = await requireAuth(config);
				await mkdir(path.join(creationDirectory, "./src"), {
					recursive: true,
				});

				const dashScript = await fetchDashboardScript(
					`/accounts/${accountId}/workers/scripts/${fromDashScriptName}`,
					{
						method: "GET",
					}
				);

				await writeFile(
					path.join(creationDirectory, "./src/index.ts"),
					dashScript
				);

				await writePackageJsonScriptsAndUpdateWranglerToml(
					shouldWritePackageJsonScripts,
					justCreatedWranglerToml,
					pathToPackageJson,
					"src/index.ts",
					{}
				);
			} else {
				const newWorkerType = yesFlag
					? "fetch"
					: await getNewWorkerType(newWorkerFilename);

				if (newWorkerType !== "none") {
					const template = getNewWorkerTemplate("ts", newWorkerType);

					await mkdir(path.join(creationDirectory, "./src"), {
						recursive: true,
					});
					await writeFile(
						path.join(creationDirectory, "./src/index.ts"),
						readFileSync(path.join(__dirname, `../templates/${template}`))
					);

					logger.log(
						`✨ Created ${path.relative(
							process.cwd(),
							path.join(creationDirectory, "./src/index.ts")
						)}`
					);

					await writePackageJsonScriptsAndUpdateWranglerToml(
						shouldWritePackageJsonScripts,
						justCreatedWranglerToml,
						pathToPackageJson,
						"src/index.ts",
						getNewWorkerToml(newWorkerType)
					);
				}
			}
		}
	} else {
		if (!fs.existsSync(path.join(creationDirectory, "./src/index.js"))) {
			const newWorkerFilename = path.relative(
				process.cwd(),
				path.join(creationDirectory, "./src/index.js")
			);

			if (fromDashScriptName) {
				const config = readConfig(args.config as ConfigPath, args);
				const accountId = await requireAuth(config);
				await mkdir(path.join(creationDirectory, "./src"), {
					recursive: true,
				});

				const dashScript = await fetchDashboardScript(
					`/accounts/${accountId}/workers/scripts/${fromDashScriptName}`,
					{
						method: "GET",
					}
				);

				await writeFile(
					path.join(creationDirectory, "./src/index.js"),
					dashScript
				);

				await writePackageJsonScriptsAndUpdateWranglerToml(
					shouldWritePackageJsonScripts,
					justCreatedWranglerToml,
					pathToPackageJson,
					"src/index.ts",
					{}
				);
			} else {
				const newWorkerType = yesFlag
					? "fetch"
					: await getNewWorkerType(newWorkerFilename);

				if (newWorkerType !== "none") {
					const template = getNewWorkerTemplate("js", newWorkerType);

					await mkdir(path.join(creationDirectory, "./src"), {
						recursive: true,
					});
					await writeFile(
						path.join(creationDirectory, "./src/index.js"),
						readFileSync(path.join(__dirname, `../templates/${template}`))
					);

					logger.log(
						`✨ Created ${path.relative(
							process.cwd(),
							path.join(creationDirectory, "./src/index.js")
						)}`
					);

					await writePackageJsonScriptsAndUpdateWranglerToml(
						shouldWritePackageJsonScripts,
						justCreatedWranglerToml,
						pathToPackageJson,
						"src/index.js",
						getNewWorkerToml(newWorkerType)
					);
				}
			}
		}
	}
	// install packages as the final step of init
	try {
		await installPackages(shouldRunPackageManagerInstall, devDepsToInstall);
	} catch (e) {
		// fetching packages could fail due to loss of internet, etc
		// we should let folks know we failed to fetch, but their
		// workers project is still ready to go
		logger.error(e instanceof Error ? e.message : e);
		instructions.push(
			"\n🚨 wrangler was unable to fetch your npm packages, but your project is ready to go"
		);
	}

	// let users know what to do now
	instructions.forEach((instruction) => logger.log(instruction));
}

/**
 * Find the path to the given `basename` file from the `cwd`.
 *
 * If `isolatedInit` is true then we only look in the `cwd` directory for the file.
 * Otherwise we also search up the tree.
 */
async function findPath(
	isolatedInit: boolean,
	cwd: string,
	basename: string
): Promise<string | undefined> {
	if (isolatedInit) {
		return fs.existsSync(path.resolve(cwd, basename))
			? path.resolve(cwd, basename)
			: undefined;
	} else {
		return await findUp(basename, {
			cwd: cwd,
		});
	}
}
