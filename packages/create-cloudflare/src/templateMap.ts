import { cp, rename } from "fs/promises";
import { join, resolve } from "path";
import { updateStatus } from "@cloudflare/cli";
import { crash } from "@cloudflare/cli";
import { processArgument } from "helpers/args";
import { C3_DEFAULTS } from "helpers/cli";
import type { C3Args, C3Context } from "types";

type BindingInfo = {
	boundVariable: string;
	description: string;
};

type BindingsDefinition = {
	kvNamespaces: BindingInfo;
	queues: BindingInfo;
};

// A template can have a number of variants, usually js/ts
type VariantInfo = {
	path: string;
};

type StaticFileMap = Record<string, VariantInfo>;

export type TemplateConfig = {
	// How this template is referred to internally and keyed in lookup maps
	id: string;
	// How this template is presented to the user
	displayName: string;
	platform: "workers" | "pages";
	hidden?: boolean;
	languages?: string[];
	bindings?: BindingsDefinition;
	copyFiles?: StaticFileMap;

	generate: (ctx: C3Context) => Promise<void>;
	configure?: (ctx: C3Context) => Promise<void>;
};

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
		chatgptPlugin: await import("../templates/chatgptPlugin/c3.json"),
		openapi: await import("../templates/openapi/c3.json"),
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
		return await selectFramework(args);
	}

	if (type === "remote-template") {
		// TODO
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

	const languageTarget = ctx.args.ts ? "ts" : "js";
	const srcdir = join(
		getTemplatesPath(),
		ctx.template.id,
		ctx.template.copyFiles[languageTarget].path
	);
	const destdir = ctx.project.path;

	// copy template files
	updateStatus(`Copying files from \`${ctx.template.displayName}\` template`);
	await cp(srcdir, destdir, { recursive: true });

	// reverse renaming from build step
	await rename(join(destdir, "__dot__gitignore"), join(destdir, ".gitignore"));
}

export const getTemplatesPath = () => resolve(__dirname, "..", "templates");

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
