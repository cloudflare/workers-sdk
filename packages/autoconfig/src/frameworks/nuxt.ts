import path from "node:path";
import {
	mergeObjectProperties,
	transformFile,
} from "@cloudflare/shared-ast-primitives";
import * as recast from "recast";
import { Framework } from "./framework-class";
import type {
	ConfigurationOptions,
	ConfigurationResults,
} from "./framework-class";

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
	}: ConfigurationOptions): Promise<ConfigurationResults> {
		if (!dryRun) {
			updateNuxtConfig(projectPath);
		}

		return {
			buildTool: "wrangler",
			dependencies: [{ name: "nitro-cloudflare-dev", dev: true }],
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
