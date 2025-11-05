import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { brandColor } from "@cloudflare/cli/colors";
import {
	FatalError,
	parsePackageJSON,
	readFileSync,
} from "@cloudflare/workers-utils";
import { Project } from "@netlify/build-info";
import { NodeFS } from "@netlify/build-info/node";
import { captureException } from "@sentry/node";
import { logger } from "../logger";
import { getPackageManager } from "../package-manager";
import { getFramework } from "./frameworks/get-framework";
import type { AutoConfigDetails } from "./types";
import type { Config, PackageJSON } from "@cloudflare/workers-utils";
import type { Settings } from "@netlify/build-info";

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
		return from;
	}
	const children = await readdir(from);
	for (const child of children) {
		const path = join(from, child);
		const stats = await stat(path);
		if (stats.isDirectory() && (await hasIndexHtml(path))) {
			return path;
		}
	}
	return undefined;
}

export async function getDetailsForAutoConfig({
	projectPath = process.cwd(),
	wranglerConfig,
}: {
	projectPath?: string; // the path to the project, defaults to cwd
	wranglerConfig?: Config;
} = {}): Promise<AutoConfigDetails> {
	logger.debug(`Running autoconfig detection in ${projectPath}...`);

	// If a real Wrangler config has been found & used, don't run autoconfig
	if (wranglerConfig?.configPath) {
		return { configured: true, projectPath };
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
	if (buildSettings && buildSettings?.length > 1) {
		throw new MultipleFrameworksError(buildSettings.map((b) => b.name));
	}

	const detectedFramework: Settings | undefined = buildSettings?.[0];

	const framework: AutoConfigDetails["framework"] = getFramework(
		detectedFramework?.framework.id
	);
	const packageJsonPath = resolve("package.json");

	let packageJson: PackageJSON | undefined;

	try {
		packageJson = parsePackageJSON(
			readFileSync(packageJsonPath),
			packageJsonPath
		);
	} catch {
		logger.debug("No package.json found when running autoconfig");
	}

	const { type } = await getPackageManager();

	const packageJsonBuild = packageJson?.scripts?.["build"]
		? `${type} run build`
		: undefined;

	return {
		projectPath: projectPath,
		configured: framework?.configured ?? false,
		framework,
		packageJson,
		buildCommand: detectedFramework?.buildCommand ?? packageJsonBuild,
		outputDir: detectedFramework?.dist ?? (await findAssetsDir(projectPath)),
	};
}

export function displayAutoConfigDetails(
	autoConfigDetails: AutoConfigDetails
): void {
	if (
		!autoConfigDetails.framework &&
		!autoConfigDetails.buildCommand &&
		!autoConfigDetails.outputDir
	) {
		logger.log("No Project Settings Auto-detected");
		return;
	}

	logger.log("Auto-detected Project Settings:");

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
