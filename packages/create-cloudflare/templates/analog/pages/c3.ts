import { logRaw } from "@cloudflare/cli";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { spinner } from "@cloudflare/cli/interactive";
import { runFrameworkGenerator } from "frameworks/index";
import { loadTemplateSnippets, transformFile } from "helpers/codemod";
import { detectPackageManager } from "helpers/packageManagers";
import { installPackages } from "helpers/packages";
import * as recast from "recast";
import type { TemplateConfig } from "../../../src/templates";
import type { C3Context } from "types";

const { npm } = detectPackageManager();

const generate = async (ctx: C3Context) => {
	await runFrameworkGenerator(ctx, [ctx.project.name, "--template", "latest"]);

	logRaw(""); // newline
};

const configure = async (ctx: C3Context) => {
	const packages = [
		"nitropack",
		"h3",
		"@ngtools/webpack",
		"@angular-devkit/build-angular",
	];

	await installPackages(packages, {
		dev: true,
		cwd: ctx.project.path,
		startText: `Installing ${packages.join(", ")}`,
		doneText: `${brandColor("installed")} ${dim(`via \`${npm} install\``)}`,
		// Make sure npm installs all the peer dependencies of the package
		legacyPeerDeps: false,
	});

	updateViteConfig(ctx);
};

const updateViteConfig = (ctx: C3Context) => {
	const b = recast.types.builders;
	const s = spinner();

	const configFile = "vite.config.ts";
	s.start(`Updating \`${configFile}\``);

	const snippets = loadTemplateSnippets(ctx);

	transformFile(configFile, {
		visitProgram(n) {
			const lastImportIndex = n.node.body.findLastIndex(
				(t) => t.type === "ImportDeclaration",
			);
			const lastImport = n.get("body", lastImportIndex);
			lastImport.insertAfter(...snippets.devBindingsModuleTs);

			return this.traverse(n);
		},
		visitCallExpression(n) {
			const callee = n.node.callee as recast.types.namedTypes.Identifier;
			if (callee.name === "analog") {
				const pluginArguments = b.objectProperty(
					b.identifier("nitro"),
					b.objectExpression([
						b.objectProperty(
							b.identifier("preset"),
							b.stringLiteral("cloudflare-pages"),
						),
						b.objectProperty(
							b.identifier("modules"),
							b.arrayExpression([b.identifier("devBindingsModule")]),
						),
					]),
				);

				n.node.arguments = [b.objectExpression([pluginArguments])];
			}

			return this.traverse(n);
		},
	});

	s.stop(`${brandColor(`updated`)} ${dim(`\`${configFile}\``)}`);
};

const config: TemplateConfig = {
	configVersion: 1,
	id: "analog",
	frameworkCli: "create-analog",
	platform: "pages",
	displayName: "Analog",
	copyFiles: {
		path: "./templates",
	},
	path: "templates/analog/pages",
	generate,
	configure,
	transformPackageJson: async () => ({
		scripts: {
			preview: `ng build && wrangler pages dev`,
			deploy: `ng build && wrangler pages deploy`,
			"cf-typegen": `wrangler types`,
		},
	}),
	devScript: "dev",
	deployScript: "deploy",
	previewScript: "preview",
};
export default config;
