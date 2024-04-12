import { existsSync } from "fs";
import { cp, mkdtemp, rename } from "fs/promises";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { crash, warn } from "@cloudflare/cli";
import { processArgument } from "@cloudflare/cli/args";
import { blue, brandColor, dim } from "@cloudflare/cli/colors";
import { spinner } from "@cloudflare/cli/interactive";
import deepmerge from "deepmerge";
import degit from "degit";
import { C3_DEFAULTS } from "helpers/cli";
import {
	appendFile,
	directoryExists,
	readFile,
	readJSON,
	usesTypescript,
	writeFile,
	writeJSON,
} from "helpers/files";
import { validateTemplateUrl } from "./validators";
import type { C3Args, C3Context, PackageJson } from "types";

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
	 * Or an object containing different variants:
	 * ```js
	 * {
	 *    copyFiles: {
	 *      variants: {
	 *        js: { path: "./js"},
	 *        ts: { path: "./ts"},
	 *      }
	 *    }
	 * }
	 * ```
	 * In such case the `js` variant will be used if the project
	 * uses JavaScript and the `ts` variant will be used if the project
	 * uses TypeScript.
	 *
	 * The above mentioned behavior is the default one and can be customized
	 * by providing a `selectVariant` method.
	 *
	 */
	copyFiles?: CopyFiles;

	/** A function invoked as the first step of project creation.
	 * Used to invoke framework creation cli in the internal web framework templates.
	 */
	generate?: (ctx: C3Context) => Promise<void>;
	/** A function invoked after project creation but before deployment.
	 * Used when a template needs to run additional install steps or wrangler commands before
	 * finalizing the project.
	 */
	configure?: (ctx: C3Context) => Promise<void>;

	/**
	 * A transformer that is run on the project's `package.json` during the creation step.
	 *
	 * The object returned from this function will be deep merged with the original.
	 * */
	transformPackageJson?: (
		pkgJson: PackageJson,
		ctx: C3Context
	) => Promise<Record<string, string | object>>;

	/** An array of compatibility flags to be specified when deploying to pages or workers.*/
	compatibilityFlags?: string[];

	/** The key of the package.json "scripts" entry for deploying the project. Defaults to `pages:deploy` */
	deployScript?: string;
	/** The key of the package.json "scripts" entry for developing the project. Defaults to `pages:dev` */
	devScript?: string;
	/** The key of the package.json "scripts" entry for previewing the project. Defaults to undefined (there might not be such script) */
	previewScript?: string;

	/** The file path of the template. This is used internally and isn't a user facing config value.*/
	path?: string;
};

type CopyFiles = (StaticFileMap | VariantInfo) & {
	destinationDir?: string | ((ctx: C3Context) => string);
};

// A template can have a number of variants, usually js/ts
type VariantInfo = {
	path: string;
};

type StaticFileMap = {
	selectVariant?: (ctx: C3Context) => Promise<string>;
	variants: Record<string, VariantInfo>;
};

const defaultSelectVariant = async (ctx: C3Context) => {
	const typescript = await shouldUseTs(ctx);
	return typescript ? "ts" : "js";
};

export type FrameworkMap = Awaited<ReturnType<typeof getFrameworkMap>>;
export type FrameworkName = keyof FrameworkMap;

export const getFrameworkMap = async () => ({
	analog: (await import("../templates/analog/c3")).default,
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
		"hello-world-python": (await import("../templates/hello-world-python/c3"))
			.default,
		"hello-world-durable-object": (
			await import("../templates/hello-world-durable-object/c3")
		).default,
		// Dummy record -- actual template config resolved in `selectFramework`
		"web-framework": { displayName: "Website or web app" } as TemplateConfig,
		common: (await import("../templates/common/c3")).default,
		scheduled: (await import("../templates/scheduled/c3")).default,
		queues: (await import("../templates/queues/c3")).default,
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
			args.type = "web-framework";
		} else if (args.existingScript) {
			args.type = "pre-existing";
		} else if (args.template) {
			args.type = "remote-template";
		}
	}

	// Add backwards compatibility for the older argument (webFramework)
	if (args.type && args.type === "webFramework") {
		warn(
			"The `webFramework` type is deprecated and will be removed in a future version. Please use `web-framework` instead."
		);
		args.type = "web-framework";
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

	if (type === "web-framework") {
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
	if (isVariantInfo(copyFiles)) {
		// If there's only one variant, just use that.
		srcdir = join(getTemplatePath(ctx), copyFiles.path);
	} else {
		// Otherwise, have the user select the one they want
		const selectVariant = copyFiles.selectVariant ?? defaultSelectVariant;

		const variant = await selectVariant(ctx);

		const variantPath = copyFiles.variants[variant].path;
		srcdir = join(getTemplatePath(ctx), variantPath);
	}

	const copyDestDir = await getCopyFilesDestinationDir(ctx);
	const destdir = join(ctx.project.path, ...(copyDestDir ? [copyDestDir] : []));

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

	// If there is a generate process then we assume that a potential typescript
	// setup must have been part of it, so we should not offer it here
	if (ctx.template.generate) {
		return false;
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
	if (!config.copyFiles) {
		return;
	}

	if (isVariantInfo(config.copyFiles)) {
		validateTemplateSrcDirectory(resolve(path, config.copyFiles.path), config);
	} else {
		for (const variant of Object.values(config.copyFiles.variants)) {
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

const inferCopyFilesDefinition = (path: string): CopyFiles => {
	const variants: StaticFileMap["variants"] = {};
	if (existsSync(join(path, "js"))) {
		variants["js"] = { path: "./js" };
	}
	if (existsSync(join(path, "ts"))) {
		variants["ts"] = { path: "./ts" };
	}

	const copyFiles =
		Object.keys(variants).length !== 0 ? { variants } : { path: "." };

	return copyFiles;
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

export const updatePackageName = async (ctx: C3Context) => {
	// Update package.json with project name
	const placeholderNames = ["<TBD>", "TBD", ""];
	const pkgJsonPath = resolve(ctx.project.path, "package.json");
	const pkgJson = readJSON(pkgJsonPath);

	if (!placeholderNames.includes(pkgJson.name)) {
		return;
	}

	const s = spinner();
	s.start("Updating name in `package.json`");

	pkgJson.name = ctx.project.name;

	writeJSON(pkgJsonPath, pkgJson);
	s.stop(`${brandColor("updated")} ${dim("`package.json`")}`);
};

export const updatePackageScripts = async (ctx: C3Context) => {
	if (!ctx.template.transformPackageJson) {
		return;
	}

	const s = spinner();
	s.start("Updating `package.json` scripts");

	const pkgJsonPath = resolve(ctx.project.path, "package.json");
	let pkgJson = readJSON(pkgJsonPath);

	// Run any transformers defined by the template
	const transformed = await ctx.template.transformPackageJson(pkgJson, ctx);
	pkgJson = deepmerge(pkgJson, transformed);

	writeJSON(pkgJsonPath, pkgJson);
	s.stop(`${brandColor("updated")} ${dim("`package.json`")}`);
};

export const getTemplatePath = (ctx: C3Context) => {
	if (ctx.template.path) {
		return ctx.template.path;
	}

	return resolve(__dirname, "..", "templates", ctx.template.id);
};

export const isVariantInfo = (
	copyFiles: CopyFiles
): copyFiles is VariantInfo => {
	return "path" in (copyFiles as VariantInfo);
};

export const getCopyFilesDestinationDir = (
	ctx: C3Context
): undefined | string => {
	const { copyFiles } = ctx.template;

	if (!copyFiles?.destinationDir) {
		return undefined;
	}

	if (typeof copyFiles.destinationDir === "string") {
		return copyFiles.destinationDir;
	}

	return copyFiles.destinationDir(ctx);
};

export const addWranglerToGitIgnore = (ctx: C3Context) => {
	const gitIgnorePath = `${ctx.project.path}/.gitignore`;
	const gitIgnorePreExisted = existsSync(gitIgnorePath);

	const gitDirExists = directoryExists(`${ctx.project.path}/.git`);

	if (!gitIgnorePreExisted && !gitDirExists) {
		// if there is no .gitignore file and neither a .git directory
		// then bail as the project is likely not targeting/using git
		return;
	}

	if (!gitIgnorePreExisted) {
		writeFile(gitIgnorePath, "");
	}

	const existingGitIgnoreContent = readFile(gitIgnorePath);

	const wranglerGitIgnoreFiles = [".wrangler", ".dev.vars"] as const;
	const wranglerGitIgnoreFilesToAdd = wranglerGitIgnoreFiles.filter(
		(file) =>
			!existingGitIgnoreContent.match(
				new RegExp(`\n${file}${file === ".wrangler" ? "/?" : ""}\\s+(#'*)?`)
			)
	);

	if (wranglerGitIgnoreFilesToAdd.length === 0) {
		return;
	}

	const s = spinner();
	s.start("Adding Wrangler files to the .gitignore file");

	const linesToAppend = [
		"",
		...(!existingGitIgnoreContent.match(/\n\s*$/) ? [""] : []),
	];

	if (wranglerGitIgnoreFilesToAdd.length === wranglerGitIgnoreFiles.length) {
		linesToAppend.push("# wrangler files");
	}

	wranglerGitIgnoreFilesToAdd.forEach((line) => linesToAppend.push(line));

	linesToAppend.push("");

	appendFile(gitIgnorePath, linesToAppend.join("\n"));

	s.stop(
		`${brandColor(gitIgnorePreExisted ? "updated" : "created")} ${dim(
			".gitignore file"
		)}`
	);
};
