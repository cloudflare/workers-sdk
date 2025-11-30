import { updateStatus } from "@cloudflare/cli";
import { blue, brandColor, dim } from "@cloudflare/cli/colors";
import * as recast from "recast";
import { getPackageManager } from "../../package-manager";
import { getDevCompatibilityDate } from "../../utils/compatibility-date";
import { mergeObjectProperties, transformFile } from "../c3-vendor/codemod";
import { installPackages } from "../c3-vendor/packages";
import { usesTypescript } from "../uses-typescript";
import { Framework } from ".";
import type { ConfigurationOptions, ConfigurationResults } from ".";

export class SolidStart extends Framework {
	async configure({
		projectPath,
		dryRun,
	}: ConfigurationOptions): Promise<ConfigurationResults> {
		const packageManager = await getPackageManager();

		if (!dryRun) {
			await installPackages(["nitropack"], {
				dev: true,
				startText: "Installing nitro module `nitropack`",
				doneText: `${brandColor("installed")} ${dim(`via \`${packageManager.type} install\``)}`,
			});

			const filePath = `app.config.${usesTypescript(projectPath) ? "ts" : "js"}`;

			const compatDate = getDevCompatibilityDate(undefined);

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

		return {
			wranglerConfig: {
				main: "./.output/server/index.mjs",
				compatibility_flags: ["nodejs_compat"],
				assets: {
					binding: "ASSETS",
					directory: "./.output/public",
				},
			},
		};
	}
}
