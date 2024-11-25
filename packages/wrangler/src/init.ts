import * as fs from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path, { dirname } from "node:path";
import TOML from "@iarna/toml";
import { execa } from "execa";
import { findUp } from "find-up";
import { version as wranglerVersion } from "../package.json";
import { assertNever } from "./api/startDevWorker/utils";
import { fetchResult } from "./cfetch";
import { fetchWorker } from "./cfetch/internal";
import { readConfig } from "./config";
import { getDatabaseInfoFromId } from "./d1/utils";
import { confirm, select } from "./dialogs";
import { getC3CommandFromEnv } from "./environment-variables/misc-variables";
import { CommandLineArgsError, FatalError, UserError } from "./errors";
import { getGitVersioon, initializeGit, isInsideGitRepo } from "./git-client";
import { logger } from "./logger";
import { getPackageManager } from "./package-manager";
import { parsePackageJSON, parseTOML, readFileSync } from "./parse";
import { getBasePath } from "./paths";
import { requireAuth } from "./user";
import { createBatches } from "./utils/create-batches";
import * as shellquote from "./utils/shell-quote";
import { printWranglerBanner } from "./index";
import type { RawConfig } from "./config";
import type {
	CustomDomainRoute,
	Observability,
	Route,
	TailConsumer,
	ZoneNameRoute,
} from "./config/environment";
import type { DatabaseInfo } from "./d1/types";
import type {
	WorkerMetadata,
	WorkerMetadataBinding,
} from "./deployment-bundle/create-worker-upload-form";
import type { PackageManager } from "./package-manager";
import type { PackageJSON } from "./parse";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "./yargs-types";
import type { ReadableStream } from "stream/web";

export function initOptions(yargs: CommonYargsArgv) {
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
			describe:
				"The name of the Worker you wish to download from the Cloudflare dashboard for local development.",
			type: "string",
			requiresArg: true,
		})
		.option("delegate-c3", {
			describe: "Delegate to Create Cloudflare CLI (C3)",
			type: "boolean",
			hidden: true,
			default: true,
			alias: "c3",
		});
}

type InitArgs = StrictYargsOptionsToInterface<typeof initOptions>;

export type ServiceMetadataRes = {
	id: string;
	default_environment: {
		environment: string;
		created_on: string;
		modified_on: string;
		script: {
			id: string;
			tag: string;
			etag: string;
			handlers: string[];
			modified_on: string;
			created_on: string;
			migration_tag: string;
			usage_model: "bundled" | "unbound";
			limits: {
				cpu_ms: number;
			};
			compatibility_date: string;
			compatibility_flags: string[];
			last_deployed_from?: "wrangler" | "dash" | "api";
			placement_mode?: "smart";
			tail_consumers?: TailConsumer[];
			observability?: Observability;
		};
	};
	created_on: string;
	modified_on: string;
	usage_model: "bundled" | "unbound";
	environments: [
		{
			environment: string;
			created_on: string;
			modified_on: string;
		},
	];
};

type RoutesRes = {
	id: string;
	pattern: string;
	zone_name: string;
	script: string;
}[];

type CustomDomainsRes = {
	id: string;
	zone_id: string;
	zone_name: string;
	hostname: string;
	service: string;
	environment: string;
	cert_id: string;
}[];

type WorkersDevRes = {
	enabled: boolean;
	previews_enabled: boolean;
};
type CronTriggersRes = {
	schedules: [
		{
			cron: string;
			created_on: Date;
			modified_on: Date;
		},
	];
};

function isNpm(packageManager: PackageManager) {
	return packageManager.type === "npm";
}

export async function initHandler(args: InitArgs) {
	await printWranglerBanner();

	const yesFlag = args.yes ?? false;
	const devDepsToInstall: string[] = [];
	const instructions: string[] = [];
	let shouldRunPackageManagerInstall = false;
	const fromDashWorkerName = args.fromDash;
	const creationDirectory = path.resolve(
		process.cwd(),
		(args.name ? args.name : fromDashWorkerName) ?? ""
	);

	assertNoTypeArg(args);
	assertNoSiteArg(args, creationDirectory);

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

	let accountId = "";

	// If --from-dash, check that script actually exists
	if (fromDashWorkerName) {
		const c3Arguments = [
			...shellquote.parse(getC3CommandFromEnv()),
			fromDashWorkerName,
			...(yesFlag && isNpm(packageManager) ? ["-y"] : []), // --yes arg for npx
			...(isNpm(packageManager) ? ["--"] : []),
			"--existing-script",
			fromDashWorkerName,
		];

		if (yesFlag) {
			c3Arguments.push("--wrangler-defaults");
		}

		const replacementC3Command = `\`${packageManager.type} ${c3Arguments.join(
			" "
		)}\``;
		// C3 will run wrangler with the --do-not-delegate flag to communicate with the API
		if (args.delegateC3) {
			logger.log(`🌀 Running ${replacementC3Command}...`);

			await execa(packageManager.type, c3Arguments, { stdio: "inherit" });

			return;
		} else {
			const config = readConfig(args.config, args);
			accountId = await requireAuth(config);
			try {
				await fetchResult<ServiceMetadataRes>(
					`/accounts/${accountId}/workers/services/${fromDashWorkerName}`
				);
			} catch (err) {
				if ((err as { code?: number }).code === 10090) {
					throw new UserError(
						"wrangler couldn't find a Worker script with that name in your account.\nRun `wrangler whoami` to confirm you're logged into the correct account."
					);
				}
				throw err;
			}
		}
	}

	if (fs.existsSync(wranglerTomlDestination)) {
		let shouldContinue = false;
		logger.warn(
			`${path.relative(process.cwd(), wranglerTomlDestination)} already exists!`
		);
		if (!fromDashWorkerName) {
			shouldContinue = await confirm(
				"Do you want to continue initializing this project?"
			);
		}
		if (!shouldContinue) {
			return;
		}
	} else {
		if (!fromDashWorkerName) {
			const c3Arguments: string[] = [];

			if (args.name) {
				c3Arguments.push(args.name);
			}

			if (yesFlag) {
				c3Arguments.push("--wrangler-defaults");
			}

			if (c3Arguments.length > 0 && isNpm(packageManager)) {
				c3Arguments.unshift("--");
			}

			if (yesFlag && isNpm(packageManager)) {
				c3Arguments.unshift("-y"); // arg for npx
			}

			c3Arguments.unshift(...shellquote.parse(getC3CommandFromEnv()));

			const replacementC3Command = `\`${packageManager.type} ${shellquote.quote(
				c3Arguments
			)}\``;

			if (args.delegateC3) {
				logger.log(
					`The \`init\` command now delegates to \`create-cloudflare\` instead. You can use the \`--no-c3\` flag to access the old implementation.\n`
				);
				logger.log(`🌀 Running ${replacementC3Command}...`);

				await execa(packageManager.type, c3Arguments, {
					stdio: "inherit",
				});

				return;
			}
		}

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

	if (!(await isInsideGitRepo(creationDirectory)) && (await getGitVersioon())) {
		const shouldInitGit =
			yesFlag ||
			(await confirm("Would you like to use git to manage this Worker?"));
		if (shouldInitGit) {
			await initializeGit(creationDirectory);
			await writeFile(
				path.join(creationDirectory, ".gitignore"),
				readFileSync(path.join(getBasePath(), "templates/gitignore"))
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
	let shouldCreateTests = false;
	let newWorkerTestType: "jest" | "vitest" = "jest";

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
	// If we're coming from the dash, the worker is always Javascript
	if (!fromDashWorkerName) {
		if (!pathToTSConfig) {
			// If there's no tsconfig, offer to create one
			// and install @cloudflare/workers-types
			if (yesFlag || (await confirm("Would you like to use TypeScript?"))) {
				isTypescriptProject = true;
				await writeFile(
					path.join(creationDirectory, "./tsconfig.json"),
					readFileSync(path.join(getBasePath(), "templates/tsconfig.init.json"))
				);
				devDepsToInstall.push("@cloudflare/workers-types");
				devDepsToInstall.push("typescript");
				pathToTSConfig = path.join(creationDirectory, "tsconfig.json");
				logger.log(
					`✨ Created ${path.relative(process.cwd(), pathToTSConfig)}`
				);
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
	}

	const packageJsonContent = parsePackageJSON(
		readFileSync(pathToPackageJson),
		pathToPackageJson
	);
	const shouldWritePackageJsonScripts =
		!packageJsonContent.scripts?.start &&
		!packageJsonContent.scripts?.publish &&
		shouldCreatePackageJson;

	async function writePackageJsonScriptsAndUpdateWranglerToml({
		isWritingScripts,
		isAddingTests,
		testRunner,
		isCreatingWranglerToml,
		packagePath,
		scriptPath,
		extraToml,
	}: {
		isWritingScripts: boolean;
		isAddingTests?: boolean;
		testRunner?: "jest" | "vitest";
		isCreatingWranglerToml: boolean;
		packagePath: string;
		scriptPath: string;
		extraToml: TOML.JsonMap;
	}) {
		if (isAddingTests && !testRunner) {
			logger.error("testRunner is required if isAddingTests");
		}
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
		const isAddingTestScripts =
			isAddingTests && !packageJsonContent.scripts?.test;
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
								? `wrangler deploy`
								: `wrangler deploy ${scriptPath}`,
							...(isAddingTestScripts && { test: testRunner }),
						},
					} as PackageJSON,
					null,
					2
				) + "\n"
			);
			instructions.push(
				`\nTo start developing your Worker, run \`${
					isNamedWorker ? `cd ${args.name || fromDashWorkerName} && ` : ""
				}npm start\``
			);
			if (isAddingTestScripts) {
				instructions.push(`To start testing your Worker, run \`npm test\``);
			}
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
				`To publish your Worker to the Internet, run \`npx wrangler deploy\`${
					isCreatingWranglerToml ? "" : ` ${scriptPath}`
				}`
			);
		}
	}
	if (isTypescriptProject) {
		if (!fs.existsSync(path.join(creationDirectory, "./src/index.ts"))) {
			const newWorkerFilename = path.relative(
				process.cwd(),
				path.join(creationDirectory, "./src/index.ts")
			);

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
					readFileSync(path.join(getBasePath(), `templates/${template}`))
				);

				logger.log(
					`✨ Created ${path.relative(
						process.cwd(),
						path.join(creationDirectory, "./src/index.ts")
					)}`
				);

				shouldCreateTests =
					yesFlag ||
					(await confirm(
						"Would you like us to write your first test with Vitest?"
					));

				if (shouldCreateTests) {
					if (yesFlag) {
						logger.info("Your project will use Vitest to run your tests.");
					}

					newWorkerTestType = "vitest";
					devDepsToInstall.push(newWorkerTestType);

					await writeFile(
						path.join(creationDirectory, "./src/index.test.ts"),
						readFileSync(
							path.join(
								getBasePath(),
								`templates/init-tests/test-${newWorkerTestType}-new-worker.ts`
							)
						)
					);
					logger.log(
						`✨ Created ${path.relative(
							process.cwd(),
							path.join(creationDirectory, "./src/index.test.ts")
						)}`
					);
				}

				await writePackageJsonScriptsAndUpdateWranglerToml({
					isWritingScripts: shouldWritePackageJsonScripts,
					isAddingTests: shouldCreateTests,
					isCreatingWranglerToml: justCreatedWranglerToml,
					packagePath: pathToPackageJson,
					testRunner: newWorkerTestType,
					scriptPath: "src/index.ts",
					extraToml: getNewWorkerToml(newWorkerType),
				});
			}
		}
	} else {
		if (!fs.existsSync(path.join(creationDirectory, "./src/index.js"))) {
			const newWorkerFilename = path.relative(
				process.cwd(),
				path.join(creationDirectory, "./src/index.js")
			);

			if (fromDashWorkerName) {
				logger.warn(
					"After running `wrangler init --from-dash`, modifying your worker via the Cloudflare dashboard is discouraged.\nEdits made via the Dashboard will not be synchronized locally and will be overridden by your local code and config when you deploy."
				);

				const { modules, config } = await downloadWorker(
					accountId,
					fromDashWorkerName
				);

				await mkdir(path.join(creationDirectory, "./src"), {
					recursive: true,
				});

				config.main = `src/${config.main}`;
				config.name = workerName;

				// writeFile in small batches (of 10) to not exhaust system file descriptors
				for (const files of createBatches(modules, 10)) {
					await Promise.all(
						files.map(async (file) => {
							const filepath = path.join(
								creationDirectory,
								`./src/${file.name}`
							);
							const directory = dirname(filepath);

							await mkdir(directory, { recursive: true });
							await writeFile(filepath, file.stream() as ReadableStream);
						})
					);
				}

				await writePackageJsonScriptsAndUpdateWranglerToml({
					isWritingScripts: shouldWritePackageJsonScripts,
					isCreatingWranglerToml: justCreatedWranglerToml,
					packagePath: pathToPackageJson,
					scriptPath: "src/index.js",
					//? Should we have Environment argument for `wrangler init --from-dash` - Jacob
					extraToml: config as TOML.JsonMap,
				});
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
						readFileSync(path.join(getBasePath(), `templates/${template}`))
					);

					logger.log(
						`✨ Created ${path.relative(
							process.cwd(),
							path.join(creationDirectory, "./src/index.js")
						)}`
					);

					shouldCreateTests =
						yesFlag ||
						(await confirm("Would you like us to write your first test?"));

					if (shouldCreateTests) {
						newWorkerTestType = await getNewWorkerTestType(yesFlag);
						devDepsToInstall.push(newWorkerTestType);
						await writeFile(
							path.join(creationDirectory, "./src/index.test.js"),
							readFileSync(
								path.join(
									getBasePath(),
									`templates/init-tests/test-${newWorkerTestType}-new-worker.js`
								)
							)
						);
						logger.log(
							`✨ Created ${path.relative(
								process.cwd(),
								path.join(creationDirectory, "./src/index.test.js")
							)}`
						);
					}

					await writePackageJsonScriptsAndUpdateWranglerToml({
						isWritingScripts: shouldWritePackageJsonScripts,
						isAddingTests: shouldCreateTests,
						testRunner: newWorkerTestType,
						isCreatingWranglerToml: justCreatedWranglerToml,
						packagePath: pathToPackageJson,
						scriptPath: "src/index.js",
						extraToml: getNewWorkerToml(newWorkerType),
					});
				}
			}
		}
	}
	// install packages as the final step of init
	try {
		await installPackages(
			shouldRunPackageManagerInstall,
			devDepsToInstall,
			packageManager
		);
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

/*
 * Passes the array of accumulated devDeps to install through to
 * the package manager. Also generates a human-readable list
 * of packages it installed.
 * If there are no devDeps to install, optionally runs
 * the package manager's install command.
 */
async function installPackages(
	shouldRunInstall: boolean,
	depsToInstall: string[],
	packageManager: PackageManager
) {
	//lets install the devDeps they asked for
	//and run their package manager's install command if needed
	if (depsToInstall.length > 0) {
		const formatter = new Intl.ListFormat("en-US", {
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

async function getNewWorkerType(newWorkerFilename: string) {
	return select(`Would you like to create a Worker at ${newWorkerFilename}?`, {
		choices: [
			{
				value: "none",
				title: "None",
			},
			{
				value: "fetch",
				title: "Fetch handler",
			},
			{
				value: "scheduled",
				title: "Scheduled handler",
			},
		],
		defaultOption: 1,
	});
}

async function getNewWorkerTestType(yesFlag?: boolean) {
	return yesFlag
		? "jest"
		: select(`Which test runner would you like to use?`, {
				choices: [
					{
						value: "vitest",
						title: "Vitest",
					},
					{
						value: "jest",
						title: "Jest",
					},
				],
				defaultOption: 1,
			});
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

async function getWorkerConfig(
	accountId: string,
	workerName: string,
	entrypoint: string,
	serviceEnvironment: string
): Promise<RawConfig> {
	const [
		bindings,
		routes,
		customDomains,
		workersDev,
		serviceEnvMetadata,
		cronTriggers,
	] = await Promise.all([
		fetchResult<WorkerMetadata["bindings"]>(
			`/accounts/${accountId}/workers/services/${workerName}/environments/${serviceEnvironment}/bindings`
		),
		fetchResult<RoutesRes>(
			`/accounts/${accountId}/workers/services/${workerName}/environments/${serviceEnvironment}/routes?show_zonename=true`
		),
		fetchResult<CustomDomainsRes>(
			`/accounts/${accountId}/workers/domains/records?page=0&per_page=5&service=${workerName}&environment=${serviceEnvironment}`
		),

		fetchResult<WorkersDevRes>(
			`/accounts/${accountId}/workers/services/${workerName}/environments/${serviceEnvironment}/subdomain`
		),

		fetchResult<ServiceMetadataRes["default_environment"]>(
			`/accounts/${accountId}/workers/services/${workerName}/environments/${serviceEnvironment}`
		),
		fetchResult<CronTriggersRes>(
			`/accounts/${accountId}/workers/scripts/${workerName}/schedules`
		),
	]).catch((e) => {
		throw new Error(
			`Error Occurred ${e}: Unable to fetch bindings, routes, or services metadata from the dashboard. Please try again later.`
		);
	});

	const mappedBindings = await mapBindings(accountId, bindings);

	const durableObjectClassNames = bindings
		.filter((binding) => binding.type === "durable_object_namespace")
		.map(
			(durableObject) => (durableObject as { class_name: string }).class_name
		);

	const allRoutes: Route[] = [
		...routes.map(
			(r) => ({ pattern: r.pattern, zone_name: r.zone_name }) as ZoneNameRoute
		),
		...customDomains.map(
			(c) =>
				({
					pattern: c.hostname,
					zone_name: c.zone_name,
					custom_domain: true,
				}) as CustomDomainRoute
		),
	];

	return {
		name: workerName,
		main: entrypoint,
		workers_dev: workersDev.enabled,
		preview_urls: workersDev.previews_enabled,
		compatibility_date:
			serviceEnvMetadata.script.compatibility_date ??
			new Date().toISOString().substring(0, 10),
		compatibility_flags: serviceEnvMetadata.script.compatibility_flags,
		...(allRoutes.length ? { routes: allRoutes } : {}),
		placement:
			serviceEnvMetadata.script.placement_mode === "smart"
				? { mode: "smart" }
				: undefined,
		limits: serviceEnvMetadata.script.limits,
		...(durableObjectClassNames.length
			? {
					migrations: [
						{
							tag: serviceEnvMetadata.script.migration_tag,
							new_classes: durableObjectClassNames,
						},
					],
				}
			: {}),
		...(cronTriggers.schedules.length
			? {
					triggers: {
						crons: cronTriggers.schedules.map((scheduled) => scheduled.cron),
					},
				}
			: {}),
		tail_consumers: serviceEnvMetadata.script.tail_consumers,
		observability: serviceEnvMetadata.script.observability,
		...mappedBindings,
	};
}

export async function mapBindings(
	accountId: string,
	bindings: WorkerMetadataBinding[]
): Promise<RawConfig> {
	//the binding API doesn't provide us with enough information to make a friendly user experience.
	//lets call D1's API to get more information
	const d1BindingsWithInfo: Record<string, DatabaseInfo> = {};
	await Promise.all(
		bindings
			.filter((binding) => binding.type === "d1")
			.map(async (binding) => {
				const dbInfo = await getDatabaseInfoFromId(accountId, binding.id);
				d1BindingsWithInfo[binding.id] = dbInfo;
			})
	);

	return (
		bindings
			.filter((binding) => (binding.type as string) !== "secret_text")
			// Combine the same types into {[type]: [binding]}
			.reduce((configObj, binding) => {
				// Some types have different names in wrangler.toml
				// I want the type safety of the binding being destructured after the case narrowing the union but type is unused

				switch (binding.type) {
					case "plain_text":
						{
							configObj.vars = {
								...(configObj.vars ?? {}),
								[binding.name]: binding.text,
							};
						}
						break;
					case "json":
						{
							configObj.vars = {
								...(configObj.vars ?? {}),
								name: binding.name,
								json: binding.json,
							};
						}
						break;
					case "kv_namespace":
						{
							configObj.kv_namespaces = [
								...(configObj.kv_namespaces ?? []),
								{ id: binding.namespace_id, binding: binding.name },
							];
						}
						break;
					case "durable_object_namespace":
						{
							configObj.durable_objects = {
								bindings: [
									...(configObj.durable_objects?.bindings ?? []),
									{
										name: binding.name,
										class_name: binding.class_name,
										script_name: binding.script_name,
										environment: binding.environment,
									},
								],
							};
						}
						break;
					case "d1":
						{
							configObj.d1_databases = [
								...(configObj.d1_databases ?? []),
								{
									binding: binding.name,
									database_id: binding.id,
									database_name: d1BindingsWithInfo[binding.id].name,
								},
							];
						}
						break;
					case "browser":
						{
							configObj.browser = {
								binding: binding.name,
							};
						}
						break;
					case "ai":
						{
							configObj.ai = {
								binding: binding.name,
							};
						}
						break;
					case "r2_bucket":
						{
							configObj.r2_buckets = [
								...(configObj.r2_buckets ?? []),
								{
									binding: binding.name,
									bucket_name: binding.bucket_name,
									jurisdiction: binding.jurisdiction,
								},
							];
						}
						break;
					case "service":
						{
							configObj.services = [
								...(configObj.services ?? []),
								{
									binding: binding.name,
									service: binding.service,
									environment: binding.environment,
									entrypoint: binding.entrypoint,
								},
							];
						}
						break;
					case "analytics_engine":
						{
							configObj.analytics_engine_datasets = [
								...(configObj.analytics_engine_datasets ?? []),
								{ binding: binding.name, dataset: binding.dataset },
							];
						}
						break;
					case "dispatch_namespace":
						{
							configObj.dispatch_namespaces = [
								...(configObj.dispatch_namespaces ?? []),
								{
									binding: binding.name,
									namespace: binding.namespace,
									...(binding.outbound && {
										outbound: {
											service: binding.outbound.worker.service,
											environment: binding.outbound.worker.environment,
											parameters:
												binding.outbound.params?.map((p) => p.name) ?? [],
										},
									}),
								},
							];
						}
						break;
					case "logfwdr":
						{
							configObj.logfwdr = {
								bindings: [
									...(configObj.logfwdr?.bindings ?? []),
									{ name: binding.name, destination: binding.destination },
								],
							};
						}
						break;
					case "wasm_module":
						{
							configObj.wasm_modules = {
								...(configObj.wasm_modules ?? {}),
								[binding.name]: binding.part,
							};
						}
						break;
					case "text_blob":
						{
							configObj.text_blobs = {
								...(configObj.text_blobs ?? {}),
								[binding.name]: binding.part,
							};
						}
						break;
					case "data_blob":
						{
							configObj.data_blobs = {
								...(configObj.data_blobs ?? {}),
								[binding.name]: binding.part,
							};
						}
						break;
					case "secret_text":
						// Ignore secrets
						break;
					case "version_metadata": {
						{
							configObj.version_metadata = {
								binding: binding.name,
							};
						}
						break;
					}
					case "send_email": {
						configObj.send_email = [
							...(configObj.send_email ?? []),
							{
								name: binding.name,
								destination_address: binding.destination_address,
								allowed_destination_addresses:
									binding.allowed_destination_addresses,
							},
						];
						break;
					}
					case "queue":
						configObj.queues ??= { producers: [] };
						configObj.queues.producers = [
							...(configObj.queues.producers ?? []),
							{
								binding: binding.name,
								queue: binding.queue_name,
								delivery_delay: binding.delivery_delay,
							},
						];
						break;
					case "vectorize":
						configObj.vectorize = [
							...(configObj.vectorize ?? []),
							{
								binding: binding.name,
								index_name: binding.index_name,
							},
						];
						break;
					case "hyperdrive":
						configObj.hyperdrive = [
							...(configObj.hyperdrive ?? []),
							{
								binding: binding.name,
								id: binding.id,
							},
						];
						break;
					case "mtls_certificate":
						configObj.mtls_certificates = [
							...(configObj.mtls_certificates ?? []),
							{
								binding: binding.name,
								certificate_id: binding.certificate_id,
							},
						];
						break;
					case "pipelines":
						configObj.pipelines = [
							...(configObj.pipelines ?? []),
							{
								binding: binding.name,
								pipeline: binding.pipeline,
							},
						];
						break;
					case "assets":
						throw new FatalError(
							"`wrangler init --from-dash` is not yet supported for Workers with Assets"
						);
					case "inherit":
						configObj.unsafe = {
							bindings: [...(configObj.unsafe?.bindings ?? []), binding],
							metadata: configObj.unsafe?.metadata ?? undefined,
						};
						break;
					case "workflow":
						{
							configObj.workflows = [
								...(configObj.workflows ?? []),
								{
									binding: binding.name,
									name: binding.workflow_name,
									class_name: binding.class_name,
									script_name: binding.script_name,
								},
							];
						}
						break;
					default: {
						configObj.unsafe = {
							bindings: [...(configObj.unsafe?.bindings ?? []), binding],
							metadata: configObj.unsafe?.metadata ?? undefined,
						};
						assertNever(binding);
					}
				}

				return configObj;
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			}, {} as RawConfig)
	);
}

/** Assert that there is no type argument passed. */
function assertNoTypeArg(args: InitArgs) {
	if (args.type) {
		let message = "The --type option is no longer supported.";
		if (args.type === "webpack") {
			message +=
				"\nIf you wish to use webpack then you will need to create a custom build.";
			// TODO: Add a link to docs
		}
		throw new CommandLineArgsError(message);
	}
}

function assertNoSiteArg(args: InitArgs, creationDirectory: string) {
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
}

export async function downloadWorker(accountId: string, workerName: string) {
	const serviceMetadata = await fetchResult<ServiceMetadataRes>(
		`/accounts/${accountId}/workers/services/${workerName}`
	);

	const defaultEnvironment = serviceMetadata?.default_environment.environment;

	// Use the default environment, assuming it's the most up to date code.
	const { entrypoint, modules } = await fetchWorker(
		`/accounts/${accountId}/workers/services/${workerName}/environments/${defaultEnvironment}/content/v2`
	);

	const config = await getWorkerConfig(
		accountId,
		workerName,
		entrypoint,
		defaultEnvironment
	);

	return {
		modules,
		config,
	};
}
