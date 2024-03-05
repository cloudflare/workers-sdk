import { logRaw } from "@cloudflare/cli";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { spinner } from "@cloudflare/cli/interactive";
import { transformFile } from "helpers/codemod";
import { installPackages, runFrameworkGenerator } from "helpers/command";
import { readFile, writeFile } from "helpers/files";
import { detectPackageManager } from "helpers/packages";
import * as recast from "recast";
import { getLatestTypesEntrypoint } from "../../src/workers";
import type { TemplateConfig } from "../../src/templates";
import type { C3Context } from "types";

const { npm, name: pm } = detectPackageManager();

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

const configure = async (ctx: C3Context) => {
	const packages = ["nitro-cloudflare-dev"];

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

	updateEnvTypes(ctx);
};

const updateEnvTypes = (ctx: C3Context) => {
	const filepath = "env.d.ts";

	const s = spinner();
	s.start(`Updating ${filepath}`);

	let file = readFile(filepath);

	let typesEntrypoint = `@cloudflare/workers-types/`;
	const latestEntrypoint = getLatestTypesEntrypoint(ctx);
	if (latestEntrypoint) {
		typesEntrypoint += `/${latestEntrypoint}`;
	}

	file = file.replace("WORKERS_TYPES_ENTRYPOINT", typesEntrypoint);
	writeFile("env.d.ts", file);

	s.stop(`${brandColor(`updated`)} ${dim(`\`${filepath}\``)}`);
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
	displayName: "Nuxt",
	copyFiles: {
		path: "./templates",
	},
	devScript: "dev",
	deployScript: "deploy",
	generate,
	configure,
	transformPackageJson: async () => ({
		scripts: {
			deploy: `${npm} run build && wrangler pages deploy ./dist`,
			preview: `${npm} run build && wrangler pages dev ./dist`,
			"build-cf-types": `wrangler types`,
		},
	}),
};
export default config;
