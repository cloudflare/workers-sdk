import { logRaw } from "@cloudflare/cli";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { spinner } from "@cloudflare/cli/interactive";
import { runFrameworkGenerator } from "frameworks/index";
import { loadTemplateSnippets, transformFile } from "helpers/codemod";
import { getLatestTypesEntrypoint } from "helpers/compatDate";
import { readFile, writeFile } from "helpers/files";
import { detectPackageManager } from "helpers/packageManagers";
import { installPackages } from "helpers/packages";
import * as recast from "recast";
import type { TemplateConfig } from "../../src/templates";
import type { C3Context } from "types";

const { npm, name: pm } = detectPackageManager();

const generate = async (ctx: C3Context) => {
	await runFrameworkGenerator(ctx, [
		ctx.project.name,
		"--template",
		"angular-v17",
	]);

	logRaw(""); // newline
};

const configure = async (ctx: C3Context) => {
	// Fix hoisting issues with pnpm, yarn and bun
	if (pm === "pnpm" || pm === "yarn" || pm === "bun") {
		const packages = [];
		packages.push("nitropack");
		packages.push("h3");
		packages.push("@ngtools/webpack");
		packages.push("@angular-devkit/build-angular");

		await installPackages(packages, {
			dev: true,
			startText: `Installing ${packages.join(", ")}`,
			doneText: `${brandColor("installed")} ${dim(`via \`${npm} install\``)}`,
		});
	}

	updateViteConfig(ctx);
	updateEnvTypes(ctx);
};

const updateEnvTypes = (ctx: C3Context) => {
	const filepath = "env.d.ts";

	const s = spinner();
	s.start(`Updating ${filepath}`);

	let file = readFile(filepath);

	let typesEntrypoint = `@cloudflare/workers-types`;
	const latestEntrypoint = getLatestTypesEntrypoint(ctx);
	if (latestEntrypoint) {
		typesEntrypoint += `/${latestEntrypoint}`;
	}

	// Replace placeholder with actual types entrypoint
	file = file.replace("WORKERS_TYPES_ENTRYPOINT", typesEntrypoint);
	writeFile("env.d.ts", file);

	s.stop(`${brandColor(`updated`)} ${dim(`\`${filepath}\``)}`);
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
	platform: "pages",
	displayName: "Analog",
	copyFiles: {
		path: "./templates",
	},
	generate,
	configure,
	transformPackageJson: async () => ({
		scripts: {
			preview: `${npm} run build && wrangler pages dev`,
			deploy: `${npm} run build && wrangler pages deploy`,
			"cf-typegen": `wrangler types`,
		},
	}),
	devScript: "dev",
	deployScript: "deploy",
	previewScript: "preview",
};
export default config;
