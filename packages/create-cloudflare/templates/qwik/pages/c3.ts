import { endSection } from "@cloudflare/cli";
import { brandColor } from "@cloudflare/cli/colors";
import { spinner } from "@cloudflare/cli/interactive";
import { runFrameworkGenerator } from "frameworks/index";
import { loadTemplateSnippets, transformFile } from "helpers/codemod";
import { quoteShellArgs, runCommand } from "helpers/command";
import { usesTypescript } from "helpers/files";
import { detectPackageManager } from "helpers/packageManagers";
import * as recast from "recast";
import type { TemplateConfig } from "../../../src/templates";
import type { C3Context } from "types";

const { npm, npx, name } = detectPackageManager();

const generate = async (ctx: C3Context) => {
	await runFrameworkGenerator(ctx, ["playground", ctx.project.name]);
};

const configure = async (ctx: C3Context) => {
	// Add the pages integration
	// For some reason `pnpx qwik add` fails for qwik so we use `pnpm qwik add` instead.
	const cmd = [name === "pnpm" ? npm : npx, "qwik", "add", "cloudflare-pages"];
	endSection(`Running ${quoteShellArgs(cmd)}`);
	await runCommand(cmd);

	addBindingsProxy(ctx);
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
				throw new Error("Failed to update `vite.config.ts`");
			}

			// Add the `platform` object to the object
			configArgument.properties.push(platformPropery);

			return false;
		},
	});

	s.stop(`${brandColor("updated")} \`vite.config.ts\``);
};

const config: TemplateConfig = {
	configVersion: 1,
	id: "qwik",
	frameworkCli: "create-qwik",
	displayName: "Qwik",
	platform: "pages",
	hidden: true,
	copyFiles: {
		path: "./templates",
	},
	path: "templates/qwik/pages",
	generate,
	configure,
	transformPackageJson: async () => ({
		scripts: {
			deploy: `${npm} run build && wrangler pages deploy`,
			preview: `${npm} run build && wrangler pages dev`,
			"cf-typegen": `wrangler types`,
		},
	}),
	devScript: "dev",
	deployScript: "deploy",
	previewScript: "preview",
	workersTypes: "installed",
};
export default config;
