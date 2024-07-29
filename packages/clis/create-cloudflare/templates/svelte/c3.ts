import { platform } from "node:os";
import { logRaw, updateStatus } from "@cloudflare/cli";
import { blue, brandColor, dim } from "@cloudflare/cli/colors";
import { runFrameworkGenerator } from "frameworks/index";
import { transformFile } from "helpers/codemod";
import { usesTypescript } from "helpers/files";
import { detectPackageManager } from "helpers/packageManagers";
import { installPackages } from "helpers/packages";
import * as recast from "recast";
import type { TemplateConfig } from "../../src/templates";
import type { C3Context, PackageJson } from "types";

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

	updateSvelteConfig();
	updateTypeDefinitions(ctx);
};

const updateSvelteConfig = () => {
	// All we need to do is change the import statement in svelte.config.js
	updateStatus(`Changing adapter in ${blue("svelte.config.js")}`);

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
};

const updateTypeDefinitions = (ctx: C3Context) => {
	if (!usesTypescript(ctx)) {
		return;
	}

	updateStatus(`Updating global type definitions in ${blue("app.d.ts")}`);

	const b = recast.types.builders;

	transformFile("src/app.d.ts", {
		visitTSModuleDeclaration(n) {
			if (n.value.id.name === "App" && n.node.body) {
				const moduleBlock = n.node
					.body as recast.types.namedTypes.TSModuleBlock;

				const platformInterface = b.tsInterfaceDeclaration(
					b.identifier("Platform"),
					b.tsInterfaceBody([
						b.tsPropertySignature(
							b.identifier("env"),
							b.tsTypeAnnotation(b.tsTypeReference(b.identifier("Env"))),
						),
						b.tsPropertySignature(
							b.identifier("cf"),
							b.tsTypeAnnotation(
								b.tsTypeReference(b.identifier("CfProperties")),
							),
						),
						b.tsPropertySignature(
							b.identifier("ctx"),
							b.tsTypeAnnotation(
								b.tsTypeReference(b.identifier("ExecutionContext")),
							),
						),
					]),
				);

				moduleBlock.body.unshift(platformInterface);
			}

			this.traverse(n);
		},
	});
};

const config: TemplateConfig = {
	configVersion: 1,
	id: "svelte",
	displayName: "Svelte",
	platform: "pages",
	copyFiles: {
		variants: {
			js: { path: "./js" },
			ts: { path: "./ts" },
		},
	},
	generate,
	configure,
	transformPackageJson: async (original: PackageJson, ctx: C3Context) => {
		let scripts: Record<string, string> = {
			preview: `${npm} run build && wrangler pages dev`,
			deploy: `${npm} run build && wrangler pages deploy`,
		};

		if (usesTypescript(ctx)) {
			const mv = platform() === "win32" ? "move" : "mv";
			scripts = {
				...scripts,
				"cf-typegen": `wrangler types && ${mv} worker-configuration.d.ts src/`,
			};
		}

		return { scripts };
	},
	devScript: "dev",
	deployScript: "deploy",
	previewScript: "preview",
};
export default config;
