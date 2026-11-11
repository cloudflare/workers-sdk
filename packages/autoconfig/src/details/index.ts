import assert from "node:assert";
import { existsSync, statSync, type Stats } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { brandColor } from "@cloudflare/cli-shared-helpers/colors";
import {
	checkWorkerNameValidity,
	getWorkerName,
	NpmPackageManager,
	parsePackageJSON,
	readFileSync,
} from "@cloudflare/workers-utils";
import {
	AutoConfigDetectionError,
	AutoConfigFrameworkConfigurationError,
} from "../errors";
import { getFrameworkClassInstance } from "../frameworks";
import {
	getAllFrameworksInfos,
	staticFramework,
} from "../frameworks/all-frameworks";
import { detectFramework } from "./framework-detection";
import { getViteProjectCommands, usesVitePlus } from "./vite-commands";
import type { AutoConfigContext, AutoConfigTarget } from "../context";
import type {
	AutoConfigDetails,
	AutoConfigDetailsForNonConfiguredProject,
} from "../types";
import type { DetectedFramework } from "./framework-detection";
import type { PackageManager } from "@cloudflare/workers-utils";
import type { Config, PackageJSON } from "@cloudflare/workers-utils";

const CLOUDFLARE_CONFIG_FILE = "cloudflare.config.ts";

/**
 * Asserts that the current project being targeted for autoconfig is not already configured.
 *
 * @param details The details detected for the project.
 */
export function assertNonConfigured(
	details: AutoConfigDetails
): asserts details is AutoConfigDetailsForNonConfiguredProject {
	assert(
		details.configured === false,
		"Error: expected the current project not to be already configured"
	);
}

function isExpectedFileSystemError(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error.code === "ENOENT" ||
			error.code === "ENOTDIR" ||
			error.code === "EACCES" ||
			error.code === "EPERM")
	);
}

async function getPathStats(path: string): Promise<Stats | undefined> {
	try {
		return await stat(path);
	} catch (error) {
		if (isExpectedFileSystemError(error)) {
			return undefined;
		}
		throw error;
	}
}

async function hasIndexHtml(dir: string): Promise<boolean> {
	const stats = await getPathStats(join(dir, "index.html"));
	if (!stats?.isFile()) {
		return false;
	}

	try {
		return (await readdir(dir)).includes("index.html");
	} catch (error) {
		if (isExpectedFileSystemError(error)) {
			return false;
		}
		throw error;
	}
}

/**
 * If we haven't detected a framework being used, or the project is a Pages one, we need to "guess" what output dir the
 * user is intending to use. This is best-effort, and so will not be accurate all the time. The heuristic we use is the
 * first child directory with an `index.html` file present.
 */
async function findAssetsDir(from: string): Promise<string | undefined> {
	if (await hasIndexHtml(from)) {
		return ".";
	}
	const children = await readdir(from);
	for (const child of children) {
		const path = join(from, child);
		const stats = await getPathStats(path);
		if (stats?.isDirectory() && (await hasIndexHtml(path))) {
			return relative(from, path);
		}
	}
	return undefined;
}

/**
 * Expresses a caller-supplied output directory relative to the project, matching
 * the shape of a detected one (e.g. `"public"`, or `"."` for the project itself).
 */
function normalizeOutputDir(projectPath: string, outputDir: string): string {
	return relative(projectPath, resolve(projectPath, outputDir)) || ".";
}

/**
 * Detects project details needed for autoconfig: framework, package manager,
 * output directory, worker name, commands, and whether the project is already configured.
 * By default, the project is considered configured when `cloudflare.config.ts`
 * exists. Passing `target: "wrangler"` opts into Wrangler configuration
 * detection instead.
 *
 * For the cf target, build and dev commands may use bare framework executables.
 * Callers must resolve these from `nodeModulesPaths`, which includes the
 * application and its detected workspace, excluding unrelated parent installs.
 * Command readiness problems are reported in `commandError` without preventing
 * inspection of the project's configuration.
 *
 * @param options - Detection options including project path, wrangler config, and context.
 * @returns The detected project details.
 */
export async function getDetailsForAutoConfig({
	projectPath = process.cwd(),
	wranglerConfig,
	target = "cf",
	outputDir: requestedOutputDir,
	context,
}: {
	/** The path to the project, defaults to cwd. */
	projectPath?: string;
	/** The parsed wrangler configuration for the project (if any). */
	wranglerConfig?: Config;
	/** The configuration target, defaults to cf. */
	target?: AutoConfigTarget;
	/**
	 * A directory of built static assets the caller has already chosen,
	 * for example the directory passed to `wrangler pages deploy <directory>`.
	 * Selects static-asset configuration instead of framework configuration, so
	 * a framework adapter or build cannot replace the requested assets. Existing
	 * Workers and Pages configurations, including framework-managed deployments,
	 * retain their usual detection behavior.
	 * Relative paths are resolved against `projectPath`.
	 */
	outputDir?: string;
	/** The autoconfig context providing logger, dialogs, and other dependencies. */
	context: AutoConfigContext;
}): Promise<AutoConfigDetails> {
	const { logger } = context;

	logger.debug(`Running autoconfig detection in ${projectPath}...`);

	const hasCloudflareConfig =
		target === "cf" && existsSync(resolve(projectPath, CLOUDFLARE_CONFIG_FILE));

	if (
		target === "wrangler" &&
		// If a real Wrangler config has been found the project is already configured for Workers
		wranglerConfig?.configPath &&
		// Unless `pages_build_output_dir` is set, since that indicates that the project is a Pages one instead
		!wranglerConfig.pages_build_output_dir
	) {
		return {
			configured: true,
			projectPath,
			workerName: getWorkerName(wranglerConfig.name, projectPath),
			// Fall back to npm when already configured since we don't need to run package manager commands
			packageManager: NpmPackageManager,
		};
	}

	const { detectedFramework, packageManager, isWorkspaceRoot, workspaceRoot } =
		await detectFramework(projectPath, context, { wranglerConfig, target });
	const nodeModulesPaths = getNodeModulesPaths(projectPath, workspaceRoot);

	const detectedFrameworkInstance = getFrameworkClassInstance(
		detectedFramework.framework.id,
		target
	);
	const configured =
		hasCloudflareConfig ||
		detectedFrameworkInstance.isConfigured(projectPath, { target });
	const useStaticAssets =
		!configured &&
		requestedOutputDir !== undefined &&
		detectedFramework.framework.id !== "cloudflare-pages";
	let framework = useStaticAssets
		? getFrameworkClassInstance(staticFramework.id, target)
		: detectedFrameworkInstance;
	const packageJsonPath = resolve(projectPath, "package.json");

	let packageJson: PackageJSON | undefined;

	try {
		packageJson = parsePackageJSON(
			readFileSync(packageJsonPath),
			packageJsonPath
		);
	} catch {
		logger.debug("No package.json found when running autoconfig");
	}

	let outputDir = configured
		? undefined
		: requestedOutputDir !== undefined && framework.id === staticFramework.id
			? normalizeOutputDir(projectPath, requestedOutputDir)
			: (detectedFramework.dist ?? (await findAssetsDir(projectPath)));

	// Unknown frameworks also use the static class. Validate its assets before
	// a native Vite fallback can replace the framework and output directory.
	if (!configured && framework.id === staticFramework.id) {
		await assertNoPagesFunctionsWithRootAssets(
			projectPath,
			outputDir,
			target,
			context
		);
	}

	const inspectViteProject = canInspectViteProject({
		target,
		useStaticAssets,
		configured,
		detectedFramework,
	});
	const useNativeCommands =
		!detectedFramework.devCommand && !detectedFramework.buildCommand;
	const viteCommands = inspectViteProject
		? getViteProjectCommands({
				packageJson,
				nodeModulesPaths,
				resolveCommands: useNativeCommands || framework.id === "vite",
			})
		: undefined;
	const fallbackCommands = useNativeCommands ? viteCommands : undefined;
	if (fallbackCommands) {
		framework = getFrameworkClassInstance("vite", target);
	}

	if (fallbackCommands && detectedFramework.dist === undefined) {
		outputDir = "dist";
	}

	const baseDetails = {
		projectPath,
		framework,
		packageJson,
		packageManager,
		nodeModulesPaths,
		commandError: viteCommands?.error,
		devCommand: useStaticAssets
			? undefined
			: getProjectCommand(
					detectedFramework.devCommand ?? fallbackCommands?.devCommand,
					packageManager,
					packageJson,
					target
				),
		buildCommand: useStaticAssets
			? undefined
			: getProjectCommand(
					detectedFramework.buildCommand ?? fallbackCommands?.buildCommand,
					packageManager,
					packageJson,
					target
				),
		env: framework.env,
		workerName: getWorkerName(packageJson?.name, projectPath),
	};

	if (configured) {
		return {
			...baseDetails,
			configured: true,
			isWorkspaceRoot,
		};
	}

	if (!outputDir) {
		const errorMessage =
			framework.id === "static" || framework.id === "cloudflare-pages"
				? "Could not detect a directory containing static files (e.g. html, css and js) for the project"
				: "Failed to detect an output directory for the project";

		throw new AutoConfigDetectionError(errorMessage, {
			telemetryMessage: "autoconfig details output directory missing",
			frameworkId: framework.id,
			configured,
		});
	}

	return {
		...baseDetails,
		outputDir,
		configured: false,
		isWorkspaceRoot,
	};
}

/**
 * Rejects unconfigured static sites whose root assets would silently omit Pages
 * Functions. Interactive detection can ask the user whether this is a Pages
 * project, but non-interactive detection assumes it is a static site.
 */
async function assertNoPagesFunctionsWithRootAssets(
	projectPath: string,
	outputDir: string | undefined,
	target: AutoConfigTarget,
	context: AutoConfigContext
): Promise<void> {
	if (
		!(context.isNonInteractiveOrCI?.() ?? false) ||
		outputDir === undefined ||
		resolve(projectPath, outputDir) !== resolve(projectPath) ||
		!(await getPathStats(join(projectPath, "functions")))?.isDirectory()
	) {
		return;
	}

	const configFile =
		target === "cf"
			? `a \`${CLOUDFLARE_CONFIG_FILE}\` file`
			: "a Wrangler configuration file";
	throw new AutoConfigDetectionError(
		"This project has a `functions` directory and static files in its root, which looks like a Cloudflare Pages project using Pages Functions. " +
			"Automatic configuration cannot migrate Pages Functions to Workers yet, and deploying the project root as static assets would leave the Functions undeployed.\n" +
			"If `functions` contains Pages Functions, move the static files into a subdirectory (for example `public/`) and deploy with `wrangler pages deploy public --project-name <name>`, " +
			"or migrate the Functions to a Worker: https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/\n" +
			`If \`functions\` is not Pages Functions, move the static files into a subdirectory or add ${configFile} for the Worker.`,
		{
			telemetryMessage: "autoconfig details pages functions with root assets",
			frameworkId: staticFramework.id,
			configured: false,
		}
	);
}

/**
 * Keeps native execution from bypassing Pages detection or unsupported setup.
 * An existing configuration can opt an otherwise unsupported project into execution.
 */
function canInspectViteProject({
	target,
	useStaticAssets,
	configured,
	detectedFramework,
}: {
	target: AutoConfigTarget;
	useStaticAssets: boolean;
	configured: boolean;
	detectedFramework: DetectedFramework;
}): boolean {
	if (
		target !== "cf" ||
		useStaticAssets ||
		detectedFramework.framework.id === "cloudflare-pages"
	) {
		return false;
	}
	if (configured) {
		return true;
	}

	const frameworkInfo = getAllFrameworksInfos(target).find(
		({ id }) => id === detectedFramework.framework.id
	);
	return frameworkInfo?.supported === true && frameworkInfo.supportsCf;
}

/**
 * Requires runnable project commands at an execution boundary. Read-only callers
 * can inspect detection results, including missing installs, without throwing.
 *
 * @param details The detected project details
 * @throws {AutoConfigFrameworkConfigurationError} If project commands are unavailable
 */
export function assertProjectCommandsAvailable(
	details: AutoConfigDetails
): void {
	if (details.commandError) {
		throw new AutoConfigFrameworkConfigurationError(
			details.commandError.message,
			{
				telemetryMessage: "autoconfig vite command unavailable",
			}
		);
	}
}

/** Restricts package lookup to the application and its validated workspace. */
function getNodeModulesPaths(
	projectPath: string,
	workspaceRoot?: string
): string[] {
	const directories: string[] = [];
	const root = resolve(workspaceRoot ?? projectPath);
	let directory = resolve(projectPath);
	while (true) {
		directories.push(join(directory, "node_modules"));
		if (directory === root || dirname(directory) === directory) {
			return directories;
		}
		directory = dirname(directory);
	}
}

/**
 * Converts a detected project command for the target's command runner. The cf
 * runner must resolve local executables, while Wrangler commands include
 * package-manager prefixes. Returns `undefined` if no command is detected.
 *
 * @param command The detected project command
 * @param packageManager The package manager to use for command prefixes
 * @param packageJson The optional project manifest used to detect Vite+
 * @param target The consumer, defaults to cf and requires local executable lookup
 * @returns A runnable project command if detected, undefined otherwise
 */
export function getProjectCommand(
	command: string | undefined,
	packageManager: PackageManager,
	packageJson?: PackageJSON,
	target: AutoConfigTarget = "cf"
): string | undefined {
	if (!command) {
		return undefined;
	}

	const { type, dlx, npx } = packageManager;
	const executablePrefix = target === "cf" ? "" : `${npx} `;
	if (usesVitePlus(packageJson)) {
		if (
			["vite", "vite dev", `${npx} vite`, `${npx} vite dev`].includes(command)
		) {
			return `${executablePrefix}vp dev`;
		}
		if (command === "vite build" || command === `${npx} vite build`) {
			return `${executablePrefix}vp build`;
		}
	}
	if (target === "cf") {
		return command;
	}

	for (const packageManagerCommandPrefix of [type, dlx.join(" "), npx]) {
		if (command.startsWith(packageManagerCommandPrefix)) {
			// The command already includes a package-manager prefix.
			return command;
		}
	}

	// Framework executables such as `astro build` need the appropriate package-manager prefix.
	return `${npx} ${command}`;
}

/**
 * Displays the detected autoconfig details to the user via the context logger.
 *
 * @param autoConfigDetails - The detected project details to display.
 * @param context - The autoconfig context providing the logger.
 * @param displayOptions - Optional display customization.
 */
export function displayAutoConfigDetails(
	autoConfigDetails: AutoConfigDetails,
	context: AutoConfigContext,
	displayOptions?: { heading?: string }
): void {
	const { logger } = context;
	logger.log("");

	logger.log(displayOptions?.heading ?? "Detected Project Settings:");

	logger.log(brandColor(" - Worker Name:"), autoConfigDetails.workerName);
	if (autoConfigDetails.framework) {
		logger.log(brandColor(" - Framework:"), autoConfigDetails.framework.name);
	}
	if (autoConfigDetails.buildCommand) {
		logger.log(brandColor(" - Build Command:"), autoConfigDetails.buildCommand);
	}
	if (autoConfigDetails.outputDir) {
		logger.log(brandColor(" - Output Directory:"), autoConfigDetails.outputDir);
	}

	logger.log("");
}

/**
 * Prompts the user to confirm or modify the detected autoconfig details.
 *
 * @param autoConfigDetails - The detected project details.
 * @param context - The autoconfig context providing dialogs.
 * @param target - The configuration target, defaults to cf.
 * @returns The (possibly updated) autoconfig details.
 */
export async function confirmAutoConfigDetails(
	autoConfigDetails: AutoConfigDetails,
	context: AutoConfigContext,
	target: AutoConfigTarget = "cf"
): Promise<AutoConfigDetails> {
	const { dialogs } = context;
	const allFrameworksInfos = getAllFrameworksInfos(target);
	const modifySettings = await dialogs.confirm(
		"Do you want to modify these settings?",
		{ defaultValue: false, fallbackValue: false }
	);

	if (!modifySettings) {
		return autoConfigDetails;
	}

	// Just spreading the object to shallow clone it to avoid some potential side effects
	const { ...updatedAutoConfigDetails } = autoConfigDetails;

	const workerName = await dialogs.prompt(
		"What do you want to name your Worker?",
		{
			defaultValue: autoConfigDetails.workerName ?? "",
			validate: (value: string) => {
				const validity = checkWorkerNameValidity(value);
				if (validity.valid) {
					return true;
				}
				return validity.cause;
			},
		}
	);

	updatedAutoConfigDetails.workerName = workerName;

	const frameworkId = await dialogs.select(
		"What framework is your application using?",
		{
			choices: allFrameworksInfos.map((f) => ({
				title: f.name,
				value: f.id,
				description:
					f.id === staticFramework.id
						? "No framework at all, or a static framework such as Vite, React or Gatsby."
						: `The ${f.name} JavaScript framework`,
			})),
			defaultOption: allFrameworksInfos.findIndex((framework) => {
				if (!autoConfigDetails?.framework) {
					// If there is no framework already detected let's default to the static one
					// (note: there should always be a framework at this point)
					return framework.id === staticFramework.id;
				}
				return autoConfigDetails.framework.id === framework.id;
			}),
		}
	);

	updatedAutoConfigDetails.framework = getFrameworkClassInstance(
		frameworkId,
		target
	);

	const outputDir = await dialogs.prompt(
		"What directory contains your applications' output/asset files?",
		{
			defaultValue: autoConfigDetails.outputDir ?? "",
			validate: async (value) => {
				if (!value) {
					return "Please provide a valid directory path";
				}
				const valueStats = statSync(resolve(value), { throwIfNoEntry: false });
				if (!valueStats) {
					// If the path doesn't point to anything that's fine since the directory will likely be
					// generated by the build command anyways
					return true;
				}
				if (valueStats?.isFile()) {
					return "Please select a directory";
				}
				return true;
			},
		}
	);

	updatedAutoConfigDetails.outputDir = outputDir;

	if (autoConfigDetails.buildCommand || autoConfigDetails.packageJson) {
		const buildCommand = await dialogs.prompt(
			"What is your application's build command?",
			{
				defaultValue: autoConfigDetails.buildCommand ?? "",
			}
		);

		updatedAutoConfigDetails.buildCommand = buildCommand;
	}

	return updatedAutoConfigDetails;
}
