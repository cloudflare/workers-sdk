import path from "node:path";
import { brandColor, dim } from "@cloudflare/cli/colors";
import * as recast from "recast";
import { mergeObjectProperties, transformFile } from "../c3-vendor/codemod";
import { installPackages } from "../c3-vendor/packages";
import { Framework } from ".";
import type { ConfigurationOptions, ConfigurationResults } from ".";

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

export class Nuxt extends Framework {
	async configure({
		dryRun,
		projectPath,
		packageManager,
	}: ConfigurationOptions): Promise<ConfigurationResults> {
		if (!dryRun) {
			await installPackages(packageManager, ["nitro-cloudflare-dev"], {
				dev: true,
				startText: "Installing the Cloudflare dev module",
				doneText: `${brandColor(`installed`)} ${dim("nitro-cloudflare-dev")}`,
			});
			updateNuxtConfig(projectPath);
		}

		return {
			wranglerConfig: {
				main: "./.output/server/index.mjs",
				assets: {
					binding: "ASSETS",
					directory: "./.output/public/",
				},
				observability: {
					enabled: true,
				},
			},
		};
	}

	configurationDescription = "Configuring project for Nuxt";
}
