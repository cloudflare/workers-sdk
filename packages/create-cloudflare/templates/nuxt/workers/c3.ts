import { logRaw } from "@cloudflare/cli";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { spinner } from "@cloudflare/cli/interactive";
import { runFrameworkGenerator } from "frameworks/index";
import { mergeObjectProperties, transformFile } from "helpers/codemod";
import { writeFile } from "helpers/files";
import { detectPackageManager } from "helpers/packageManagers";
import { installPackages } from "helpers/packages";
import * as recast from "recast";
import type { TemplateConfig } from "../../../src/templates";
import type { C3Context } from "types";

const { npm, name: pm } = detectPackageManager();

const generate = async (ctx: C3Context) => {
	const gitFlag = ctx.args.git ? `--gitInit` : `--no-gitInit`;

	await runFrameworkGenerator(ctx, [
		"init",
		ctx.project.name,
		"--packageManager",
		npm,
		"--no-install",
		gitFlag,
	]);

	writeFile("./.node-version", "18");

	logRaw(""); // newline
};

const configure = async () => {
	const packages = ["nitro-cloudflare-dev", "nitropack"];

	// When using pnpm, explicitly add h3 package so the H3Event type declaration can be updated.
	// Package managers other than pnpm will hoist the dependency, as will pnpm with `--shamefully-hoist`
	if (pm === "pnpm") {
		packages.push("h3");
	}

	await installPackages(packages, {
		dev: true,
		startText: "Installing nitro module `nitro-cloudflare-dev`",
		doneText: `${brandColor("installed")} ${dim(`via \`${npm} install\``)}`,
	});
	updateNuxtConfig();
};

const updateNuxtConfig = () => {
	const s = spinner();

	const configFile = "nuxt.config.ts";
	s.start(`Updating \`${configFile}\``);

	const b = recast.types.builders;

	const presetDef = b.objectProperty(
		b.identifier("nitro"),
		b.objectExpression([
			b.objectProperty(
				b.identifier("preset"),
				b.stringLiteral("cloudflare_module"),
			),
			b.objectProperty(
				b.identifier("cloudflare"),
				b.objectExpression([
					b.objectProperty(
						b.identifier("deployConfig"),
						b.booleanLiteral(true),
					),
					b.objectProperty(b.identifier("nodeCompat"), b.booleanLiteral(true)),
				]),
			),
		]),
	);

	const moduleDef = b.objectProperty(
		b.identifier("modules"),
		b.arrayExpression([b.stringLiteral("nitro-cloudflare-dev")]),
	);

	transformFile(configFile, {
		visitCallExpression: function (n) {
			const callee = n.node.callee as recast.types.namedTypes.Identifier;
			if (callee.name === "defineNuxtConfig") {
				mergeObjectProperties(
					n.node.arguments[0] as recast.types.namedTypes.ObjectExpression,
					[presetDef, moduleDef],
				);
			}

			return this.traverse(n);
		},
	});

	s.stop(`${brandColor(`updated`)} ${dim(`\`${configFile}\``)}`);
};

const config: TemplateConfig = {
	configVersion: 1,
	id: "nuxt",
	frameworkCli: "nuxi",
	platform: "workers",
	displayName: "Nuxt",
	copyFiles: {
		path: "./templates",
	},
	path: "templates/nuxt/workers",
	generate,
	configure,
	transformPackageJson: async () => ({
		scripts: {
			deploy: `${npm} run build && wrangler deploy`,
			preview: `${npm} run build && wrangler dev`,
			"cf-typegen": `wrangler types`,
		},
	}),
	devScript: "dev",
	deployScript: "deploy",
	previewScript: "preview",
};
export default config;
