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
 * Sets up Nuxt's Vite server builder, whose `ssr` environment the Cloudflare Vite plugin runs.
 *
 * @param projectPath The path of the project
 */
function updateNuxtConfigForCf(projectPath: string): void {
	const b = recast.types.builders;

	transformFile(path.join(projectPath, "nuxt.config.ts"), {
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
 * Checks whether nuxt.config.ts turns off server-side rendering with a literal `ssr: false`,
 * in which case Nuxt builds a static single-page app and no server.
 *
 * @param projectPath The path of the project
 * @returns Whether the `defineNuxtConfig()` object sets `ssr: false`
 */
function disablesSsr(projectPath: string): boolean {
	let ast: Program | null = null;
	try {
		ast = parseFile(path.join(projectPath, "nuxt.config.ts"));
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
			if (!dryRun) {
				await installCloudflareVitePlugin({
					packageManager: packageManager.type,
					projectPath,
					isWorkspaceRoot,
					version: CF_VITE_PLUGIN_VERSION_RANGE,
				});
				updateNuxtConfigForCf(projectPath);
				removeServerTsconfigReference(projectPath);
			}

			if (disablesSsr(projectPath)) {
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
