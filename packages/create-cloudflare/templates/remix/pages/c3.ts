import { logRaw } from "@cloudflare/cli";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { spinner } from "@cloudflare/cli/interactive";
import { runFrameworkGenerator } from "frameworks/index";
import { transformFile } from "helpers/codemod";
import { detectPackageManager } from "helpers/packageManagers";
import type { TemplateConfig } from "../../../src/templates";
import type { C3Context } from "types";

const { npm } = detectPackageManager();

const generate = async (ctx: C3Context) => {
	await runFrameworkGenerator(ctx, [
		ctx.project.name,
		"--template",
		"https://github.com/remix-run/remix/tree/main-prev/templates/cloudflare",
	]);

	logRaw(""); // newline
};

const configure = async () => {
	const typeDefsPath = "load-context.ts";

	const s = spinner();
	s.start(`Updating \`${typeDefsPath}\``);

	// Remove the empty Env declaration from the template to allow the type from
	// worker-configuration.d.ts to take over
	transformFile(typeDefsPath, {
		visitTSInterfaceDeclaration(n) {
			if (n.node.id.type === "Identifier" && n.node.id.name !== "Env") {
				return this.traverse(n);
			}

			// Removes the node
			n.replace();
			return false;
		},
	});

	s.stop(`${brandColor("updated")} \`${dim(typeDefsPath)}\``);
};

const config: TemplateConfig = {
	configVersion: 1,
	id: "remix",
	frameworkCli: "create-remix",
	platform: "pages",
	hidden: true,
	displayName: "Remix",
	copyFiles: {
		path: "./templates",
	},
	path: "templates/remix/pages",
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
