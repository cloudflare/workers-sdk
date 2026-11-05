import assert from "node:assert";
import { existsSync, statSync, type Stats } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { brandColor } from "@cloudflare/cli-shared-helpers/colors";
import {
	checkWorkerNameValidity,
	getWorkerName,
	NpmPackageManager,
	parsePackageJSON,
	readFileSync,
} from "@cloudflare/workers-utils";
import { AutoConfigDetectionError } from "../errors";
import { getFrameworkClassInstance } from "../frameworks";
import {
	getAllFrameworksInfos,
	staticFramework,
} from "../frameworks/all-frameworks";
import { detectFramework } from "./framework-detection";
import type { AutoConfigContext, AutoConfigTarget } from "../context";
import type {
	AutoConfigDetails,
	AutoConfigDetailsForNonConfiguredProject,
} from "../types";
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

	const { detectedFramework, packageManager, isWorkspaceRoot } =
		await detectFramework(projectPath, context, { wranglerConfig, target });

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
	const framework = useStaticAssets
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

	const outputDir =
		requestedOutputDir !== undefined && framework.id === staticFramework.id
			? normalizeOutputDir(projectPath, requestedOutputDir)
			: (detectedFramework?.dist ?? (await findAssetsDir(projectPath)));

	const baseDetails = {
		projectPath,
		framework,
		packageJson,
		packageManager,
		devCommand: useStaticAssets
			? undefined
			: getProjectCommand(
					detectedFramework.devCommand,
					packageManager,
					packageJson
				),
		buildCommand: useStaticAssets
			? undefined
			: getProjectCommand(
					detectedFramework.buildCommand,
					packageManager,
					packageJson
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

	// A `functions` directory next to static files in the project root usually
	// means a Cloudflare Pages project using Pages Functions. Interactively the
	// user is asked whether it is a Pages project; non-interactive runs assume it
	// is not and continue as a static site, which would deploy the project root
	// as assets and silently drop the Functions (the API routes). Stop instead.
	// This checks the framework class rather than the detected id, because
	// detected frameworks missing from `allFrameworksInfos` are also configured as
	// static sites and would deploy the project root the same way.
	if (
		framework.id === staticFramework.id &&
		(context.isNonInteractiveOrCI?.() ?? false) &&
		resolve(projectPath, outputDir) === resolve(projectPath) &&
		(await getPathStats(join(projectPath, "functions")))?.isDirectory()
	) {
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
				frameworkId: framework.id,
				configured,
			}
		);
	}

	return {
		...baseDetails,
		outputDir,
		configured: false,
		isWorkspaceRoot,
	};
}

/**
 * Converts a detected project command into one that can be run in the terminal
 * (such as `npm run build` or `npx astro dev`). If no command is detected
 * `undefined` is returned instead.
 *
 * @param command The detected project command
 * @param packageManager The package manager to use for command prefixes
 * @param packageJson The optional project manifest used to detect Vite+
 * @returns A runnable project command if detected, undefined otherwise
 */
export function getProjectCommand(
	command: string | undefined,
	packageManager: PackageManager,
	packageJson?: PackageJSON
): string | undefined {
	if (!command) {
		return undefined;
	}

	const { type, dlx, npx } = packageManager;
	if (
		packageJson?.dependencies?.["vite-plus"] ||
		packageJson?.devDependencies?.["vite-plus"]
	) {
		if (
			["vite", "vite dev", `${npx} vite`, `${npx} vite dev`].includes(command)
		) {
			return `${npx} vp dev`;
		}
		if (command === "vite build" || command === `${npx} vite build`) {
			return `${npx} vp build`;
		}
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
