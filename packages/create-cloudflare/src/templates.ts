import { existsSync } from "fs";
import { cp, mkdtemp, rename } from "fs/promises";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { crash } from "@cloudflare/cli";
import { processArgument } from "@cloudflare/cli/args";
import { blue, brandColor, dim } from "@cloudflare/cli/colors";
import { spinner } from "@cloudflare/cli/interactive";
import deepmerge from "deepmerge";
import degit from "degit";
import { C3_DEFAULTS } from "helpers/cli";
import { readJSON, usesTypescript, writeJSON } from "helpers/files";
import { validateTemplateUrl } from "./validators";
import type { C3Args, C3Context } from "types";

export type TemplateConfig = {
	/**
	 * The version of this configuration schema to use. This will be used
	 * to handle config version skew between different versions of c3
	 */
	configVersion: number;
	/** The id by which template is referred to internally and keyed in lookup maps*/
	id: string;
	/** A string that controls how the template is presented to the user in the selection menu*/
	displayName: string;
	/** The deployment platform for this template */
	platform: "workers" | "pages";
	/** When set to true, hides this template from the selection menu */
	hidden?: boolean;
	/** Specifies a set of files that will be copied to the project directory during creation.
	 *
	 * This can be either a single directory:
	 * ```js
	 * {
	 *    copyFiles: { path: './ts' }
	 * }
	 * ```
	 *
	 * Or an object with a file paths for `js` and `ts` versions:
	 * ```js
	 * {
	 *    copyFiles: {
	 *      js: { path: "./js"},
	 *      ts: { path: "./ts"},
	 *    }
	 * }
	 * ```
	 *
	 */
	copyFiles?: StaticFileMap | VariantInfo;

	/** A function invoked as the first step of project creation.
	 * Used to invoke framework creation cli in the internal web framework templates.
	 */
	generate?: (ctx: C3Context) => Promise<void>;
	/** A function invoked after project creation but before deployment.
	 * Used when a template needs to run additional install steps or wrangler commands before
	 * finalizing the project.
	 */
	configure?: (ctx: C3Context) => Promise<void>;

	/** A transformer that is run on the project's `package.json` during the creation step */
	transformPackageJson?: (
		pkgJson: Record<string, string | object>
	) => Promise<Record<string, string | object>>;

	/** An array of flags that will be added to the call to the framework cli during tests.*/
	testFlags?: string[];
	/** An array of compatibility flags to be specified when deploying to pages or workers.*/
	compatibilityFlags?: string[];

	/** The key of the package.json "scripts" entry for deploying the project. Defaults to `pages:deploy` */
	deployScript?: string;
	/** The key of the package.json "scripts" entry for developing the project. Defaults to `pages:dev` */
	devScript?: string;

	/** The file path of the template. This is used internally and isn't a user facing config value.*/
	path?: string;
};

// A template can have a number of variants, usually js/ts
type VariantInfo = {
	path: string;
};

type StaticFileMap = Record<string, VariantInfo>;

export type FrameworkMap = Awaited<ReturnType<typeof getFrameworkMap>>;
export type FrameworkName = keyof FrameworkMap;

export const getFrameworkMap = async () => ({
	angular: (await import("../templates/angular/c3")).default,
	astro: (await import("../templates/astro/c3")).default,
	docusaurus: (await import("../templates/docusaurus/c3")).default,
	gatsby: (await import("../templates/gatsby/c3")).default,
	hono: (await import("../templates/hono/c3")).default,
	next: (await import("../templates/next/c3")).default,
	nuxt: (await import("../templates/nuxt/c3")).default,
	qwik: (await import("../templates/qwik/c3")).default,
	react: (await import("../templates/react/c3")).default,
	remix: (await import("../templates/remix/c3")).default,
	solid: (await import("../templates/solid/c3")).default,
	svelte: (await import("../templates/svelte/c3")).default,
	vue: (await import("../templates/vue/c3")).default,
});

export const getTemplateMap = async () => {
	return {
		"hello-world": (await import("../templates/hello-world/c3")).default,
		"hello-world-durable-object": (
			await import("../templates/hello-world-durable-object/c3")
		).default,
		// Dummy record -- actual template config resolved in `selectFramework`
		webFramework: { displayName: "Website or web app" } as TemplateConfig,
		common: (await import("../templates/common/c3")).default,
		scheduled: (await import("../templates/scheduled/c3")).default,
		queues: (await import("../templates/queues/c3")).default,
		chatgptPlugin: (await import("../templates/chatgptPlugin/c3")).default,
		openapi: (await import("../templates/openapi/c3")).default,
		// Dummy record -- actual template config resolved in `processRemoteTemplate`
		"remote-template": {
			displayName: "Worker built from a template hosted in a git repository",
		} as TemplateConfig,
		"pre-existing": (await import("../templates/pre-existing/c3")).default,
	} as Record<string, TemplateConfig>;
};

export const selectTemplate = async (args: Partial<C3Args>) => {
	// If not specified, attempt to infer the `type` argument from other flags
	if (!args.type) {
		if (args.framework) {
			args.type = "webFramework";
		} else if (args.existingScript) {
			args.type = "pre-existing";
		} else if (args.template) {
			args.type = "remote-template";
		}
	}

	const templateMap = await getTemplateMap();

	const templateOptions = Object.entries(templateMap).map(
		([value, { displayName, hidden }]) => ({
			value,
			label: displayName,
			hidden,
		})
	);

	const type = await processArgument<string>(args, "type", {
		type: "select",
		question: "What type of application do you want to create?",
		label: "type",
		options: templateOptions,
		defaultValue: C3_DEFAULTS.type,
	});

	if (!type) {
		return crash("An application type must be specified to continue.");
	}

	if (!Object.keys(templateMap).includes(type)) {
		return crash(`Unknown application type provided: ${type}.`);
	}

	if (type === "webFramework") {
		return selectFramework(args);
	}

	if (type === "remote-template") {
		return processRemoteTemplate(args);
	}

	return templateMap[type];
};

export const selectFramework = async (args: Partial<C3Args>) => {
	const frameworkMap = await getFrameworkMap();
	const frameworkOptions = Object.entries(frameworkMap).map(
		([key, config]) => ({
			label: config.displayName,
			value: key,
		})
	);

	const framework = await processArgument<string>(args, "framework", {
		type: "select",
		label: "framework",
		question: "Which development framework do you want to use?",
		options: frameworkOptions,
		defaultValue: C3_DEFAULTS.framework,
	});

	if (!framework) {
		crash("A framework must be selected to continue.");
	}

	if (!Object.keys(frameworkMap).includes(framework)) {
		crash(`Unsupported framework: ${framework}`);
	}

	const defaultFrameworkConfig = {
		deployScript: "pages:deploy",
		devScript: "pages:dev",
	};

	return {
		...defaultFrameworkConfig,
		...frameworkMap[framework as FrameworkName],
	};
};

export async function copyTemplateFiles(ctx: C3Context) {
	if (!ctx.template.copyFiles) {
		return;
	}

	const { copyFiles } = ctx.template;

	let srcdir;
	if (copyFiles.path) {
		// If there's only one variant, just use that.
		srcdir = join(getTemplatePath(ctx), (copyFiles as VariantInfo).path);
	} else {
		// Otherwise, have the user select the one they want
		const typescript = await shouldUseTs(ctx);
		const languageTarget = typescript ? "ts" : "js";

		const variantPath = (copyFiles as StaticFileMap)[languageTarget].path;
		srcdir = join(getTemplatePath(ctx), variantPath);
	}

	const destdir = ctx.project.path;

	const s = spinner();
	s.start(`Copying template files`);

	// copy template files
	await cp(srcdir, destdir, { recursive: true, force: true });

	// reverse renaming from build step
	const dummyGitIgnorePath = join(destdir, "__dot__gitignore");
	if (existsSync(dummyGitIgnorePath)) {
		await rename(dummyGitIgnorePath, join(destdir, ".gitignore"));
	}

	s.stop(`${brandColor("files")} ${dim("copied to project directory")}`);
}

const shouldUseTs = async (ctx: C3Context) => {
	// If we can infer from the directory that it uses typescript, use that
	if (usesTypescript(ctx)) {
		return true;
	}

	// Otherwise, prompt the user for their TS preference
	return processArgument<boolean>(ctx.args, "ts", {
		type: "confirm",
		question: "Do you want to use TypeScript?",
		label: "typescript",
		defaultValue: C3_DEFAULTS.ts,
	});
};

export const processRemoteTemplate = async (args: Partial<C3Args>) => {
	const templateUrl = await processArgument<string>(args, "template", {
		type: "text",
		question:
			"What's the url of git repo containing the template you'd like to use?",
		label: "repository",
		validate: (val) => validateTemplateUrl(val || C3_DEFAULTS.template),
		defaultValue: C3_DEFAULTS.template,
	});

	const path = await downloadRemoteTemplate(templateUrl);
	const config = inferTemplateConfig(path);
	validateTemplate(path, config);

	return {
		path,
		...config,
	};
};

const validateTemplate = (path: string, config: TemplateConfig) => {
	if (typeof config.copyFiles?.path == "string") {
		validateTemplateSrcDirectory(resolve(path, config.copyFiles.path), config);
	} else {
		for (const variant of Object.values(config.copyFiles as StaticFileMap)) {
			validateTemplateSrcDirectory(resolve(path, variant.path), config);
		}
	}
};

const validateTemplateSrcDirectory = (path: string, config: TemplateConfig) => {
	if (config.platform === "workers") {
		const wranglerTomlPath = resolve(path, "wrangler.toml");
		if (!existsSync(wranglerTomlPath)) {
			crash(`create-cloudflare templates must contain a "wrangler.toml" file.`);
		}
	}

	const pkgJsonPath = resolve(path, "package.json");
	if (!existsSync(pkgJsonPath)) {
		crash(`create-cloudflare templates must contain a "package.json" file.`);
	}
};

/**
 * Remote templates don't require a config file but may in the future. Until then, this
 * function adapts a remote template to work with c3 by inferring a simple config from
 * its file structure.
 */
const inferTemplateConfig = (path: string): TemplateConfig => {
	return {
		configVersion: 1,
		id: "remote-template",
		displayName: "A remote C3 template",
		platform: "workers",
		copyFiles: inferCopyFilesDefinition(path),
	};
};

const inferCopyFilesDefinition = (path: string) => {
	const copyFiles: StaticFileMap | VariantInfo = {};
	if (existsSync(join(path, "js"))) {
		copyFiles["js"] = { path: "./js" };
	}
	if (existsSync(join(path, "ts"))) {
		copyFiles["ts"] = { path: "./ts" };
	}
	if (Object.keys(copyFiles).length !== 0) {
		return copyFiles;
	}

	return {
		path: ".",
	};
};

/**
 * Downloads an external template from a git repo using `degit`.
 *
 * @param src The url of the git repository to download the template from.
 *            For convenience, `owner/repo` is also accepted.
 * @returns A path to a temporary directory containing the downloaded template
 */
const downloadRemoteTemplate = async (src: string) => {
	const s = spinner();
	try {
		s.start(`Cloning template from: ${blue(src)}`);
		const emitter = degit(src, {
			cache: false,
			verbose: false,
			force: true,
		});

		const tmpDir = await mkdtemp(join(tmpdir(), "c3-template"));
		await emitter.clone(tmpDir);
		s.stop(`${brandColor("template")} ${dim("cloned and validated")}`);

		return tmpDir;
	} catch (error) {
		s.stop(`${brandColor("template")} ${dim("failed")}`);
		return crash(`Failed to clone remote template: ${src}`);
	}
};

export const updatePackageJson = async (ctx: C3Context) => {
	const s = spinner();
	s.start("Updating `package.json`");

	// Update package.json with project name
	const placeholderNames = ["<TBD>", "TBD", ""];
	const pkgJsonPath = resolve(ctx.project.path, "package.json");
	let pkgJson = readJSON(pkgJsonPath);

	if (placeholderNames.includes(pkgJson.name)) {
		pkgJson.name = ctx.project.name;
	}

	// Run any transformers defined by the template
	if (ctx.template.transformPackageJson) {
		const transformed = await ctx.template.transformPackageJson(pkgJson);
		pkgJson = deepmerge(pkgJson, transformed);
	}

	// Write the finalized package.json to disk
	writeJSON(pkgJsonPath, pkgJson);
	s.stop(`${brandColor("updated")} ${dim("`package.json`")}`);
};

export const getTemplatePath = (ctx: C3Context) => {
	if (ctx.template.path) {
		return ctx.template.path;
	}

	return resolve(__dirname, "..", "templates", ctx.template.id);
};
