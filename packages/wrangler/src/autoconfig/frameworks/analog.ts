import { existsSync } from "node:fs";
import { join } from "node:path";
import { updateStatus } from "@cloudflare/cli-shared-helpers";
import { blue } from "@cloudflare/cli-shared-helpers/colors";
import { mergeObjectProperties, transformFile } from "@cloudflare/codemod";
import { getTodaysCompatDate } from "@cloudflare/workers-utils";
import * as recast from "recast";
import { Framework } from "./framework-class";
import type {
	ConfigurationOptions,
	ConfigurationResults,
} from "./framework-class";

export class Analog extends Framework {
	async configure({
		dryRun,
		projectPath,
	}: ConfigurationOptions): Promise<ConfigurationResults> {
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

	const compatDate = getTodaysCompatDate();

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
