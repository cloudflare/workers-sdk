import { existsSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { brandColor, dim } from "@cloudflare/cli-shared-helpers/colors";
import { installPackages } from "@cloudflare/cli-shared-helpers/packages";
import dedent from "ts-dedent";
import { AutoConfigFrameworkConfigurationError } from "../errors";
import { Framework } from "./framework-class";
import type {
	ConfigurationOptions,
	ConfigurationResults,
} from "./framework-class";

const FUNCTIONS_DIRECTORY = "functions";
const WORKER_DIRECTORY = "worker";
const WORKER_ENTRYPOINT = `${WORKER_DIRECTORY}/index.js`;
const BUILD_SCRIPT = "scripts/build-pages-functions.mjs";
const COMPILED_FUNCTIONS_DIRECTORY = ".wrangler/pages-functions";

export class CloudflarePages extends Framework {
	get requiresPackageJson(): boolean {
		return true;
	}
	configurationDescription = "Migrating the Pages project into a Worker";

	/**
	 * Converts a Pages Functions project into a Worker that delegates requests to
	 * the compiled legacy Functions handler.
	 *
	 * @param options Configuration details detected for the Pages project.
	 * @returns Wrangler configuration for the migrated Worker application.
	 */
	async configure({
		dryRun,
		outputDir,
		projectPath,
		packageManager,
		isWorkspaceRoot,
		existingWranglerConfig,
	}: ConfigurationOptions): Promise<ConfigurationResults> {
		assertPagesProjectCanBeMigrated(
			projectPath,
			outputDir,
			existingWranglerConfig?.env
		);

		if (!dryRun) {
			await installPackages(
				packageManager.type,
				["@cloudflare/pages-functions"],
				{
					dev: true,
					startText: "Installing the Pages Functions compiler",
					doneText: `${brandColor("installed")} ${dim(
						"@cloudflare/pages-functions"
					)}`,
					isWorkspaceRoot,
				}
			);

			await writeMigrationFiles(projectPath, outputDir);
		}

		return {
			wranglerConfig: {
				main: `./${WORKER_ENTRYPOINT}`,
				assets: {
					directory: outputDir,
					binding: "ASSETS",
					run_worker_first: true,
				},
				build: {
					command: `node ./${BUILD_SCRIPT}`,
					watch_dir: [`./${FUNCTIONS_DIRECTORY}`, `./${WORKER_DIRECTORY}`],
				},
			},
		};
	}
}

/**
 * Validates that migrating the project will not overwrite files or silently
 * change unsupported Pages routing behavior.
 *
 * @param projectPath Path to the project root.
 * @param outputDir Pages static asset output directory.
 * @param environments Existing Pages environment-specific configuration.
 */
function assertPagesProjectCanBeMigrated(
	projectPath: string,
	outputDir: string,
	environments: Record<string, unknown> | undefined
): void {
	const functionsPath = resolve(projectPath, FUNCTIONS_DIRECTORY);
	if (!existsSync(functionsPath) || !statSync(functionsPath).isDirectory()) {
		throw new AutoConfigFrameworkConfigurationError(
			"Only Cloudflare Pages projects with a `functions/` directory can be automatically migrated to Workers.",
			{ telemetryMessage: "autoconfig pages functions directory missing" }
		);
	}

	if (resolve(projectPath, outputDir) === resolve(projectPath)) {
		throw new AutoConfigFrameworkConfigurationError(
			"Cannot automatically migrate this Pages project because its static asset output directory is the project root. Move the static assets into a dedicated directory or migrate the project manually.",
			{ telemetryMessage: "autoconfig pages assets use project root" }
		);
	}

	if (environments && Object.keys(environments).length > 0) {
		throw new AutoConfigFrameworkConfigurationError(
			"Cannot automatically migrate this Pages project because its Wrangler configuration contains environment-specific settings. Pages and Workers environments have different behavior, so this configuration must be migrated manually.",
			{ telemetryMessage: "autoconfig pages environments unsupported" }
		);
	}

	for (const path of [WORKER_ENTRYPOINT, BUILD_SCRIPT]) {
		if (existsSync(resolve(projectPath, path))) {
			throw new AutoConfigFrameworkConfigurationError(
				`Cannot automatically migrate this Pages project because \`${path}\` already exists.`,
				{ telemetryMessage: "autoconfig pages migration file exists" }
			);
		}
	}

	for (const path of ["_routes.json", "_worker.js"]) {
		if (existsSync(resolve(projectPath, outputDir, path))) {
			throw new AutoConfigFrameworkConfigurationError(
				`Cannot automatically migrate this Pages project because \`${path}\` was found in the output directory. Pages projects using custom routing or advanced mode are not yet supported by automatic migration.`,
				{ telemetryMessage: "autoconfig pages migration mode unsupported" }
			);
		}
	}
}

/**
 * Writes the editable Worker entrypoint and Pages Functions compiler script.
 *
 * @param projectPath Path to the project root.
 * @param outputDir Pages static asset output directory.
 */
async function writeMigrationFiles(
	projectPath: string,
	outputDir: string
): Promise<void> {
	await mkdir(resolve(projectPath, WORKER_DIRECTORY), { recursive: true });
	await mkdir(resolve(projectPath, "scripts"), { recursive: true });

	await writeFile(
		resolve(projectPath, WORKER_ENTRYPOINT),
		dedent`
			import pagesFunctions from "../${COMPILED_FUNCTIONS_DIRECTORY}/index.js";

			export default {
				/**
				 * Handles requests with the legacy Pages Functions router.
				 *
				 * @param {Request} request Incoming request.
				 * @param {Record<string, unknown>} env Worker bindings.
				 * @param {ExecutionContext} ctx Worker execution context.
				 * @returns {Promise<Response>} The Pages Functions response.
				 */
				async fetch(request, env, ctx) {
					return pagesFunctions.fetch(request, env, ctx);
				},
			};
		` + "\n"
	);

	await writeFile(
		resolve(projectPath, BUILD_SCRIPT),
		dedent`
			import { existsSync } from "node:fs";
			import { resolve } from "node:path";
			import { buildPagesFunctions } from "@cloudflare/pages-functions";

			const assetsDirectory = ${JSON.stringify(outputDir)};

			for (const unsupportedFile of ["_routes.json", "_worker.js"]) {
				if (existsSync(resolve(assetsDirectory, unsupportedFile))) {
					throw new Error(
						\`Cannot build the migrated Worker because \${unsupportedFile} was found in the assets directory. Pages custom routing and advanced mode must be migrated manually.\`,
					);
				}
			}

			await buildPagesFunctions({
				functionsDirectory: "./${FUNCTIONS_DIRECTORY}",
				outputDirectory: "./${COMPILED_FUNCTIONS_DIRECTORY}",
				assetsOutputDirectory: assetsDirectory,
				external: ["node:*", "cloudflare:*"],
			});
		` + "\n"
	);
}
