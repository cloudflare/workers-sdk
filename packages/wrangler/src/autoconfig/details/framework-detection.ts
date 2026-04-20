import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { FatalError, UserError } from "@cloudflare/workers-utils";
import { Project } from "@netlify/build-info";
import { NodeFS } from "@netlify/build-info/node";
import { captureException } from "@sentry/node";
import chalk from "chalk";
import dedent from "ts-dedent";
import { getCacheFolder } from "../../config-cache";
import { confirm } from "../../dialogs";
import { isNonInteractiveOrCI } from "../../is-interactive";
import { logger } from "../../logger";
import {
	BunPackageManager,
	NpmPackageManager,
	PnpmPackageManager,
	YarnPackageManager,
} from "../../package-manager";
import { PAGES_CONFIG_CACHE_FILENAME } from "../../pages/constants";
import { isKnownFramework } from "../frameworks";
import { staticFramework } from "../frameworks/all-frameworks";
import type { PackageManager } from "../../package-manager";
import type { Config } from "@cloudflare/workers-utils";
import type { Settings } from "@netlify/build-info";

/**
 * Detects the framework used by the project at the given path.
 *
 * Uses `@netlify/build-info` to analyze build settings and identify the
 * framework, then maps the detected package manager to wrangler's own type.
 *
 * If the project is identified as a Cloudflare Pages project the function
 * returns early with a synthetic "Cloudflare Pages" framework entry.
 *
 * @param projectPath Path to the project root
 * @param wranglerConfig Optional parsed wrangler config for the project
 * @returns An object containing:
 *   - `detectedFramework`: The matched framework together with its build
 *     command and output directory.
 *   - `packageManager`: The package manager detected in the project.
 *   - `isWorkspaceRoot`: `true` when the project path is the root of a
 *     monorepo workspace (only present when relevant).
 * @throws {UserError} When called from a workspace root that does not itself
 *   contain the targeted project path.
 * @throws {MultipleFrameworksCIError} (via `findDetectedFramework`) in CI /
 *   non-interactive environments when multiple known frameworks are detected
 *   and no clear winner can be determined.
 */
export async function detectFramework(
	projectPath: string,
	wranglerConfig?: Config
): Promise<{
	detectedFramework: DetectedFramework;
	packageManager: PackageManager;
	isWorkspaceRoot?: boolean;
}> {
	const fs = new NodeFS();

	fs.logger = logger;

	const project = new Project(fs, projectPath, projectPath)
		.setEnvironment(process.env)
		.setNodeVersion(process.version)
		.setReportFn((err) => {
			captureException(err);
		});

	const buildSettings = await project.getBuildSettings();

	const isWorkspaceRoot = !!project.workspace?.isRoot;

	if (isWorkspaceRoot) {
		const resolvedProjectPath = resolve(projectPath);

		const workspaceRootIncludesProject = project.workspace?.packages.some(
			(pkg) => resolve(pkg.path) === resolvedProjectPath
		);

		if (!workspaceRootIncludesProject) {
			throw new UserError(
				"The Wrangler application detection logic has been run in the root of a workspace instead of targeting a specific project. Change your working directory to one of the applications in the workspace and try again."
			);
		}
	}

	// Convert the package manager detected by @netlify/build-info to our PackageManager type.
	// This is populated after getBuildSettings() runs, which triggers the full detection chain.
	const packageManager = convertDetectedPackageManager(project.packageManager);

	const lockFileExists = packageManager.lockFiles.some((lockFile) =>
		existsSync(join(projectPath, lockFile))
	);

	const maybeDetectedFramework = maybeFindDetectedFramework(buildSettings);

	if (
		await isPagesProject(projectPath, wranglerConfig, maybeDetectedFramework)
	) {
		return {
			detectedFramework: {
				framework: {
					name: "Cloudflare Pages",
					id: "cloudflare-pages",
				},
				dist: wranglerConfig?.pages_build_output_dir,
			},
			packageManager,
		};
	}

	const detectedFramework = maybeDetectedFramework ?? {
		framework: {
			id: staticFramework.id,
			name: staticFramework.name,
		},
	};

	if (
		!lockFileExists &&
		detectedFramework.framework.id !== staticFramework.id
	) {
		logger.warn(
			"No lock file has been detected in the current working directory." +
				" This might indicate that the project is part of a workspace. Auto-configuration of " +
				`projects inside workspaces is limited. See ${chalk.hex("#3B818D")(
					"https://developers.cloudflare.com/workers/framework-guides/automatic-configuration/#workspaces"
				)}`
		);
	}

	return {
		detectedFramework,
		packageManager,
		isWorkspaceRoot,
	};
}

/**
 * Converts the package manager detected by @netlify/build-info to our PackageManager type.
 * Falls back to npm if no package manager was detected.
 *
 * @param pkgManager The package manager detected by @netlify/build-info (from project.packageManager)
 * @returns A PackageManager object compatible with wrangler's package manager utilities
 */
function convertDetectedPackageManager(
	pkgManager: { name: string } | null
): PackageManager {
	if (!pkgManager) {
		return NpmPackageManager;
	}

	switch (pkgManager?.name) {
		case "pnpm":
			return PnpmPackageManager;
		case "yarn":
			return YarnPackageManager;
		case "bun":
			return BunPackageManager;
		case "npm":
		default:
			return NpmPackageManager;
	}
}

class MultipleFrameworksCIError extends FatalError {
	constructor(frameworks: string[]) {
		super(
			dedent`Wrangler was unable to automatically configure your project to work with Cloudflare, since multiple frameworks were found: ${frameworks.join(
				", "
			)}.

				To fix this issue either:
				  - check your project's configuration to make sure that the target framework
				    is the only configured one and try again
				  - run \`wrangler setup\` locally to get an interactive user experience where
				    you can specify what framework you want to target

			`,
			1,
			{ telemetryMessage: true }
		);
	}
}

function throwMultipleFrameworksNonInteractiveError(
	settings: Settings[]
): never {
	throw new MultipleFrameworksCIError(settings.map((b) => b.name));
}

type DetectedFramework = {
	framework: {
		name: string;
		id: string;
	};
	buildCommand?: string | undefined;
	dist?: string;
};

async function isPagesProject(
	projectPath: string,
	wranglerConfig: Config | undefined,
	detectedFramework?: DetectedFramework | undefined
): Promise<boolean> {
	if (wranglerConfig?.pages_build_output_dir) {
		// The `pages_build_output_dir` is set only for Pages projects
		return true;
	}

	const cacheFolder = getCacheFolder();
	if (cacheFolder) {
		const pagesConfigCache = join(cacheFolder, PAGES_CONFIG_CACHE_FILENAME);
		if (existsSync(pagesConfigCache)) {
			// If there is a cached pages.json we can safely assume that the project
			// is a Pages one
			return true;
		}
	}

	if (detectedFramework === undefined) {
		const functionsPath = join(projectPath, "functions");
		if (existsSync(functionsPath)) {
			const functionsStat = statSync(functionsPath);
			if (functionsStat.isDirectory()) {
				const pagesConfirmed = await confirm(
					"We have identified a `functions` directory in this project, which might indicate you have an active Cloudflare Pages deployment. Is this correct?",
					{
						defaultValue: true,
						// In CI we do want to fallback to `false` so that we can proceed with the autoconfig flow
						fallbackValue: false,
					}
				);
				return pagesConfirmed;
			}
		}
	}

	return false;
}

/**
 * Selects the most appropriate framework from a list of detected framework settings.
 *
 * When there is a good level of confidence that the selected framework is correct or
 * the process is running locally (where the user can choose a different framework or
 * abort the process) the framework is returned. If there is no such confidence and the
 * process is running in non interactive mode (where the user doesn't have the option to
 * change the detected framework) an error is instead thrown.
 *
 * @param settings The array of framework settings
 * @returns The selected framework settings, or `undefined` if none provided
 * @throws {MultipleFrameworksCIError} In CI environments when multiple known frameworks
 *         are detected and no clear winner can be determined
 */
function maybeFindDetectedFramework(
	settings: Settings[]
): DetectedFramework | undefined {
	if (settings.length === 0) {
		return undefined;
	}

	if (settings.length === 1) {
		return settings[0];
	}

	const settingsForOnlyKnownFrameworks = settings.filter(({ framework }) =>
		isKnownFramework(framework.id)
	);

	if (settingsForOnlyKnownFrameworks.length === 0) {
		if (isNonInteractiveOrCI()) {
			// If we're in a non interactive session (e.g. CI) let's throw to be on the safe side
			throwMultipleFrameworksNonInteractiveError(settings);
		}
		// Locally we can just return the first one since the user can anyways choose a different
		// framework or abort the process anyways
		return settings[0];
	}

	if (settingsForOnlyKnownFrameworks.length === 1) {
		// If there is a single known framework it's quite safe to assume that that's the
		// one we care about
		return settingsForOnlyKnownFrameworks[0];
	}

	if (settingsForOnlyKnownFrameworks.length === 2) {
		const settingsForOnlyKnownFrameworksIds = new Set<string>(
			settingsForOnlyKnownFrameworks.map(({ framework }) => framework.id)
		);

		// Some frameworks (e.g. Vite, Hono) can serve as auxiliary tooling for a primary
		// framework (e.g. Vite with React, Hono with Waku). When exactly two frameworks
		// are detected and one is auxiliary, we discard it and return the primary one.
		const idsOfAuxiliaryFrameworks = ["vite", "hono"];

		for (const auxiliaryFrameworkId of idsOfAuxiliaryFrameworks) {
			if (settingsForOnlyKnownFrameworksIds.has(auxiliaryFrameworkId)) {
				const nonAuxiliaryFrameworkSettings =
					settingsForOnlyKnownFrameworks.find(
						({ framework }) => framework.id !== auxiliaryFrameworkId
					);

				// Note: here nonAuxiliaryFrameworkSettings should always be defined, it could be undefined only if the
				//       same framework is actually detected twice (which shouldn't be possible).
				if (nonAuxiliaryFrameworkSettings) {
					return nonAuxiliaryFrameworkSettings;
				}
			}
		}
	}

	// If we've detected multiple frameworks, and we're in a non interactive session (e.g. CI) let's stay on the safe side and error
	// (otherwise we just pick the first one as the user is always able to choose a different framework or terminate the process anyways)
	if (isNonInteractiveOrCI()) {
		throw new MultipleFrameworksCIError(
			settingsForOnlyKnownFrameworks.map((b) => b.name)
		);
	}

	return settingsForOnlyKnownFrameworks[0];
}
