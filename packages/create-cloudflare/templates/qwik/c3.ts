import { endSection } from "@cloudflare/cli";
import { brandColor } from "@cloudflare/cli/colors";
import { spinner } from "@cloudflare/cli/interactive";
import { parseTs, transformFile } from "helpers/codemod";
import { runCommand, runFrameworkGenerator } from "helpers/command";
import { usesTypescript } from "helpers/files";
import { detectPackageManager } from "helpers/packages";
import { quoteShellArgs } from "../../src/common";
import type { TemplateConfig } from "../../src/templates";
import type * as recast from "recast";
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
};

const addBindingsProxy = (ctx: C3Context) => {
	// Qwik only has a typescript template atm.
	// This check is an extra precaution
	if (!usesTypescript(ctx)) {
		return;
	}

	const s = spinner();
	s.start("Updating `vite.config.ts`");

	// Insert the env declaration after the last import (but before the rest of the body)
	const envDeclaration = `
let env = {};

if(process.env.NODE_ENV === 'development') {
  const { getBindingsProxy } = await import('wrangler');
  const { bindings } = await getBindingsProxy();
  env = bindings;
}
`;

	transformFile("vite.config.ts", {
		visitProgram: function (n) {
			const lastImportIndex = n.node.body.findLastIndex(
				(t) => t.type === "ImportDeclaration"
			);
			n.get("body").insertAt(lastImportIndex + 1, envDeclaration);

			return false;
		},
	});

	// Populate the `qwikCity` plugin with the platform object containing the `env` defined above.
	const platformObject = parseTs(`{ platform: { env } }`);

	transformFile("vite.config.ts", {
		visitCallExpression: function (n) {
			const callee = n.node.callee as recast.types.namedTypes.Identifier;
			if (callee.name === "qwikCity") {
				n.node.arguments = [platformObject];
			}

			this.traverse(n);
		},
	});

	s.stop(`${brandColor("updated")} \`vite.config.ts\``);
};

const config: TemplateConfig = {
	configVersion: 1,
	id: "qwik",
	displayName: "Qwik",
	platform: "pages",
	devScript: "dev",
	deployScript: "deploy",
	generate,
	configure,
	transformPackageJson: async () => ({
		scripts: {
			deploy: `${npm} run build && wrangler pages deploy ./dist`,
		},
	}),
};
export default config;
