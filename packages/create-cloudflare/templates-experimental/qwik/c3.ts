import { crash, endSection } from "@cloudflare/cli";
import { brandColor } from "@cloudflare/cli/colors";
import { spinner } from "@cloudflare/cli/interactive";
import { runFrameworkGenerator } from "frameworks/index";
import { loadTemplateSnippets, transformFile } from "helpers/codemod";
import { quoteShellArgs, runCommand } from "helpers/command";
import { removeFile, usesTypescript } from "helpers/files";
import { detectPackageManager } from "helpers/packageManagers";
import * as recast from "recast";
import type { TemplateConfig } from "../../src/templates";
import type { C3Context } from "types";

const { npm, npx } = detectPackageManager();

const generate = async (ctx: C3Context) => {
	await runFrameworkGenerator(ctx, ["playground", ctx.project.name]);
};

const configure = async (ctx: C3Context) => {
	// Add the pages integration
	const cmd = [npx, "qwik", "add", "cloudflare-pages"];
	endSection(`Running ${quoteShellArgs(cmd)}`);
	await runCommand(cmd);

	// Remove the extraneous Pages files
	removeFile("./public/_headers");
	removeFile("./public/_redirects");
	removeFile("./public/_routes.json");

	addBindingsProxy(ctx);
	populateCloudflareEnv();
};

const addBindingsProxy = (ctx: C3Context) => {
	// Qwik only has a typescript template atm.
	// This check is an extra precaution
	if (!usesTypescript(ctx)) {
		return;
	}

	const s = spinner();
	s.start("Updating `vite.config.ts`");

	const snippets = loadTemplateSnippets(ctx);
	const b = recast.types.builders;

	transformFile("vite.config.ts", {
		// Insert the env declaration after the last import (but before the rest of the body)
		visitProgram: function (n) {
			const lastImportIndex = n.node.body.findLastIndex(
				(t) => t.type === "ImportDeclaration",
			);
			const lastImport = n.get("body", lastImportIndex);
			lastImport.insertAfter(...snippets.getPlatformProxyTs);

			return this.traverse(n);
		},
		// Pass the `platform` object from the declaration to the `qwikCity` plugin
		visitCallExpression: function (n) {
			const callee = n.node.callee as recast.types.namedTypes.Identifier;
			if (callee.name !== "qwikCity") {
				return this.traverse(n);
			}

			// The config object passed to `qwikCity`
			const configArgument = n.node.arguments[0] as
				| recast.types.namedTypes.ObjectExpression
				| undefined;

			const platformPropery = b.objectProperty.from({
				key: b.identifier("platform"),
				value: b.identifier("platform"),
				shorthand: true,
			});

			if (!configArgument) {
				n.node.arguments = [b.objectExpression([platformPropery])];

				return false;
			}

			if (configArgument.type !== "ObjectExpression") {
				crash("Failed to update `vite.config.ts`");
			}

			// Add the `platform` object to the object
			configArgument.properties.push(platformPropery);

			return false;
		},
	});

	s.stop(`${brandColor("updated")} \`vite.config.ts\``);
};

const populateCloudflareEnv = () => {
	const entrypointPath = "src/entry.cloudflare-pages.tsx";

	const s = spinner();
	s.start(`Updating \`${entrypointPath}\``);

	transformFile(entrypointPath, {
		visitTSInterfaceDeclaration: function (n) {
			const b = recast.types.builders;
			const id = n.node.id as recast.types.namedTypes.Identifier;
			if (id.name !== "QwikCityPlatform") {
				this.traverse(n);
			}

			const newBody = [
				["env", "Env"],
				// Qwik doesn't supply `cf` to the platform object. Should they do so, uncomment this
				// ["cf", "CfProperties"],
			].map(([varName, type]) =>
				b.tsPropertySignature(
					b.identifier(varName),
					b.tsTypeAnnotation(b.tsTypeReference(b.identifier(type))),
				),
			);

			n.node.body.body = newBody;

			return false;
		},
	});

	s.stop(`${brandColor("updated")} \`${entrypointPath}\``);
};

const config: TemplateConfig = {
	configVersion: 1,
	id: "qwik",
	frameworkCli: "create-qwik",
	displayName: "Qwik",
	platform: "workers",
	copyFiles: {
		path: "./templates",
	},
	path: "templates-experimental/qwik",
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
