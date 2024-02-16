import { endSection } from "@cloudflare/cli";
import { brandColor } from "@cloudflare/cli/colors";
import { spinner } from "@cloudflare/cli/interactive";
import { loadTemplateSnippets, parseTs, transformFile } from "helpers/codemod";
import { runCommand, runFrameworkGenerator } from "helpers/command";
import { usesTypescript } from "helpers/files";
import { detectPackageManager } from "helpers/packages";
import * as recast from "recast";
import { quoteShellArgs } from "../../src/common";
import type { TemplateConfig } from "../../src/templates";
import type { C3Context } from "types";

const { npm, npx } = detectPackageManager();

const generate = async (ctx: C3Context) => {
	await runFrameworkGenerator(ctx, ["basic", ctx.project.name]);
};

const configure = async (ctx: C3Context) => {
	// Add the pages integration
	const cmd = [npx, "qwik", "add", "cloudflare-pages"];
	endSection(`Running ${quoteShellArgs(cmd)}`);
	await runCommand(cmd);

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

	transformFile("vite.config.ts", {
		// Insert the env declaration after the last import (but before the rest of the body)
		visitProgram: function (n) {
			const lastImportIndex = n.node.body.findLastIndex(
				(t) => t.type === "ImportDeclaration"
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

			n.node.arguments = [parseTs("{ platform }")];

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
					b.tsTypeAnnotation(b.tsTypeReference(b.identifier(type)))
				)
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
	displayName: "Qwik",
	platform: "pages",
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
