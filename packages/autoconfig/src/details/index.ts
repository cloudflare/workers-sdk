import assert from "node:assert";
import { statSync } from "node:fs";
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
	allFrameworksInfos,
	staticFramework,
} from "../frameworks/all-frameworks";
import { detectFramework } from "./framework-detection";
import type { AutoConfigContext } from "../context";
import type {
	AutoConfigDetails,
	AutoConfigDetailsForNonConfiguredProject,
} from "../types";
import type { PackageManager } from "@cloudflare/workers-utils";
import type { Config, PackageJSON } from "@cloudflare/workers-utils";

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

async function hasIndexHtml(dir: string): Promise<boolean> {
	const children = await readdir(dir);
	for (const child of children) {
		const stats = await stat(join(dir, child));
		if (stats.isFile() && child === "index.html") {
			return true;
		}
	}
	return false;
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
		const stats = await stat(path);
		if (stats.isDirectory() && (await hasIndexHtml(path))) {
			return relative(from, path);
		}
	}
	return undefined;
}

type DetectedFramework = {
	framework: {
		name: string;
		id: string;
	};
	buildCommand?: string | undefined;
	dist?: string;
};

/**
 * Detects project details needed for autoconfig: framework, package manager,
 * output directory, worker name, and whether the project is already configured.
 *
 * @param options - Detection options including project path, wrangler config, and context.
 * @returns The detected project details.
 */
export async function getDetailsForAutoConfig({
	projectPath = process.cwd(),
	wranglerConfig,
	context,
}: {
	/** The path to the project, defaults to cwd. */
	projectPath?: string;
	/** The parsed wrangler configuration for the project (if any). */
	wranglerConfig?: Config;
	/** The autoconfig context providing logger, dialogs, and other dependencies. */
	context: AutoConfigContext;
}): Promise<AutoConfigDetails> {
	const { logger } = context;

	logger.debug(`Running autoconfig detection in ${projectPath}...`);

	if (
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
		await detectFramework(projectPath, context, wranglerConfig);

	const framework = getFrameworkClassInstance(detectedFramework.framework.id);
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

	const configured = framework.isConfigured(projectPath) ?? false;

	const outputDir =
		detectedFramework?.dist ?? (await findAssetsDir(projectPath));

	const baseDetails = {
		projectPath,
		framework,
		packageJson,
		packageManager,
		...(detectedFramework
			? {
					buildCommand: getProjectBuildCommand(
						detectedFramework,
						packageManager
					),
				}
			: {}),
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
 * Given a detected framework this function gets a `build` command for the target project that can be run in the terminal
 * (such as `npm run build` or `npx astro build`). If no build command is detected `undefined` is returned instead.
 *
 * @param detectedFramework The detected framework (or settings) for the project
 * @param packageManager The package manager to use for command prefixes
 * @returns A runnable command for the build process if detected, undefined otherwise
 */
function getProjectBuildCommand(
	detectedFramework: DetectedFramework,
	packageManager: PackageManager
): string | undefined {
	if (!detectedFramework.buildCommand) {
		return undefined;
	}

	const { type, dlx, npx } = packageManager;

	for (const packageManagerCommandPrefix of [type, dlx.join(" "), npx]) {
		if (
			detectedFramework.buildCommand.startsWith(packageManagerCommandPrefix)
		) {
			// The build command already is something like `npm run build` or similar
			return detectedFramework.buildCommand;
		}
	}

	// The command is something like `astro build` so we need to prefix it with `npx` and equivalents
	return `${npx} ${detectedFramework.buildCommand}`;
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
 * @returns The (possibly updated) autoconfig details.
 */
export async function confirmAutoConfigDetails(
	autoConfigDetails: AutoConfigDetails,
	context: AutoConfigContext
): Promise<AutoConfigDetails> {
	const { dialogs } = context;
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

	updatedAutoConfigDetails.framework = getFrameworkClassInstance(frameworkId);

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
