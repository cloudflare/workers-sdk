import { logRaw, updateStatus } from "@cloudflare/cli";
import { blue, brandColor, dim } from "@cloudflare/cli/colors";
import { runFrameworkGenerator } from "frameworks/index";
import { mergeObjectProperties, transformFile } from "helpers/codemod";
import { usesTypescript } from "helpers/files";
import { detectPackageManager } from "helpers/packageManagers";
import { installPackages } from "helpers/packages";
import * as recast from "recast";
import type { TemplateConfig } from "../../src/templates";
import type { C3Context } from "types";

const { npm } = detectPackageManager();

const generate = async (ctx: C3Context) => {
	// Run the create-solid command
	// -s flag forces solid-start
	await runFrameworkGenerator(ctx, ["-p", ctx.project.name, "-s"]);

	logRaw("");
};

const configure = async (ctx: C3Context) => {
	const packages = ["nitropack"];
	await installPackages(packages, {
		dev: true,
		startText: "Installing nitro module `nitropack`",
		doneText: `${brandColor("installed")} ${dim(`via \`${npm} install\``)}`,
	});

	usesTypescript(ctx);
	const filePath = `app.config.${usesTypescript(ctx) ? "ts" : "js"}`;

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
							// preset: "cloudflare-pages"
							b.objectProperty(
								b.identifier("preset"),
								b.stringLiteral("./cloudflare-pages"),
							),
							// output: {
							// 	dir: "{{ rootDir }}/dist",
							// 	publicDir: "{{ output.dir }}/public",
							// 	serverDir: "{{ output.dir }}/worker",
							// },
							b.objectProperty(
								b.identifier("output"),
								b.objectExpression([
									b.objectProperty(
										b.identifier("dir"),
										b.stringLiteral("{{ rootDir }}/dist"),
									),
									b.objectProperty(
										b.identifier("publicDir"),
										b.stringLiteral("{{ output.dir }}/public"),
									),
									b.objectProperty(
										b.identifier("serverDir"),
										b.stringLiteral("{{ output.dir }}/worker"),
									),
								]),
							),
							// rollupConfig: {
							// 	external: ["node:async_hooks"],
							// },
							b.objectProperty(
								b.identifier("rollupConfig"),
								b.objectExpression([
									b.objectProperty(
										b.identifier("external"),
										b.arrayExpression([b.stringLiteral("node:async_hooks")]),
									),
								]),
							),
							// hooks: {
							// 	// Prevent the Pages preset from writing the _routes.json etc.
							// 	compiled() {},
							// },
							b.objectProperty(
								b.identifier("hooks"),
								b.objectExpression([
									b.objectMethod(
										"method",
										b.identifier("compiled"),
										[],
										b.blockStatement([]),
										false,
									),
								]),
							),
						]),
					),
				],
			);

			return false;
		},
	});
};

const config: TemplateConfig = {
	configVersion: 1,
	id: "solid",
	frameworkCli: "create-solid",
	displayName: "Solid",
	platform: "workers",
	copyFiles: {
		path: "./templates",
	},
	path: "templates-experimental/solid",
	generate,
	configure,
	transformPackageJson: async () => ({
		scripts: {
			preview: `${npm} run build && npx wrangler dev`,
			deploy: `${npm} run build && wrangler deploy`,
		},
	}),
	compatibilityFlags: ["nodejs_compat"],
	devScript: "dev",
	deployScript: "deploy",
	previewScript: "preview",
};
export default config;
