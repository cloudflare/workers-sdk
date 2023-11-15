import { logRaw, updateStatus } from "@cloudflare/cli";
import { brandColor, dim, blue } from "@cloudflare/cli/colors";
import { parseTs, transformFile } from "helpers/codemod";
import {
	installPackages,
	npmInstall,
	runFrameworkGenerator,
} from "helpers/command";
import { compatDateFlag, usesTypescript } from "helpers/files";
import { detectPackageManager } from "helpers/packages";
import { platformInterface } from "./templates";
import type * as recast from "recast";
import type { FrameworkConfig, PagesGeneratorContext } from "types";

const { npm } = detectPackageManager();

const generate = async (ctx: PagesGeneratorContext) => {
	await runFrameworkGenerator(ctx, [ctx.project.name]);

	logRaw("");
};

const configure = async (ctx: PagesGeneratorContext) => {
	// Navigate to the directory and install dependencies
	process.chdir(ctx.project.path);
	await npmInstall();

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
	if (usesTypescript()) {
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

const config: FrameworkConfig = {
	generate,
	configure,
	displayName: "Svelte",
	getPackageScripts: async () => ({
		"pages:dev": `wrangler pages dev ${await compatDateFlag()} --proxy 5173 -- ${npm} run dev`,
		"pages:deploy": `${npm} run build && wrangler pages deploy .svelte-kit/cloudflare`,
	}),
};
export default config;
