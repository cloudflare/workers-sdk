import { updateStatus } from "@cloudflare/cli";
import { blue } from "@cloudflare/cli/colors";
import { getLocalWorkerdCompatibilityDate } from "@cloudflare/workers-utils";
import * as recast from "recast";
import { mergeObjectProperties, transformFile } from "../c3-vendor/codemod";
import { usesTypescript } from "../uses-typescript";
import { Framework } from ".";
import type { ConfigurationOptions, ConfigurationResults } from ".";

export class SolidStart extends Framework {
	async configure({
		projectPath,
		dryRun,
	}: ConfigurationOptions): Promise<ConfigurationResults> {
		if (!dryRun) {
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
