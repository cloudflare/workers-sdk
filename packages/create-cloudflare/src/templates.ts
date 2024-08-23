import { existsSync } from "fs";
import { cp, mkdtemp, rename } from "fs/promises";
import { tmpdir } from "os";
import { basename, dirname, join, resolve } from "path";
import { crash, shapes, updateStatus, warn } from "@cloudflare/cli";
import { processArgument } from "@cloudflare/cli/args";
import { blue, brandColor, dim } from "@cloudflare/cli/colors";
import { spinner } from "@cloudflare/cli/interactive";
import deepmerge from "deepmerge";
import degit from "degit";
import { C3_DEFAULTS } from "helpers/cli";
import {
	appendFile,
	directoryExists,
	hasTsConfig,
	readFile,
	readJSON,
	writeFile,
	writeJSON,
} from "helpers/files";
import { isInsideGitRepo } from "./git";
import { validateProjectDirectory, validateTemplateUrl } from "./validators";
import type { Option } from "@cloudflare/cli/interactive";
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
	/** A string that explains what is inside the template, including any resources and how those will be used*/
	description?: string;
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
		ctx: C3Context,
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
	return ctx.args.lang;
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
		common: (await import("../templates/common/c3")).default,
		scheduled: (await import("../templates/scheduled/c3")).default,
		queues: (await import("../templates/queues/c3")).default,
		"hello-world-durable-object": (
			await import("../templates/hello-world-durable-object/c3")
		).default,
		openapi: (await import("../templates/openapi/c3")).default,
		"pre-existing": (await import("../templates/pre-existing/c3")).default,
	} as Record<string, TemplateConfig>;
};

export const deriveCorrelatedArgs = (args: Partial<C3Args>) => {
	// Derive the type based on the additional arguments provided
	// Both `web-framework` and `remote-template` types are no longer used
	// They are set only for backwards compatibility
	if (args.framework) {
		args.type ??= "web-framework";
	} else if (args.template) {
		args.type ??= "remote-template";
	} else if (args.existingScript) {
		args.type ??= "pre-existing";
	}

	// Derive the category based on the type
	switch (args.type) {
		case "hello-world":
		case "hello-world-durable-object":
			args.category ??= "hello-world";
			break;
		case "hello-world-python":
			args.category ??= "hello-world";
			// The hello-world-python template is merged into the `hello-world` template
			args.type = "hello-world";
			args.lang = "python";
			break;
		case "webFramework":
			// Add backwards compatibility for the older argument (webFramework)
			warn(
				"The `webFramework` type is deprecated and will be removed in a future version. Please use `web-framework` instead.",
			);
			args.category ??= "web-framework";
			args.type = "web-framework";
			break;
		case "web-framework":
		case "remote-template":
			args.category ??= args.type;
			break;
		case "common":
		case "scheduled":
		case "queues":
		case "openapi":
			args.category ??= "demo";
			break;
		case "pre-existing":
			args.category ??= "others";
			break;
	}

	if (args.ts !== undefined) {
		const language = args.ts ? "ts" : "js";

		if (args.lang !== undefined) {
			crash(
				"The `--ts` argument cannot be specified in conjunction with the `--lang` argument",
			);
		}

		args.lang = language;
	}
};

/**
 * Collecting all information about the template here
 * This includes the project name, the type fo template and the language to use (if applicable)
 * There should be no side effects in these prompts so that we can always go back to the previous step
 */
export const createContext = async (
	args: Partial<C3Args>,
	prevArgs?: Partial<C3Args>,
): Promise<C3Context> => {
	// Allows the users to go back to the previous step
	// By moving the cursor up to a certain line and clearing the screen
	const goBack = async (from: "type" | "framework" | "lang") => {
		const newArgs = { ...args };
		let linesPrinted = 0;

		switch (from) {
			case "type":
				linesPrinted = 9;
				newArgs.category = undefined;
				break;
			case "framework":
				linesPrinted = 9;
				newArgs.category = undefined;
				break;
			case "lang":
				linesPrinted = 12;
				newArgs.type = undefined;
				break;
		}

		newArgs[from] = undefined;
		args[from] = undefined;

		if (process.stdout.isTTY) {
			process.stdout.moveCursor(0, -linesPrinted);
			process.stdout.clearScreenDown();
		}

		return await createContext(newArgs, args);
	};

	// The option to go back to the previous step
	const BACK_VALUE = "__BACK__";
	const backOption: Option = {
		label: "Go back",
		value: BACK_VALUE,
		activeIcon: shapes.backActive,
		inactiveIcon: shapes.backInactive,
	};

	const defaultName = args.existingScript || C3_DEFAULTS.projectName;
	const projectName = await processArgument<string>(args, "projectName", {
		type: "text",
		question: `In which directory do you want to create your application?`,
		helpText: "also used as application name",
		defaultValue: defaultName,
		label: "dir",
		validate: (value) =>
			validateProjectDirectory(String(value) || C3_DEFAULTS.projectName, args),
		format: (val) => `./${val}`,
	});

	const categoryOptions = [
		{
			label: "Hello World example",
			value: "hello-world",
			description: "Select from barebones examples to get started with Workers",
		},
		{
			label: "Framework Starter",
			value: "web-framework",
			description: "Select from the most popular full-stack web frameworks",
		},
		{
			label: "Application Starter",
			value: "demo",
			description:
				"Select from a range of starter applications using various Cloudflare products",
		},
		{
			label: "Template from a Github repo",
			value: "remote-template",
			description: "Start from an existing GitHub repo link",
		},
		// This is used only if the type is `pre-existing`
		{ label: "Others", value: "others", hidden: true },
	];

	const category = await processArgument<string>(args, "category", {
		type: "select",
		question: "What would you like to start with?",
		label: "category",
		options: categoryOptions,
		defaultValue: prevArgs?.category ?? C3_DEFAULTS.category,
	});

	let template: TemplateConfig;

	if (category === "web-framework") {
		const frameworkMap = await getFrameworkMap();
		const frameworkOptions = Object.entries(frameworkMap).map(
			([key, config]) => ({
				label: config.displayName,
				value: key,
			}),
		);

		const framework = await processArgument<FrameworkName | typeof BACK_VALUE>(
			args,
			"framework",
			{
				type: "select",
				label: "framework",
				question: "Which development framework do you want to use?",
				options: frameworkOptions.concat(backOption),
				defaultValue: prevArgs?.framework ?? C3_DEFAULTS.framework,
			},
		);

		if (framework === BACK_VALUE) {
			return goBack("framework");
		}

		const frameworkConfig = frameworkMap[framework];

		if (!frameworkConfig) {
			crash(`Unsupported framework: ${framework}`);
		}

		template = {
			deployScript: "pages:deploy",
			devScript: "pages:dev",
			...frameworkConfig,
		};
	} else if (category === "remote-template") {
		template = await processRemoteTemplate(args);
	} else {
		const templateMap = await getTemplateMap();
		const templateOptions: Option[] = Object.entries(templateMap).map(
			([value, { displayName, description, hidden }]) => {
				const isHelloWorldExample = value.startsWith("hello-world");
				const isCategoryMatched =
					category === "hello-world"
						? isHelloWorldExample
						: !isHelloWorldExample;

				return {
					value,
					label: displayName,
					description,
					hidden: hidden || !isCategoryMatched,
				};
			},
		);

		const type = await processArgument<string>(args, "type", {
			type: "select",
			question: "Which template would you like to use?",
			label: "type",
			options: templateOptions.concat(backOption),
			defaultValue: prevArgs?.type ?? C3_DEFAULTS.type,
		});

		if (type === BACK_VALUE) {
			return goBack("type");
		}

		template = templateMap[type];

		if (!template) {
			return crash(`Unknown application type provided: ${type}.`);
		}
	}

	const path = resolve(projectName);
	const languageVariants =
		template.copyFiles &&
		!isVariantInfo(template.copyFiles) &&
		!template.copyFiles.selectVariant
			? Object.keys(template.copyFiles.variants)
			: [];

	// Prompt for language preference only if selectVariant is not defined
	// If it is defined, copyTemplateFiles will handle the selection
	if (languageVariants.length > 0) {
		if (hasTsConfig(path)) {
			// If we can infer from the directory that it uses typescript, use that
			args.lang = "ts";
		} else if (template.generate) {
			// If there is a generate process then we assume that a potential typescript
			// setup must have been part of it, so we should not offer it here
			args.lang = "js";
		} else {
			// Otherwise, prompt the user for their language preference
			const languageOptions = [
				{ label: "TypeScript", value: "ts" },
				{ label: "JavaScript", value: "js" },
				{ label: "Python (beta)", value: "python" },
			];

			const lang = await processArgument<string>(args, "lang", {
				type: "select",
				question: "Which language do you want to use?",
				label: "lang",
				options: languageOptions
					.filter((option) => languageVariants.includes(option.value))
					// Allow going back only if the user is not selecting a remote template
					.concat(args.template ? [] : backOption),
				defaultValue: C3_DEFAULTS.lang,
			});

			if (lang === BACK_VALUE) {
				return goBack("lang");
			}
		}
	}

	const name = basename(path);
	const directory = dirname(path);
	const originalCWD = process.cwd();

	return {
		project: { name, path },
		args: {
			...args,
			projectName,
		},
		template,
		originalCWD,
		gitRepoAlreadyExisted: await isInsideGitRepo(directory),
		deployment: {},
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

		const variantInfo = variant ? copyFiles.variants[variant] : null;

		if (!variantInfo) {
			crash(`Unknown variant provided: ${JSON.stringify(variant ?? "")}`);
		}

		srcdir = join(getTemplatePath(ctx), variantInfo.path);
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

export const processRemoteTemplate = async (args: Partial<C3Args>) => {
	const templateUrl = await processArgument<string>(args, "template", {
		type: "text",
		question:
			"What's the url of git repo containing the template you'd like to use?",
		label: "repository",
		validate: (val) => validateTemplateUrl(val || C3_DEFAULTS.template),
		defaultValue: C3_DEFAULTS.template,
	});

	let src = templateUrl;

	// GitHub URL with subdirectory is not supported by degit and has to be transformed.
	// This only addresses input template URLs on the main branch as a branch name
	// might includes slashes that span multiple segments in the URL and cannot be
	// reliably differentiated from the subdirectory path.
	if (src.startsWith("https://github.com/") && src.includes("/tree/main/")) {
		src = src
			.replace("https://github.com/", "github:")
			.replace("/tree/main/", "/");
	}

	const path = await downloadRemoteTemplate(src);
	const config = inferTemplateConfig(path);

	validateTemplate(path, config);
	updateStatus(`${brandColor("template")} ${dim("cloned and validated")}`);

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
export const downloadRemoteTemplate = async (src: string) => {
	// degit runs `git clone` internally which may prompt for credentials if required
	// Avoid using a `spinner()` during this operation -- use updateStatus instead.

	try {
		updateStatus(`Cloning template from: ${blue(src)}`);

		const emitter = degit(src, {
			cache: false,
			verbose: false,
			force: true,
		});

		const tmpDir = await mkdtemp(join(tmpdir(), "c3-template"));
		await emitter.clone(tmpDir);

		return tmpDir;
	} catch (error) {
		updateStatus(`${brandColor("template")} ${dim("failed")}`);
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
	copyFiles: CopyFiles,
): copyFiles is VariantInfo => {
	return "path" in (copyFiles as VariantInfo);
};

export const getCopyFilesDestinationDir = (
	ctx: C3Context,
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
				new RegExp(`\n${file}${file === ".wrangler" ? "/?" : ""}\\s+(#'*)?`),
			),
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
			".gitignore file",
		)}`,
	);
};
