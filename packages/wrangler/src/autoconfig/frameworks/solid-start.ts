import assert from "node:assert";
import { updateStatus } from "@cloudflare/cli";
import { blue } from "@cloudflare/cli/colors";
import { getLocalWorkerdCompatibilityDate } from "@cloudflare/workers-utils";
import * as recast from "recast";
import semiver from "semiver";
import { mergeObjectProperties, transformFile } from "../c3-vendor/codemod";
import { usesTypescript } from "../uses-typescript";
import { getInstalledPackageVersion } from "./utils/packages";
import { Framework } from ".";
import type { ConfigurationOptions, ConfigurationResults } from ".";

export class SolidStart extends Framework {
	async configure({
		projectPath,
		dryRun,
	}: ConfigurationOptions): Promise<ConfigurationResults> {
		if (!dryRun) {
			const solidStartVersion = getSolidStartVersion(projectPath);

			if (semiver(solidStartVersion, "2.0.0-alpha") < 0) {
				updateAppConfigFile(projectPath);
			} else {
				updateViteConfigFile(projectPath);
			}
		}

		return {
			wranglerConfig: {
				main: "./.output/server/index.mjs",
				assets: {
					binding: "ASSETS",
					directory: "./.output/public",
				},
			},
		};
	}
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

	const { date: compatDate } = getLocalWorkerdCompatibilityDate({
		projectPath,
	});

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

/**
 * Gets the installed version of the "@solidjs/start" package
 *
 * @param projectPath The path of the project
 */
function getSolidStartVersion(projectPath: string): string {
	const packageName = "@solidjs/start";
	const solidStartVersion = getInstalledPackageVersion(
		packageName,
		projectPath
	);

	assert(
		solidStartVersion,
		`Unable to discern the version of the \`${packageName}\` package`
	);

	return solidStartVersion;
}
