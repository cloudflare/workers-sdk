import assert from "node:assert";
import { statSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { brandColor } from "@cloudflare/cli/colors";
import {
	FatalError,
	getCIOverrideName,
	parsePackageJSON,
	readFileSync,
} from "@cloudflare/workers-utils";
import { Project } from "@netlify/build-info";
import { NodeFS } from "@netlify/build-info/node";
import { captureException } from "@sentry/node";
import { getErrorType } from "../core/handle-errors";
import { confirm, prompt, select } from "../dialogs";
import { logger } from "../logger";
import { sendMetricsEvent } from "../metrics";
import { getPackageManager } from "../package-manager";
import { allKnownFrameworks, getFramework } from "./frameworks/get-framework";
import {
	getAutoConfigId,
	getAutoConfigTriggerCommand,
} from "./telemetry-utils";
import type {
	AutoConfigDetails,
	AutoConfigDetailsForNonConfiguredProject,
} from "./types";
import type { Config, PackageJSON } from "@cloudflare/workers-utils";
import type { Settings } from "@netlify/build-info";

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

class MultipleFrameworksError extends FatalError {
	constructor(frameworks: string[]) {
		super(
			`Wrangler was unable to automatically configure your project to work with Cloudflare, since multiple frameworks were found: ${frameworks.join(", ")}`,
			1,
			{ telemetryMessage: true }
		);
	}
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
 * If we haven't detected a framework being used, we need to "guess" what output dir the user is intending to use.
 * This is best-effort, and so will not be accurate all the time. The heuristic we use is the first child directory
 * with an `index.html` file present.
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

function getWorkerName(projectOrWorkerName = "", projectPath: string): string {
	const rawName =
		getCIOverrideName() ?? (projectOrWorkerName || basename(projectPath));

	return toValidWorkerName(rawName);
}

/**
 * Derives a valid worker name from a project directory.
 *
 * The name is determined by (in order of precedence):
 * 1. The WRANGLER_CI_OVERRIDE_NAME environment variable (for CI environments)
 * 2. The `name` field from package.json in the project directory
 * 3. The directory basename
 *
 * The resulting name is sanitized to be a valid worker name.
 *
 * @param projectPath The path to the project directory
 * @returns A valid worker name
 */
export function getWorkerNameFromProject(projectPath: string): string {
	const packageJsonPath = resolve(projectPath, "package.json");
	let packageJsonName: string | undefined;

	try {
		const packageJson = parsePackageJSON(
			readFileSync(packageJsonPath),
			packageJsonPath
		);
		packageJsonName = packageJson.name;
	} catch {}

	return getWorkerName(packageJsonName, projectPath);
}

export async function getDetailsForAutoConfig({
	projectPath = process.cwd(),
	wranglerConfig,
}: {
	projectPath?: string; // the path to the project, defaults to cwd
	wranglerConfig?: Config;
} = {}): Promise<AutoConfigDetails> {
	logger.debug(`Running autoconfig detection in ${projectPath}...`);

	const autoConfigId = getAutoConfigId();

	sendMetricsEvent(
		"autoconfig_detection_started",
		{
			autoConfigId,
			command: getAutoConfigTriggerCommand(),
		},
		{}
	);

	// If a real Wrangler config has been found & used, don't run autoconfig
	if (wranglerConfig?.configPath) {
		return {
			configured: true,
			projectPath,
			workerName: getWorkerName(wranglerConfig.name, projectPath),
		};
	}
	const fs = new NodeFS();

	fs.logger = logger;
	const project = new Project(fs, projectPath, projectPath)
		.setEnvironment(process.env)
		.setNodeVersion(process.version)
		.setReportFn((err) => {
			captureException(err);
		});

	const buildSettings = await project.getBuildSettings();

	// If we've detected multiple frameworks, it's too complex for us to try and configure—let's just bail
	if (buildSettings.length > 1) {
		throw new MultipleFrameworksError(buildSettings.map((b) => b.name));
	}

	const detectedFramework = buildSettings.at(0);

	const framework = getFramework(detectedFramework?.framework?.id);
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
		...(detectedFramework
			? {
					buildCommand: await getProjectBuildCommand(detectedFramework),
				}
			: {}),
		workerName: getWorkerName(packageJson?.name, projectPath),
	};

	if (configured) {
		sendMetricsEvent(
			"autoconfig_detection_completed",
			{
				autoConfigId,
				framework: framework.id,
				configured,
				success: true,
			},
			{}
		);
		return {
			...baseDetails,
			configured: true,
		};
	}

	if (!outputDir) {
		const errorMessage =
			framework.id === "static"
				? "Could not detect a directory containing the static (html, css and js) files for the project"
				: "Failed to detect an output directory for the project";

		const error = new FatalError(errorMessage);

		sendMetricsEvent(
			"autoconfig_detection_completed",
			{
				autoConfigId,
				framework: framework.id,
				configured,
				success: false,
				errorType: getErrorType(error),
				errorMessage,
			},
			{}
		);

		throw error;
	}

	sendMetricsEvent(
		"autoconfig_detection_completed",
		{
			autoConfigId,
			framework: framework.id,
			configured,
			success: true,
		},
		{}
	);

	sendMetricsEvent(
		"autoconfig_detection_completed",
		{
			autoConfigId,
			framework: framework.id,
			configured,
			success: true,
		},
		{}
	);

	return {
		...baseDetails,
		outputDir,
		configured: false,
	};
}

/**
 * Given a detected framework this function gets a `build` command for the target project that can be run in the terminal
 * (such as `npm run build` or `npx astro build`). If no build command is detected `undefined` is returned instead.
 *
 * @param detectedFramework The detected framework (or settings) for the project
 * @returns A runnable command for the build process if detected, undefined otherwise
 */
async function getProjectBuildCommand(
	detectedFramework: Settings
): Promise<string | undefined> {
	if (!detectedFramework.buildCommand) {
		return undefined;
	}

	const { type, dlx, npx } = await getPackageManager();

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

const invalidWorkerNameCharsRegex = /[^a-z0-9- ]/g;
const invalidWorkerNameStartEndRegex = /^(-+)|(-+)$/g;
const workerNameLengthLimit = 63;

/**
 * Checks whether the provided worker name is valid, this means that:
 *  - the name is not empty
 *  - the name doesn't start nor ends with a dash
 *  - the name doesn't contain special characters besides dashes
 *  - the name is not longer than 63 characters
 *
 * See: https://developers.cloudflare.com/workers/configuration/routing/workers-dev/#limitations
 *
 * @param input The name to check
 * @returns Object indicating whether the name is valid, and if not a cause indicating why it isn't
 */
function checkWorkerNameValidity(
	input: string
): { valid: false; cause: string } | { valid: true } {
	if (!input) {
		return {
			valid: false,
			cause: "Worker names cannot be empty.",
		};
	}

	if (input.match(invalidWorkerNameStartEndRegex)) {
		return {
			valid: false,
			cause: "Worker names cannot start or end with a dash.",
		};
	}

	if (input.match(invalidWorkerNameCharsRegex)) {
		return {
			valid: false,
			cause:
				"Project names must only contain lowercase characters, numbers, and dashes.",
		};
	}

	if (input.length > workerNameLengthLimit) {
		return {
			valid: false,
			cause: "Project names must be less than 63 characters.",
		};
	}

	return { valid: true };
}

/**
 * Given an input string it converts it to a valid worker name
 *
 * A worker name is valid if:
 *  - the name is not empty
 *  - the name doesn't start nor ends with a dash
 *  - the name doesn't contain special characters besides dashes
 *  - the name is not longer than 63 characters
 *
 * See: https://developers.cloudflare.com/workers/configuration/routing/workers-dev/#limitations
 *
 * @param input The input to convert
 * @returns The input itself if it was already valid, the input converted to a valid worker name otherwise
 */
export function toValidWorkerName(input: string): string {
	if (checkWorkerNameValidity(input).valid) {
		return input;
	}

	input = input
		// Replace all underscores with dashes
		.replaceAll("_", "-")
		// Replace all the special characters (besides dashes) with dashes
		.replace(invalidWorkerNameCharsRegex, "-")
		// Remove invalid start/end dashes
		.replace(invalidWorkerNameStartEndRegex, "")
		// If the name is longer than the limit let's truncate it to that
		.slice(0, workerNameLengthLimit);

	if (!input.length) {
		// If we've emptied the whole name let's replace it with a fallback value
		return "my-worker";
	}

	return input;
}

export function displayAutoConfigDetails(
	autoConfigDetails: AutoConfigDetails,
	displayOptions?: { heading?: string }
): void {
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

export async function confirmAutoConfigDetails(
	autoConfigDetails: AutoConfigDetails
): Promise<AutoConfigDetails> {
	const modifySettings = await confirm(
		"Do you want to modify these settings?",
		{ defaultValue: false, fallbackValue: false }
	);

	if (!modifySettings) {
		return autoConfigDetails;
	}

	// Just spreading the object to shallow clone it to avoid some potential side effects
	const { ...updatedAutoConfigDetails } = autoConfigDetails;

	const workerName = await prompt("What do you want to name your Worker?", {
		defaultValue: autoConfigDetails.workerName ?? "",
		validate: (value: string) => {
			const validity = checkWorkerNameValidity(value);
			if (validity.valid) {
				return true;
			}
			return validity.cause;
		},
	});

	updatedAutoConfigDetails.workerName = workerName;

	const frameworkId = await select(
		"What framework is your application using?",
		{
			choices: allKnownFrameworks.map((f) => ({
				title: f.name,
				value: f.id,
				description:
					f.id === "static"
						? "No framework at all, or a static framework such as Vite, React or Gatsby."
						: `The ${f.name} JavaScript framework`,
			})),
			defaultOption: allKnownFrameworks.findIndex((framework) => {
				if (!autoConfigDetails?.framework) {
					// If there is no framework already detected let's default to the static one
					// (note: there should always be a framework at this point)
					return framework.id === "static";
				}
				return autoConfigDetails.framework.id === framework.id;
			}),
		}
	);

	updatedAutoConfigDetails.framework = getFramework(frameworkId);

	const outputDir = await prompt(
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
		const buildCommand = await prompt(
			"What is your application's build command?",
			{
				defaultValue: autoConfigDetails.buildCommand ?? "",
			}
		);

		updatedAutoConfigDetails.buildCommand = buildCommand;
	}

	return updatedAutoConfigDetails;
}
