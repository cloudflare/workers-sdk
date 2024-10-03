import { logRaw } from "@cloudflare/cli";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { spinner } from "@cloudflare/cli/interactive";
import { runFrameworkGenerator } from "frameworks/index";
import { transformFile } from "helpers/codemod";
import { detectPackageManager } from "helpers/packageManagers";
import { installPackages } from "helpers/packages";
import type { TemplateConfig } from "../../src/templates";
import type { C3Context } from "types";

const { npm } = detectPackageManager();

const generate = async (ctx: C3Context) => {
	await runFrameworkGenerator(ctx, [
		ctx.project.name,
		"--template",
		"https://github.com/remix-run/remix/tree/main/templates/cloudflare",
	]);

	logRaw(""); // newline
};

const configure = async () => {
	await installPackages(["wrangler@latest"], {
		dev: true,
		startText: "Updating the Wrangler version",
		doneText: `${brandColor(`updated`)} ${dim("wrangler@latest")}`,
	});

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
	platform: "workers",
	displayName: "Remix",
	copyFiles: {
		path: "./templates",
	},
	path: "templates-experimental/remix",
	generate,
	configure,
	transformPackageJson: async () => ({
		scripts: {
			build:
				"remix vite:build && wrangler pages functions build --outdir build/worker",
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
