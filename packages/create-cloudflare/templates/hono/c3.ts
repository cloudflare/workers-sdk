import { logRaw } from "@cloudflare/cli";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { spinner } from "@cloudflare/cli/interactive";
import { runFrameworkGenerator } from "frameworks/index";
import { loadTemplateSnippets, transformFile } from "helpers/codemod";
import { detectPackageManager } from "helpers/packageManagers";
import type { TemplateConfig } from "../../src/templates";
import type * as recast from "recast";
import type { C3Context } from "types";

const generate = async (ctx: C3Context) => {
	const { name: pm } = detectPackageManager();

	await runFrameworkGenerator(ctx, [
		ctx.project.name,
		"--template",
		"cloudflare-workers",
		"--install",
		"--pm",
		pm,
	]);

	logRaw(""); // newline
};

const configure = async (ctx: C3Context) => {
	const indexFile = "src/index.ts";

	const s = spinner();
	s.start(`Updating \`${indexFile}\``);

	const snippets = loadTemplateSnippets(ctx);

	transformFile(indexFile, {
		visitVariableDeclarator(n) {
			if (n.node.id.type === "Identifier" && n.node.id.name === "app") {
				n.node.init = snippets
					.appDeclarationTs[0] as recast.types.namedTypes.NewExpression;

				return false;
			}
		},
	});

	s.stop(`${brandColor("updated")} \`${dim(indexFile)}\``);
};

const config: TemplateConfig = {
	configVersion: 1,
	id: "hono",
	displayName: "Hono",
	copyFiles: {
		path: "./templates",
	},
	platform: "workers",
	generate,
	configure,
	transformPackageJson: async () => ({
		scripts: {
			dev: "wrangler dev",
			deploy: "wrangler deploy --minify",
			"cf-typegen": "wrangler types --env-interface CloudflareBindings",
		},
	}),
	devScript: "dev",
	deployScript: "deploy",
};
export default config;
