import { logRaw } from "@cloudflare/cli";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { spinner } from "@cloudflare/cli/interactive";
import { runFrameworkGenerator } from "frameworks/index";
import { transformFile } from "helpers/codemod";
import { runCommand } from "helpers/command";
import { getLatestTypesEntrypoint } from "helpers/compatDate";
import { readFile, writeFile } from "helpers/files";
import { detectPackageManager } from "helpers/packageManagers";
import { installPackages } from "helpers/packages";
import * as recast from "recast";
import type { TemplateConfig } from "../../../src/templates";
import type { C3Context } from "types";

const { npm, name: pm } = detectPackageManager();

const generate = async (ctx: C3Context) => {
	await runFrameworkGenerator(ctx, [ctx.project.name, "--template", "latest"]);

	logRaw(""); // newline
};

const configure = async (ctx: C3Context) => {
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

	// ...?
	await runCommand([npm, "install"], {
		silent: true,
		cwd: ctx.project.path,
		startText: "Installing dependencies",
		doneText: `${brandColor("installed")} ${dim(`via \`${npm} install\``)}`,
	});

	updateViteConfig();
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

const updateViteConfig = () => {
	const b = recast.types.builders;
	const s = spinner();

	const configFile = "vite.config.ts";
	s.start(`Updating \`${configFile}\``);

	transformFile(configFile, {
		visitCallExpression(n) {
			const callee = n.node.callee as recast.types.namedTypes.Identifier;
			if (callee.name === "analog") {
				const pluginArguments = b.objectProperty(
					b.identifier("nitro"),
					b.objectExpression([
						b.objectProperty(
							b.identifier("preset"),
							b.stringLiteral("cloudflare_module"),
						),
						b.objectProperty(
							b.identifier("modules"),
							b.arrayExpression([b.stringLiteral("nitro-cloudflare-dev")]),
						),
						b.objectProperty(
							b.identifier("cloudflare"),
							b.objectExpression([
								b.objectProperty(
									b.identifier("deployConfig"),
									b.booleanLiteral(true),
								),
								b.objectProperty(
									b.identifier("nodeCompat"),
									b.booleanLiteral(true),
								),
							]),
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
	platform: "workers",
	displayName: "Analog",
	copyFiles: {
		path: "./templates",
	},
	path: "templates/analog/workers",
	generate,
	configure,
	transformPackageJson: async () => ({
		scripts: {
			preview: `${npm} run build && wrangler dev`,
			deploy: `${npm} run build && wrangler deploy`,
			"cf-typegen": `wrangler types`,
		},
	}),
	devScript: "dev",
	deployScript: "deploy",
	previewScript: "preview",
};
export default config;
