import assert from "node:assert";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { updateStatus } from "@cloudflare/cli";
import { blue } from "@cloudflare/cli/colors";
import { getLocalWorkerdCompatibilityDate } from "@cloudflare/workers-utils";
import * as recast from "recast";
import semiver from "semiver";
import { mergeObjectProperties, transformFile } from "../c3-vendor/codemod";
import { getInstalledPackageVersion } from "./utils/packages";
import { Framework } from ".";
import type { ConfigurationOptions, ConfigurationResults } from ".";

export class Analog extends Framework {
	async configure({
		dryRun,
		projectPath,
	}: ConfigurationOptions): Promise<ConfigurationResults> {
		checkMinimumAnalogVersion(projectPath);

		if (!dryRun) {
			await updateViteConfig(projectPath);
		}

		return {
			wranglerConfig: {
				main: "./dist/analog/server/index.mjs",
				assets: {
					binding: "ASSETS",
					directory: "./dist/analog/public",
				},
			},
		};
	}
}

async function updateViteConfig(projectPath: string) {
	const viteConfigTsPAth = join(projectPath, "vite.config.ts");
	const viteConfigJsPath = join(projectPath, "vite.config.js");

	let viteConfigPath: string;

	if (existsSync(viteConfigTsPAth)) {
		viteConfigPath = viteConfigTsPAth;
	} else if (existsSync(viteConfigJsPath)) {
		viteConfigPath = viteConfigJsPath;
	} else {
		throw new Error("Could not find Vite config file to modify");
	}

	const { date: compatDate } = getLocalWorkerdCompatibilityDate({
		projectPath,
	});

	updateStatus(`Updating configuration in ${blue(viteConfigPath)}`);

	transformFile(viteConfigPath, {
		visitCallExpression: function (n) {
			const callee = n.node.callee as recast.types.namedTypes.Identifier;
			if (callee.name !== "analog") {
				return this.traverse(n);
			}

			const b = recast.types.builders;
			const presetDef = [
				b.objectProperty(
					b.identifier("nitro"),
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
			];

			if (n.node.arguments.length === 0) {
				n.node.arguments.push(b.objectExpression(presetDef));
			} else {
				mergeObjectProperties(
					n.node.arguments[0] as recast.types.namedTypes.ObjectExpression,
					presetDef
				);
			}

			return false;
		},
	});
}

/**
 * Checks that the project's analog version to ensure that it is greater than 2.0.0, an error is thrown if it isn't.
 *
 * We preform this check because, prior to v2 Analog had a different implementation, so the autoconfig configuration steps
 * would be significantly different for such versions, also some of those versions had some incompatibility with what was
 * at the time our integration solution with Analog (and we didn't get to the bottom of those issues), for these two reasons
 * we just say what analog pre-v2 is not supported (of course we can always revisit this in the future is needed).
 *
 * @param projectPath The path of the project
 */
function checkMinimumAnalogVersion(projectPath: string): void {
	const analogJsVersion = getInstalledPackageVersion(
		"@analogjs/platform",
		projectPath
	);

	assert(
		analogJsVersion,
		"Unable to discern the version of the `@analogjs/platform` package"
	);

	if (semiver(analogJsVersion, "2.0.0") < 0) {
		// Note: analog, prior to v2 had a different implementation so the configuration steps here would be significantly different,
		//       also some of those analog versions had some incompatibility with what was at the time our integration solution with analog,
		//       for these two reasons we just say what analog pre-v2 is not supported
		throw new Error("Analog versions earlier than 2.0.0 are not supported");
	}
}
