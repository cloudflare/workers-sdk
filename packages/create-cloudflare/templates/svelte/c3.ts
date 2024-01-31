import { logRaw, updateStatus } from "@cloudflare/cli";
import { blue, brandColor, dim } from "@cloudflare/cli/colors";
import { parseTs, transformFile } from "helpers/codemod";
import { installPackages, runFrameworkGenerator } from "helpers/command";
import { compatDateFlag, usesTypescript } from "helpers/files";
import { detectPackageManager } from "helpers/packages";
import { platformInterface } from "./templates";
import type { TemplateConfig } from "../../src/templates";
import type * as recast from "recast";
import type { C3Context } from "types";

const { npm } = detectPackageManager();

const generate = async (ctx: C3Context) => {
	await runFrameworkGenerator(ctx, [ctx.project.name]);

	logRaw("");
};

const configure = async (ctx: C3Context) => {
	// Install the adapter
	const pkg = `@sveltejs/adapter-cloudflare`;
	await installPackages([pkg], {
		dev: true,
		startText: "Adding the Cloudflare Pages adapter",
		doneText: `${brandColor(`installed`)} ${dim(pkg)}`,
	});

	// Change the import statement in svelte.config.js
	transformFile("svelte.config.js", {
		visitImportDeclaration: function (n) {
			// importSource is the `x` in `import y from "x"`
			const importSource = n.value.source;
			if (importSource.value === "@sveltejs/adapter-auto") {
				importSource.value = "@sveltejs/adapter-cloudflare";
			}

			// stop traversing this node
			return false;
		},
	});
	updateStatus(`Changing adapter in ${blue("svelte.config.js")}`);

	// If using typescript, add the platform interface to the `App` interface
	if (usesTypescript(ctx)) {
		transformFile("src/app.d.ts", {
			visitTSModuleDeclaration(n) {
				if (n.value.id.name === "App") {
					const patchAst = parseTs(platformInterface);
					const body = n.node.body as recast.types.namedTypes.TSModuleBlock;
					body.body.push(patchAst.program.body[0]);
				}

				this.traverse(n);
			},
		});
		updateStatus(`Updating global type definitions in ${blue("app.d.ts")}`);
	}
};

const config: TemplateConfig = {
	configVersion: 1,
	id: "svelte",
	displayName: "Svelte",
	platform: "pages",
	generate,
	configure,
	transformPackageJson: async () => ({
		scripts: {
			"pages:preview": `${npm} run build && wrangler pages dev ${await compatDateFlag()} .svelte-kit/cloudflare`,
			"pages:deploy": `${npm} run build && wrangler pages deploy .svelte-kit/cloudflare`,
		},
	}),
	devScript: "dev",
	previewScript: "pages:preview",
};
export default config;
