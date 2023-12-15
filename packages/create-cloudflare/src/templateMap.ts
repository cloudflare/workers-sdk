import { existsSync } from "fs";
import { cp, rename, mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { crash } from "@cloudflare/cli";
import { blue, brandColor, dim } from "@cloudflare/cli/colors";
import { spinner } from "@cloudflare/cli/interactive";
import degit from "degit";
import { processArgument } from "helpers/args";
import { C3_DEFAULTS } from "helpers/cli";
import { readJSON, usesTypescript } from "helpers/files";
import { isValidTemplateUrl, validateTemplateUrl } from "./validators";
import type { C3Args, C3Context } from "types";

export type TemplateConfig = {
	// How this template is referred to internally and keyed in lookup maps
	id: string;
	// How this template is presented to the user
	displayName: string;
	platform: "workers" | "pages";
	hidden?: boolean;
	languages?: string[];
	bindings?: BindingsDefinition;
	copyFiles?: StaticFileMap | VariantInfo;

	generate: (ctx: C3Context) => Promise<void>;
	configure?: (ctx: C3Context) => Promise<void>;

	path?: string;
};

type BindingsDefinition = {
	kvNamespaces: BindingInfo[];
	queues: QueueBindingInfo[];
	r2Buckets: BindingInfo[];
	d1Databases: D1BindingInfo[];
	secrets: EnvBindingInfo[];
	env: EnvBindingInfo[];
};

export type BindingInfo = {
	boundVariable: string;
	defaultValue: string;
};

export type QueueBindingInfo = BindingInfo & {
	producer: boolean;
	consumer: boolean;
};

export type EnvBindingInfo = {
	boundVariable: string;
	description: string;
};

export type SeedFileConfig = {
	path: string;
};

export type D1BindingInfo = BindingInfo & {
	seedFiles: SeedFileConfig[];
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
		"hello-world": await import("../templates/hello-world/c3.json"),
		// Dummy record
		webFramework: { displayName: "Website or web app" },
		common: await import("../templates/common/c3.json"),
		scheduled: await import("../templates/scheduled/c3.json"),
		queues: await import("../templates/queues/c3.json"),
		kv: await import("../templates/kv/c3.json"),
		r2: await import("../templates/r2/c3.json"),
		d1: await import("../templates/d1/c3.json"),
		"env-secrets": await import("../templates/env-secrets/c3.json"),
		chatgptPlugin: await import("../templates/chatgptPlugin/c3.json"),
		openapi: await import("../templates/openapi/c3.json"),
		"remote-template": { displayName: "From a remote git repository" },
		"pre-existing": await import("../templates/pre-existing/c3.json"),
	} as unknown as Record<string, TemplateConfig>;
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

	framework || crash("A framework must be selected to continue.");
	if (!Object.keys(frameworkMap).includes(framework)) {
		crash(`Unsupported framework: ${framework}`);
	}

	return frameworkMap[framework as FrameworkName];
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
		validate: validateTemplateUrl,
		defaultValue: C3_DEFAULTS.template,
	});

	const path = await downloadRemoteTemplate(templateUrl);
	const configPath = join(path, "c3.json");
	const config = readJSON(configPath);

	return {
		path,
		...config,
	};
};

const downloadRemoteTemplate = async (src: string) => {
	try {
		const s = spinner();
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
		return crash(`Failed to clone remote template: ${src}`);
	}
};

export const getTemplatePath = (ctx: C3Context) => {
	if (ctx.template.path) {
		return ctx.template.path;
	}

	return resolve(__dirname, "..", "templates", ctx.template.id);
};

// const readTemplateConfig = async (templatePath: string) => {
// 	const resolvedTemplatePath = resolve(__dirname, templatePath);
// 	const importPath = probePaths(
// 		[
// 			join(resolvedTemplatePath, "c3.json"),
// 			join(resolvedTemplatePath, "c3.ts"),
// 			join(resolvedTemplatePath, "c3.js"),
// 		],
// 		`Failed to find a c3 template config file at: ${templatePath}.`
// 	);

// 	return await require(importPath);
// };
