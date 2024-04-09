import { crash, logRaw } from "@cloudflare/cli";
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
	const packages = ["nitropack"];

	// When using pnpm, explicitly add h3 package so the H3Event type declaration can be updated.
	// Package managers other than pnpm will hoist the dependency, as will pnpm with `--shamefully-hoist`
	if (pm === "pnpm") {
		packages.push("h3");

		await installPackages(packages, {
			dev: true,
			startText: `Installing ${packages.join(", ")}`,
			doneText: `${brandColor("installed")} ${dim(`via \`${npm} install\``)}`,
		});
	}

	updateViteConfig(ctx);
	updateMainServer();
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
				(t) => t.type === "ImportDeclaration"
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
							b.stringLiteral("cloudflare-pages")
						),
						b.objectProperty(
							b.identifier("output"),
							b.objectExpression([
								b.objectProperty(
									b.identifier("dir"),
									b.stringLiteral("./dist/analog/public")
								),
								b.objectProperty(
									b.identifier("serverDir"),
									b.stringLiteral("./dist/analog/public/_worker.js")
								),
							])
						),
						b.objectProperty(
							b.identifier("modules"),
							b.arrayExpression([b.identifier("devBindingsModule")])
						),
					])
				);

				n.node.arguments = [b.objectExpression([pluginArguments])];
			}

			return this.traverse(n);
		},
	});

	s.stop(`${brandColor(`updated`)} ${dim(`\`${configFile}\``)}`);
};

const updateMainServer = () => {
	const b = recast.types.builders;
	const s = spinner();

	const configFile = "src/main.server.ts";
	s.start(`Updating \`${configFile}\``);
	transformFile(configFile, {
		visitProgram(n) {
			const baseUrlImport = b.importDeclaration(
				[b.importSpecifier(b.identifier("APP_BASE_HREF"))],
				b.stringLiteral("@angular/common"),
				"value"
			);

			const lastImportIndex = n.node.body.findLastIndex(
				(t) => t.type === "ImportDeclaration"
			);
			const lastImport = n.get("body", lastImportIndex);
			lastImport.insertAfter(baseUrlImport);

			return this.traverse(n);
		},
		visitFunctionDeclaration(n) {
			if (n.node.id?.name !== "render") {
				return this.traverse(n);
			}

			const baseHrefDeclaration = b.variableDeclaration("const", [
				b.variableDeclarator(
					b.identifier("baseHref"),
					b.logicalExpression(
						"??",
						b.memberExpression(
							b.memberExpression(b.identifier("process"), b.identifier("env")),
							b.stringLiteral("CF_PAGES_URL"),
							true
						),
						b.stringLiteral("http://localhost:8788")
					)
				),
			]);
			baseHrefDeclaration.comments = [b.commentLine("set the base href")];

			n.get("body", "body").unshift(baseHrefDeclaration);

			return this.traverse(n);
		},
		visitCallExpression(n) {
			const name = n.node.callee;
			// Only modify the call to `renderApplication`
			if (name.type !== "Identifier" || name.name !== "renderApplication") {
				return this.traverse(n);
			}

			// The second argument to `renderApplication` is a config object we need to update
			const objectArg = n.node.arguments[1];
			if (objectArg.type !== "ObjectExpression") {
				crash(
					`Found unexpected argument type when modifying ${configFile}. Expected an object as second parameter to "renderApplication"`
				);
			}

			// Add a comment
			n.parent.parent.parent.node.comments = [
				b.commentLine("Use the full URL and provide the APP_BASE_HREF"),
			];

			// Add a "platformProviders" entry to the config object
			objectArg.properties.push(
				b.objectProperty(
					b.identifier("platformProviders"),
					b.arrayExpression([
						b.objectExpression([
							b.objectProperty(
								b.identifier("provide"),
								b.identifier("APP_BASE_HREF")
							),
							b.objectProperty(
								b.identifier("useValue"),
								b.identifier("baseHref")
							),
						]),
					])
				)
			);

			// Lookup the url property in the object. Crash if not found
			const urlIndex = objectArg.properties.findIndex((prop) => {
				if (prop.type !== "ObjectProperty" || prop.key.type !== "Identifier") {
					return false;
				}
				return prop.key.name === "url";
			});

			if (!urlIndex) {
				crash("Failed to update `url` property of `renderApplication`");
			}
			const urlProp = n.get("arguments", 1, "properties", urlIndex);

			urlProp.replace(
				b.objectProperty(
					b.identifier("url"),
					b.templateLiteral(
						[
							b.templateElement({ raw: "", cooked: "" }, false),
							b.templateElement({ raw: "", cooked: "" }, false),
							b.templateElement({ raw: "", cooked: "" }, true),
						],
						[b.identifier("baseHref"), b.identifier("url")]
					)
				)
			);

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
			preview: `${npm} run build && wrangler pages dev ./dist/analog/public`,
			deploy: `${npm} run build && wrangler pages deploy ./dist/analog/public`,
			"build-cf-types": `wrangler types`,
		},
	}),
	devScript: "dev",
	deployScript: "deploy",
	previewScript: "preview",
};
export default config;
