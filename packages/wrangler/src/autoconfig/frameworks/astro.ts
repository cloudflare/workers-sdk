import assert from "node:assert";
import {
	existsSync,
	readFileSync as fsReadFileSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { updateStatus } from "@cloudflare/cli";
import { blue, brandColor, dim } from "@cloudflare/cli/colors";
import { parseJSONC } from "@cloudflare/workers-utils";
import * as recast from "recast";
import semiver from "semiver";
import { logger } from "../../logger";
import { mergeObjectProperties, transformFile } from "../c3-vendor/codemod";
import { runCommand } from "../c3-vendor/command";
import { installPackages } from "../c3-vendor/packages";
import { AutoConfigFrameworkConfigurationError } from "../errors";
import { getInstalledPackageVersion } from "./utils/packages";
import { Framework } from ".";
import type { ConfigurationOptions, ConfigurationResults } from ".";
import type { PackageManager } from "../../package-manager";

export class Astro extends Framework {
	async configure({
		outputDir,
		dryRun,
		packageManager,
		projectPath,
		isWorkspaceRoot,
	}: ConfigurationOptions): Promise<ConfigurationResults> {
		const astroVersion = getAstroVersion(projectPath);
		validateMinimumAstroVersion(astroVersion);

		const { npx } = packageManager;
		if (!dryRun) {
			if (semiver(astroVersion, "6.0.0") >= 0) {
				// For Astro 6.0.0+ use the native `astro add cloudflare` command
				await runCommand([npx, "astro", "add", "cloudflare", "-y"], {
					silent: true,
					startText: "Installing adapter",
					doneText: `${brandColor("installed")} ${dim(
						`via \`${npx} astro add cloudflare\``
					)}`,
				});
			} else {
				// For older versions of Astro we need to apply manual configuration since `astro add cloudflare`
				// tries to install the latest version of the adapter causing conflicts

				// Note: here the Astro version can only be 5 or 4 because of the minimum version validation
				const astroMajorVersion = semiver(astroVersion, "5.0.0") >= 0 ? 5 : 4;
				await configureAstroLegacy(
					projectPath,
					isWorkspaceRoot,
					packageManager,
					astroMajorVersion
				);
			}

			writeFileSync("public/.assetsignore", "_worker.js\n_routes.json");
		}

		if (semiver(astroVersion, "6.0.0") < 0) {
			// Before version 6 Astro required a wrangler config file
			return {
				wranglerConfig: {
					main: `${outputDir}/_worker.js/index.js`,
					compatibility_flags: ["global_fetch_strictly_public"],
					assets: {
						binding: "ASSETS",
						directory: outputDir,
					},
				},
			};
		}

		// From version 6 Astro doesn't need a wrangler config file but generates a redirected config on build
		return {
			wranglerConfig: null,
		};
	}

	configurationDescription =
		'Configuring project for Astro with "astro add cloudflare"';
}

/**
 * Gets the installed version of the "astro" package
 * @param projectPath The path of the project
 */
function getAstroVersion(projectPath: string): string {
	const packageName = "astro";
	const astroVersion = getInstalledPackageVersion(packageName, projectPath);

	assert(
		astroVersion,
		`Unable to discern the version of the \`${packageName}\` package`
	);

	return astroVersion;
}

/**
 * Checks whether the version of the Astro package is less than the minimum one we support, if not an error is thrown.
 *
 * TODO: We should standardize and define a better approach for this type of check and apply it to all the frameworks we support.
 *
 * @param astroVersion The version of the astro package used in the project
 */
function validateMinimumAstroVersion(astroVersion: string) {
	const minumumAstroVersion = "4.0.0";
	if (astroVersion && semiver(astroVersion, minumumAstroVersion) < 0) {
		throw new AutoConfigFrameworkConfigurationError(
			`The version of Astro used in the project (${JSON.stringify(astroVersion)}) is not supported by the Wrangler automatic configuration. Please update the Astro version to at least ${JSON.stringify(minumumAstroVersion)} and try again.`
		);
	}
}

/**
 * Finds the Astro config file in the project directory.
 * Checks for astro.config.mjs, astro.config.ts, and astro.config.js in that order.
 *
 * @param projectPath The path of the project
 * @returns The path to the Astro config file
 * @throws Error if no config file is found
 */
function findAstroConfigFile(projectPath: string): string {
	const extensions = ["mjs", "mts", "ts", "js"];
	for (const ext of extensions) {
		const configPath = join(projectPath, `astro.config.${ext}`);
		if (existsSync(configPath)) {
			return configPath;
		}
	}
	throw new Error(
		"Could not find Astro config file (astro.config.mjs, astro.config.mts, astro.config.ts, or astro.config.js)"
	);
}

/**
 * Updates the Astro config file to add the Cloudflare adapter.
 * This replicates the logic from `astro add cloudflare` for Astro versions < 6.0.0.
 *
 * @param projectPath The path of the project
 * @param astroMajorVersion The major version of Astro (4 or 5) to determine the config options
 */
function updateAstroConfig(
	projectPath: string,
	astroMajorVersion: 4 | 5
): void {
	const configPath = findAstroConfigFile(projectPath);

	updateStatus(`Updating configuration in ${blue(configPath)}`);

	// Track the adapter identifier name (either from existing import or the one we add)
	let adapterIdentifier = "cloudflare";

	transformFile(configPath, {
		// First pass: check for existing cloudflare import and add if missing
		visitProgram(path) {
			const body = path.node.body;
			const b = recast.types.builders;

			// Check if cloudflare import already exists and capture the local identifier
			let hasCloudflareImport = false;
			for (const node of body) {
				if (
					node.type === "ImportDeclaration" &&
					node.source.value === "@astrojs/cloudflare"
				) {
					hasCloudflareImport = true;
					// Find the default import specifier and capture its local name
					for (const specifier of node.specifiers ?? []) {
						if (
							specifier.type === "ImportDefaultSpecifier" &&
							specifier.local
						) {
							// specifier.local is an Identifier node with a `name` property
							const local = specifier.local as { name: string };
							adapterIdentifier = local.name;
							break;
						}
					}
					break;
				}
			}

			// Add the import if it doesn't exist
			if (!hasCloudflareImport) {
				const importDeclaration = b.importDeclaration(
					[b.importDefaultSpecifier(b.identifier("cloudflare"))],
					b.literal("@astrojs/cloudflare")
				);

				// Find the last import statement and insert after it
				let lastImportIndex = -1;
				for (let i = 0; i < body.length; i++) {
					if (body[i].type === "ImportDeclaration") {
						lastImportIndex = i;
					}
				}

				if (lastImportIndex >= 0) {
					body.splice(lastImportIndex + 1, 0, importDeclaration);
				} else {
					// No imports found, add at the beginning
					body.unshift(importDeclaration);
				}
			}

			this.traverse(path);
		},

		// Second pass: add adapter (and output for Astro 4) to defineConfig
		visitCallExpression(path) {
			const callee = path.node.callee;

			// Check if this is a defineConfig call
			if (callee.type !== "Identifier" || callee.name !== "defineConfig") {
				return this.traverse(path);
			}

			const b = recast.types.builders;

			// Create the adapter property using the captured identifier name
			const adapterProp = b.objectProperty(
				b.identifier("adapter"),
				b.callExpression(b.identifier(adapterIdentifier), [])
			);

			const propsToAdd: recast.types.namedTypes.ObjectProperty[] = [];

			if (astroMajorVersion === 4) {
				// Astro 4 requires explicit output: "hybrid" for SSR
				const outputProp = b.objectProperty(
					b.identifier("output"),
					b.literal("hybrid")
				);
				propsToAdd.push(outputProp);
			}
			propsToAdd.push(adapterProp);

			// Get or create the config object argument
			if (path.node.arguments.length === 0) {
				path.node.arguments.push(b.objectExpression(propsToAdd));
			} else {
				const configArg = path.node
					.arguments[0] as recast.types.namedTypes.ObjectExpression;
				if (configArg.type === "ObjectExpression") {
					mergeObjectProperties(configArg, propsToAdd);
				}
			}

			return false;
		},
	});
}

/**
 * Updates the tsconfig.json to include worker-configuration.d.ts.
 * This replicates part of the `astro add cloudflare` behavior.
 *
 * @param projectPath The path of the project
 */
function updateTsConfig(projectPath: string) {
	const tsconfigPath = join(projectPath, "tsconfig.json");
	if (!existsSync(tsconfigPath)) {
		return;
	}

	try {
		const content = fsReadFileSync(tsconfigPath, "utf-8");
		const tsconfig = parseJSONC(content, tsconfigPath) as Record<
			string,
			unknown
		>;

		const includeEntry = "./worker-configuration.d.ts";

		if (!tsconfig.include) {
			// If `include` is not defined, the tsconfig likely inherits it from a parent config (e.g., "extends": "astro/tsconfigs/base").
			// Adding an `include` field here would override the parent's includes, breaking type-checking.
			// Instead, warn the user to add it manually.
			logger.warn(
				`Could not find an existing \`include\` field in tsconfig.json. You may need to manually add ${JSON.stringify(includeEntry)} to your tsconfig.json \`include\` array.`
			);
			return;
		}

		if (!(tsconfig.include as string[]).includes(includeEntry)) {
			(tsconfig.include as string[]).push(includeEntry);
			writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, "\t"));
			updateStatus(
				`Updated ${blue("tsconfig.json")} to include ${blue(includeEntry)}`
			);
		}
	} catch {
		logger.warn(
			`Could not update tsconfig.json to include worker-configuration.d.ts. You may need to add it manually.`
		);
	}
}

/**
 * Configures an Astro project for Cloudflare deployment when running Astro < 6.0.0.
 * This replicates the core logic from `astro add cloudflare` command since that command
 * is not available or behaves differently in older Astro versions.
 *
 * @param projectPath The path of the project
 * @param isWorkspaceRoot Whether the project is at the root of a workspace (affects package installation flags)
 * @param packageManager The package manager to use for installing dependencies
 * @param astroMajorVersion The major version of Astro (4 or 5) to determine the correct adapter version
 */
async function configureAstroLegacy(
	projectPath: string,
	isWorkspaceRoot: boolean,
	packageManager: PackageManager,
	astroMajorVersion: 4 | 5
): Promise<void> {
	const astroCloudflarePackageVersion = astroMajorVersion === 5 ? 12 : 11;

	await installPackages(
		packageManager,
		[`@astrojs/cloudflare@${astroCloudflarePackageVersion}`],
		{
			startText: `Installing @astrojs/cloudflare adapter (version ${astroCloudflarePackageVersion})`,
			doneText: `${brandColor("installed")} ${dim("@astrojs/cloudflare")}`,
			isWorkspaceRoot,
		}
	);
	updateAstroConfig(projectPath, astroMajorVersion);
	updateTsConfig(projectPath);
}
