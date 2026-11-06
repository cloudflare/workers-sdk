import { existsSync } from "node:fs";
import { join } from "node:path";
import { updateStatus } from "@cloudflare/cli-shared-helpers";
import { blue } from "@cloudflare/cli-shared-helpers/colors";
import {
	mergeObjectProperties,
	transformFile,
} from "@cloudflare/shared-ast-primitives";
import { DEFAULT_COMPAT_DATE } from "@cloudflare/workers-utils";
import * as recast from "recast";
import semiver from "semiver";
import { usesTypescript } from "../uses-typescript";
import { Framework } from "./framework-class";
import {
	extractConfigObject,
	getViteConfigPath,
	transformViteConfig,
} from "./utils/vite-config";
import { installCloudflareVitePlugin } from "./utils/vite-plugin";
import type { AutoConfigContext } from "../context";
import type {
	ConfigurationOptions,
	ConfigurationResults,
} from "./framework-class";

export class SolidStart extends Framework {
	async configure({
		projectPath,
		dryRun,
		target,
		packageManager,
		isWorkspaceRoot,
		context,
	}: ConfigurationOptions): Promise<ConfigurationResults> {
		if (target === "cf") {
			// SolidStart 2 runs on Vite environments, so its `ssr` environment can run on the
			// Cloudflare Vite plugin instead of Nitro, as SolidStart's deployment guide describes
			if (!dryRun) {
				await installCloudflareVitePlugin({
					packageManager: packageManager.type,
					isWorkspaceRoot,
					projectPath,
					version: "^2.0.0-beta.v.0",
				});
				transformViteConfig(projectPath, { viteEnvironmentName: "ssr" });
				excludeSolidStartFromServerPrebundling(projectPath, context);
			}

			return {
				buildTool: "vite",
				workerConfig: { entrypoint: getServerEntrypoint(projectPath) },
			};
		}

		if (!dryRun) {
			const solidStartVersion = this.frameworkVersion;

			if (semiver(solidStartVersion, "2.0.0-alpha") < 0) {
				updateAppConfigFile(projectPath);
			} else {
				updateViteConfigFile(projectPath);
			}
		}

		return {
			buildTool: "wrangler",
			workerConfig: {
				entrypoint: "./.output/server/index.mjs",
				env: {
					ASSETS: { type: "assets" },
				},
			},
			buildConfig: { assetsDirectory: "./.output/public" },
		};
	}
}

/**
 * Finds SolidStart's server entry, which the Worker runs.
 *
 * @param projectPath The path of the project
 * @returns The path of the server entry, relative to the project
 */
function getServerEntrypoint(projectPath: string): string {
	return (
		["./src/entry-server.tsx", "./src/entry-server.jsx"].find((entrypoint) =>
			existsSync(join(projectPath, entrypoint))
		) ?? `./src/entry-server.${usesTypescript(projectPath) ? "tsx" : "jsx"}`
	);
}

/**
 * Keeps `@solidjs/start` out of the `ssr` environment's pre-bundled dependencies.
 *
 * The Cloudflare Vite plugin pre-bundles server dependencies in dev, which loads a second copy
 * of SolidStart's server function registry, so calling a server function fails with
 * "invalid server function". Excluding the package keeps a single copy.
 *
 * @param projectPath The path of the project
 * @param context The autoconfig context providing the logger
 */
function excludeSolidStartFromServerPrebundling(
	projectPath: string,
	context: AutoConfigContext
): void {
	const b = recast.types.builders;
	const t = recast.types.namedTypes;

	transformFile(getViteConfigPath(projectPath), {
		visitCallExpression: function (n) {
			const callee = n.node.callee as recast.types.namedTypes.Identifier;
			if (callee.name !== "defineConfig") {
				return this.traverse(n);
			}

			const configObject = extractConfigObject(n.node.arguments[0]);
			// Merging into existing environments isn't safe for every parser, so ask the user instead
			const hasEnvironments = configObject?.properties.some(
				(prop) =>
					(t.Property.check(prop) || t.ObjectProperty.check(prop)) &&
					((t.Identifier.check(prop.key) && prop.key.name === "environments") ||
						((t.Literal.check(prop.key) || t.StringLiteral.check(prop.key)) &&
							prop.key.value === "environments"))
			);
			if (hasEnvironments) {
				context.logger.warn(
					'Add `environments: { ssr: { optimizeDeps: { exclude: ["@solidjs/start"] } } }` to your Vite config so that server functions work in dev with the Cloudflare Vite plugin.'
				);
			} else if (configObject) {
				const optimizeDeps = b.objectProperty(
					b.identifier("optimizeDeps"),
					b.objectExpression([
						b.objectProperty(
							b.identifier("exclude"),
							b.arrayExpression([b.stringLiteral("@solidjs/start")])
						),
					])
				);
				optimizeDeps.comments = [
					b.commentLine(
						" Load SolidStart once in dev, so server functions work with the Cloudflare Vite plugin",
						true,
						false
					),
				];
				configObject.properties.push(
					b.objectProperty(
						b.identifier("environments"),
						b.objectExpression([
							b.objectProperty(
								b.identifier("ssr"),
								b.objectExpression([optimizeDeps])
							),
						])
					)
				);
			}

			return false;
		},
	});
}

/**
 * This functions updates the `vite.config.(js|ts)` files used by SolidStart applications
 * to use the `cloudflare-module` preset to target Cloudflare Workers.
 *
 * Note: SolidStart projects prior to version `2.0.0-alpha` used to have an `app.config.(js|ts)` file instead
 *
 * @param projectPath The path of the project
 */
function updateViteConfigFile(projectPath: string): void {
	const filePath = `vite.config.${usesTypescript(projectPath) ? "ts" : "js"}`;

	transformFile(filePath, {
		visitCallExpression: function (n) {
			const callee = n.node.callee as recast.types.namedTypes.Identifier;
			if (callee.name !== "nitro") {
				return this.traverse(n);
			}

			const b = recast.types.builders;
			const presetProp = b.objectProperty(
				b.identifier("preset"),
				b.stringLiteral("cloudflare-module")
			);

			if (n.node.arguments.length === 0) {
				n.node.arguments.push(b.objectExpression([presetProp]));
			} else {
				mergeObjectProperties(
					n.node.arguments[0] as recast.types.namedTypes.ObjectExpression,
					[presetProp]
				);
			}

			return false;
		},
	});
}

/**
 * SolidStart apps used to have an `app.config.(js|ts)` before version `2.0.0-alpha`
 * (afterwards this has been replaced by `vite.config.(js|ts)`).
 * Reference: https://github.com/solidjs/templates/commit/c4cd73e08bdc
 *
 * This functions updates the `app.config.(js|ts)` to use the `cloudflare_module` preset
 * to target Cloudflare Workers.
 *
 * @param projectPath The path of the project
 */
function updateAppConfigFile(projectPath: string): void {
	const filePath = `app.config.${usesTypescript(projectPath) ? "ts" : "js"}`;

	const compatDate = DEFAULT_COMPAT_DATE;

	updateStatus(`Updating configuration in ${blue(filePath)}`);

	transformFile(filePath, {
		visitCallExpression: function (n) {
			const callee = n.node.callee as recast.types.namedTypes.Identifier;
			if (callee.name !== "defineConfig") {
				return this.traverse(n);
			}

			const b = recast.types.builders;
			mergeObjectProperties(
				n.node.arguments[0] as recast.types.namedTypes.ObjectExpression,
				[
					b.objectProperty(
						b.identifier("server"),
						b.objectExpression([
							// preset: "cloudflare_module"
							b.objectProperty(
								b.identifier("preset"),
								b.stringLiteral("cloudflare_module")
							),
							b.objectProperty(
								b.identifier("compatibilityDate"),
								b.stringLiteral(compatDate)
							),
						])
					),
				]
			);

			return false;
		},
	});
}
