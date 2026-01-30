import { logRaw, updateStatus } from "@cloudflare/cli";
import { blue, brandColor, dim } from "@cloudflare/cli/colors";
import { runFrameworkGenerator } from "frameworks/index";
import { transformFile } from "helpers/codemod";
import { runCommand } from "helpers/command";
import { usesTypescript } from "helpers/files";
import { detectPackageManager } from "helpers/packageManagers";
import * as recast from "recast";
import type { TemplateConfig } from "../../../src/templates";
import type { C3Context, PackageJson } from "types";

const { npx } = detectPackageManager();

const generate = async (ctx: C3Context) => {
	// `--add cloudflare` could be used here because it invokes `astro` which is not installed (`--no-install`)
	// The adapter is added in the `configure` step instead
	await runFrameworkGenerator(ctx, [
		ctx.project.name,
		// c3 will later install the dependencies
		"--no-install",
		// c3 will later ask users if they want to use git
		"--no-git",
	]);

	logRaw(""); // newline
};

const configure = async () => {
	await runCommand([npx, "astro", "add", "cloudflare", "-y"], {
		silent: true,
		startText: "Installing adapter",
		doneText: `${brandColor("installed")} ${dim(
			`via \`${npx} astro add cloudflare\``,
		)}`,
	});

	// Update Astro config to enable platformProxy and imageService
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
					// platformProxy: {
					//   enabled: true,
					// },
					b.objectProperty(
						b.identifier("platformProxy"),
						b.objectExpression([
							b.objectProperty(b.identifier("enabled"), b.booleanLiteral(true)),
						]),
					),
					// imageService: "cloudflare",
					b.objectProperty(
						b.identifier("imageService"),
						b.stringLiteral("cloudflare"),
					),
				]),
			];

			return false;
		},
	});
};

const config: TemplateConfig = {
	configVersion: 1,
	id: "astro",
	frameworkCli: "create-astro",
	platform: "pages",
	hidden: true,
	displayName: "Astro",
	path: "templates/astro/pages",
	copyFiles: {
		async selectVariant(ctx) {
			// Note: this `selectVariant` function should not be needed
			//       this is just a quick workaround until
			//       https://github.com/cloudflare/workers-sdk/issues/7495
			//       is resolved
			return usesTypescript(ctx) ? "ts" : "js";
		},
		variants: {
			js: {
				path: "./templates/js",
			},
			ts: {
				path: "./templates/ts",
			},
		},
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
