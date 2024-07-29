import { logRaw, updateStatus } from "@cloudflare/cli";
import { blue, brandColor, dim } from "@cloudflare/cli/colors";
import { runFrameworkGenerator } from "frameworks/index";
import { loadTemplateSnippets, transformFile } from "helpers/codemod";
import { runCommand } from "helpers/command";
import { usesTypescript } from "helpers/files";
import { detectPackageManager } from "helpers/packageManagers";
import * as recast from "recast";
import type { TemplateConfig } from "../../src/templates";
import type { C3Context, PackageJson } from "types";

const { npx } = detectPackageManager();

const generate = async (ctx: C3Context) => {
	await runFrameworkGenerator(ctx, [ctx.project.name, "--no-install"]);

	logRaw(""); // newline
};

const configure = async (ctx: C3Context) => {
	await runCommand([npx, "astro", "add", "cloudflare", "-y"], {
		silent: true,
		startText: "Installing adapter",
		doneText: `${brandColor("installed")} ${dim(
			`via \`${npx} astro add cloudflare\``,
		)}`,
	});

	updateAstroConfig();
	updateEnvDeclaration(ctx);
};

const updateAstroConfig = () => {
	const filePath = "astro.config.mjs";

	updateStatus(`Updating configuration in ${blue(filePath)}`);

	transformFile(filePath, {
		visitCallExpression: function (n) {
			const callee = n.node.callee as recast.types.namedTypes.Identifier;
			if (callee.name !== "cloudflare") {
				return this.traverse(n);
			}

			const b = recast.types.builders;
			n.node.arguments = [
				b.objectExpression([
					b.objectProperty(
						b.identifier("platformProxy"),
						b.objectExpression([
							b.objectProperty(b.identifier("enabled"), b.booleanLiteral(true)),
						]),
					),
				]),
			];

			return false;
		},
	});
};

const updateEnvDeclaration = (ctx: C3Context) => {
	if (!usesTypescript(ctx)) {
		return;
	}

	const filePath = "src/env.d.ts";

	updateStatus(`Adding type declarations in ${blue(filePath)}`);

	transformFile(filePath, {
		visitProgram: function (n) {
			const snippets = loadTemplateSnippets(ctx);
			const patch = snippets.runtimeDeclarationTs;
			const b = recast.types.builders;

			// Preserve comments with the new body
			const comments = n.get("comments").value;
			n.node.comments = comments.map((c: recast.types.namedTypes.CommentLine) =>
				b.commentLine(c.value),
			);

			// Add the patch
			n.get("body").push(...patch);

			return false;
		},
	});
};

const config: TemplateConfig = {
	configVersion: 1,
	id: "astro",
	platform: "pages",
	displayName: "Astro",
	copyFiles: {
		path: "./templates",
	},
	devScript: "dev",
	deployScript: "deploy",
	previewScript: "preview",
	generate,
	configure,
	transformPackageJson: async (pkgJson: PackageJson, ctx: C3Context) => ({
		scripts: {
			deploy: `astro build && wrangler pages deploy`,
			preview: `astro build && wrangler pages dev`,
			...(usesTypescript(ctx) && { "cf-typegen": `wrangler types` }),
		},
	}),
};
export default config;
