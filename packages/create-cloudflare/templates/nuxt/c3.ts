import { logRaw } from "@cloudflare/cli";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { spinner } from "@cloudflare/cli/interactive";
import { transformFile } from "helpers/codemod";
import { installPackages, runFrameworkGenerator } from "helpers/command";
import { writeFile } from "helpers/files";
import { detectPackageManager } from "helpers/packages";
import * as recast from "recast";
import type { TemplateConfig } from "../../src/templates";
import type { C3Context } from "types";

const { npm } = detectPackageManager();

const generate = async (ctx: C3Context) => {
	const gitFlag = ctx.args.git ? `--gitInit` : `--no-gitInit`;

	await runFrameworkGenerator(ctx, [
		"init",
		ctx.project.name,
		"--packageManager",
		npm,
		gitFlag,
	]);

	writeFile("./.node-version", "17");

	logRaw(""); // newline
};

const configure = async () => {
	await installPackages(["nitro-cloudflare-dev"], {
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
				b.stringLiteral("cloudflare-pages")
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
				const obj = n.node
					.arguments[0] as recast.types.namedTypes.ObjectExpression;

				obj.properties.push(presetDef);
				obj.properties.push(moduleDef);
			}

			return this.traverse(n);
		},
	});

	s.stop(`${brandColor(`updated`)} ${dim(`\`${configFile}\``)}`);
};

const config: TemplateConfig = {
	configVersion: 1,
	id: "nuxt",
	platform: "pages",
	copyFiles: {
		path: "./templates",
	},
	displayName: "Nuxt",
	devScript: "dev",
	deployScript: "deploy",
	generate,
	configure,
	transformPackageJson: async () => ({
		scripts: {
			deploy: `${npm} run build && wrangler pages deploy ./dist`,
			preview: `${npm} run build && wrangler pages dev ./dist`,
		},
	}),
};
export default config;
