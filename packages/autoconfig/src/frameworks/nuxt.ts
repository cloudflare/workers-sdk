import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { brandColor, dim } from "@cloudflare/cli-shared-helpers/colors";
import { installPackages } from "@cloudflare/cli-shared-helpers/packages";
import {
	mergeObjectProperties,
	parseFile,
	transformFile,
} from "@cloudflare/shared-ast-primitives";
import { parseJSONC } from "@cloudflare/workers-utils";
import { applyEdits, modify } from "jsonc-parser";
import * as recast from "recast";
import { AutoConfigFrameworkConfigurationError } from "../errors";
import { Framework } from "./framework-class";
import { getStaticPropertyName } from "./utils/vite-config";
import { installCloudflareVitePlugin } from "./utils/vite-plugin";
import { CF_VITE_PLUGIN_VERSION_RANGE } from "./utils/vite-plugin-version";
import type {
	ConfigurationOptions,
	ConfigurationResults,
} from "./framework-class";
import type { Program } from "esprima";

const updateNuxtConfig = (projectPath: string) => {
	const configFile = path.join(projectPath, "nuxt.config.ts");

	const b = recast.types.builders;

	const presetDef = b.objectProperty(
		b.identifier("nitro"),
		b.objectExpression([
			b.objectProperty(
				b.identifier("preset"),
				b.stringLiteral("cloudflare_module")
			),
			b.objectProperty(
				b.identifier("cloudflare"),
				b.objectExpression([
					b.objectProperty(
						b.identifier("deployConfig"),
						b.booleanLiteral(true)
					),
					b.objectProperty(b.identifier("nodeCompat"), b.booleanLiteral(true)),
				])
			),
		])
	);

	const moduleDef = b.objectProperty(
		b.identifier("modules"),
		b.arrayExpression([b.stringLiteral("nitro-cloudflare-dev")])
	);

	transformFile(configFile, {
		visitCallExpression: function (n) {
			const callee = n.node.callee as recast.types.namedTypes.Identifier;
			if (callee.name === "defineNuxtConfig") {
				mergeObjectProperties(
					n.node.arguments[0] as recast.types.namedTypes.ObjectExpression,
					[presetDef, moduleDef]
				);
			}

			return this.traverse(n);
		},
	});
};

/**
 * Finds the project's Nuxt config file, which can be TypeScript or JavaScript.
 *
 * @param projectPath The path of the project
 * @returns The path of the config file
 */
function findNuxtConfigFile(projectPath: string): string {
	for (const extension of ["ts", "mts", "js", "mjs"]) {
		const configPath = path.join(projectPath, `nuxt.config.${extension}`);
		if (existsSync(configPath)) {
			return configPath;
		}
	}
	throw new AutoConfigFrameworkConfigurationError(
		"Could not find a Nuxt config file (nuxt.config.ts, nuxt.config.mts, nuxt.config.js or nuxt.config.mjs)",
		{ telemetryMessage: "autoconfig nuxt config file not found" }
	);
}

/**
 * Checks whether autoconfig can edit the Nuxt config, which needs an object literal passed to
 * `defineNuxtConfig()`, and whether the config already imports the Cloudflare Vite plugin.
 *
 * @param configPath The path of the Nuxt config file
 * @returns Whether the config can be edited and whether it imports the plugin
 */
function inspectNuxtConfig(configPath: string): {
	editable: boolean;
	importsCloudflareVitePlugin: boolean;
} {
	const ast = parseFile(configPath);
	// An empty config has no `defineNuxtConfig()` call to edit
	if (!ast) {
		return { editable: false, importsCloudflareVitePlugin: false };
	}

	let editable = false;
	recast.visit(ast, {
		visitCallExpression(n) {
			const callee = n.node.callee as recast.types.namedTypes.Identifier;
			if (callee.name !== "defineNuxtConfig") {
				return this.traverse(n);
			}
			editable = n.node.arguments[0]?.type === "ObjectExpression";
			return false;
		},
	});

	return {
		editable,
		importsCloudflareVitePlugin: ast.body.some(
			(statement) =>
				statement.type === "ImportDeclaration" &&
				statement.source.value === "@cloudflare/vite-plugin"
		),
	};
}

/**
 * Sets up Nuxt's Vite server builder, whose `ssr` environment the Cloudflare Vite plugin runs.
 *
 * @param configPath The path of the Nuxt config file
 */
function updateNuxtConfigForCf(configPath: string): void {
	const b = recast.types.builders;

	transformFile(configPath, {
		visitProgram(n) {
			const hasImport = n.node.body.some(
				(statement) =>
					statement.type === "ImportDeclaration" &&
					statement.source.value === "@cloudflare/vite-plugin"
			);
			if (!hasImport) {
				const lastImportIndex = n.node.body.findLastIndex(
					(statement) => statement.type === "ImportDeclaration"
				);
				n.node.body.splice(
					lastImportIndex + 1,
					0,
					b.importDeclaration(
						[b.importSpecifier(b.identifier("cloudflare"))],
						b.stringLiteral("@cloudflare/vite-plugin")
					)
				);
			}

			return this.traverse(n);
		},
		visitCallExpression(n) {
			const callee = n.node.callee as recast.types.namedTypes.Identifier;
			if (callee.name === "defineNuxtConfig") {
				mergeObjectProperties(
					n.node.arguments[0] as recast.types.namedTypes.ObjectExpression,
					[
						b.objectProperty(
							b.identifier("vite"),
							b.objectExpression([
								b.objectProperty(
									b.identifier("plugins"),
									b.arrayExpression([
										b.callExpression(b.identifier("cloudflare"), []),
									])
								),
							])
						),
						b.objectProperty(
							b.identifier("server"),
							b.objectExpression([
								b.objectProperty(
									b.identifier("builder"),
									b.stringLiteral("vite")
								),
							])
						),
					]
				);
			}

			return this.traverse(n);
		},
	});
}

/**
 * Removes the `tsconfig.json` reference to `.nuxt/tsconfig.server.json`, which Nuxt's Vite
 * server builder doesn't generate. While it is missing, building any component that uses
 * TypeScript fails to load the tsconfig.
 *
 * @param projectPath The path of the project
 */
function removeServerTsconfigReference(projectPath: string): void {
	const tsconfigPath = path.join(projectPath, "tsconfig.json");
	if (!existsSync(tsconfigPath)) {
		return;
	}

	const json = readFileSync(tsconfigPath, "utf8");
	const { references } = parseJSONC(json, tsconfigPath) as {
		references?: unknown;
	};
	const index = Array.isArray(references)
		? references.findIndex(
				(reference) =>
					(reference as { path?: unknown })?.path ===
					"./.nuxt/tsconfig.server.json"
			)
		: -1;
	if (index !== -1) {
		writeFileSync(
			tsconfigPath,
			applyEdits(json, modify(json, ["references", index], undefined, {}))
		);
	}
}

/**
 * Checks whether the Nuxt config turns off server-side rendering with a literal `ssr: false`,
 * in which case Nuxt builds a static single-page app and no server.
 *
 * @param configPath The path of the Nuxt config file
 * @returns Whether the `defineNuxtConfig()` object sets `ssr: false`
 */
function disablesSsr(configPath: string): boolean {
	let ast: Program | null = null;
	try {
		ast = parseFile(configPath);
	} catch {}

	if (!ast) {
		return false;
	}

	let ssrDisabled = false;
	recast.visit(ast, {
		visitCallExpression(n) {
			const callee = n.node.callee as recast.types.namedTypes.Identifier;
			const config = n.node.arguments[0];
			if (
				callee.name !== "defineNuxtConfig" ||
				config?.type !== "ObjectExpression"
			) {
				return this.traverse(n);
			}

			ssrDisabled = config.properties.some(
				(prop) =>
					prop.type === "ObjectProperty" &&
					getStaticPropertyName(prop) === "ssr" &&
					prop.value.type === "BooleanLiteral" &&
					prop.value.value === false
			);
			return false;
		},
	});

	return ssrDisabled;
}

export class Nuxt extends Framework {
	async configure({
		dryRun,
		projectPath,
		packageManager,
		isWorkspaceRoot,
		target,
	}: ConfigurationOptions): Promise<ConfigurationResults> {
		if (target === "cf") {
			const configPath = findNuxtConfigFile(projectPath);
			const { editable, importsCloudflareVitePlugin } =
				inspectNuxtConfig(configPath);
			// A config that autoconfig can't edit works once it's set up by hand
			if (!editable && !importsCloudflareVitePlugin) {
				throw new AutoConfigFrameworkConfigurationError(
					`Autoconfig can't edit ${path.basename(configPath)}, because it doesn't pass an object literal to \`defineNuxtConfig()\`. Add \`cloudflare()\` from \`@cloudflare/vite-plugin\` to \`vite.plugins\` and set \`server.builder\` to \`"vite"\` by hand, then try again.`,
					{ telemetryMessage: "autoconfig nuxt config not editable" }
				);
			}
			if (!dryRun) {
				await installCloudflareVitePlugin({
					packageManager: packageManager.type,
					projectPath,
					isWorkspaceRoot,
					version: CF_VITE_PLUGIN_VERSION_RANGE,
				});
				if (editable) {
					updateNuxtConfigForCf(configPath);
				}
				removeServerTsconfigReference(projectPath);
			}

			if (disablesSsr(configPath)) {
				return {
					buildTool: "vite",
					workerConfig: {
						assets: {
							notFoundHandling: "single-page-application",
						},
					},
				};
			}

			return {
				buildTool: "vite",
				workerConfig: {
					// Nuxt resolves this alias to its server entry, whose `fetch` renders the app
					entrypoint: "#server-entry",
				},
			};
		}

		if (!dryRun) {
			await installPackages(packageManager.type, ["nitro-cloudflare-dev"], {
				dev: true,
				startText: "Installing the Cloudflare dev module",
				doneText: `${brandColor(`installed`)} ${dim("nitro-cloudflare-dev")}`,
				isWorkspaceRoot,
			});
			updateNuxtConfig(projectPath);
		}

		return {
			buildTool: "wrangler",
			workerConfig: {
				entrypoint: "./.output/server/index.mjs",
				env: {
					ASSETS: { type: "assets" },
				},
				observability: {
					enabled: true,
				},
			},
			buildConfig: { assetsDirectory: "./.output/public/" },
		};
	}

	configurationDescription = "Configuring project for Nuxt";
}
