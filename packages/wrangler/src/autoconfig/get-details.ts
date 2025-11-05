import { resolve } from "node:path";
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
import type { Config } from "@cloudflare/workers-utils";
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
		return { configured: true };
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
	const packageJson = parsePackageJSON(
		readFileSync(packageJsonPath),
		packageJsonPath
	);

	const { type } = await getPackageManager();

	const packageJsonBuild = packageJson.scripts?.["build"]
		? `${type} run build`
		: undefined;

	return {
		configured: framework?.configured ?? false,
		framework,
		packageJson,
		buildCommand: detectedFramework?.buildCommand ?? packageJsonBuild,
		outputDir: detectedFramework?.dist,
	};
}
