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
	path: string;
	// How this template is referred to internally and keyed in lookup maps
	id: string;
	// How this template is presented to the user
	displayName: string;
	platform: "workers" | "pages";
	languages: string[];
	bindings?: BindingsDefinition;
	copyFiles?: StaticFileMap;

	// generate: (ctx: C3Context) => Promise<void>;
	// configure?: (ctx: C3Context) => void;
	// finalize?: (ctx: C3Context) => void;
	// preDeploy?: (ctx: C3Context) => void;
	// deploy?: (ctx: C3Context) => void;
	// summary?: (ctx: C3Context) => void;
};

type OldTemplateConfig = {
	label: string;
	hidden?: boolean;
	templateConfig?: TemplateConfig;
};

const newTemplateMap = {
	"hello-world": "../templates/hello-world",
	webFramework: "TDB",
	common: "../templates/common",
	scheduled: "../templates/scheduled",
	queues: "../templates/queues",
	chatgptPlugin: "../templates/chatgptPlugin",
	openapi: "../templates/openapi",
	"pre-existing": "../templates/pre-existing",
};

// TODO: this should all be derived from template config
// The built-in templates should be pre-cached into an equivalent tempalteMap
// export const templateMap: Record<string, OldTemplateConfig> = {
export const getTemplateMap = async () => {
	return {
		"hello-world": {
			label: `"Hello World" Worker`,
			templateConfig: await import("../templates/hello-world/c3.json"),
		},
		webFramework: {
			label: "Website or web app",
		},
		common: {
			label: "Example router & proxy Worker",
			templateConfig: await import("../templates/common/c3.json"),
		},
		scheduled: {
			label: "Scheduled Worker (Cron Trigger)",
			templateConfig: await import("../templates/scheduled/c3.json"),
		},
		queues: {
			label: "Queue consumer & producer Worker",
			templateConfig: await import("../templates/queues/c3.json"),
		},
		chatgptPlugin: {
			label: `ChatGPT plugin`,
			templateConfig: await import("../templates/chatgptPlugin/c3.json"),
		},
		openapi: {
			label: `OpenAPI 3.1`,
			templateConfig: await import("../templates/openapi/c3.json"),
		},
		"pre-existing": {
			label: "Pre-existing Worker (from Dashboard)",
			hidden: true,
			templateConfig: await import("../templates/pre-existing/c3.json"),
		},
	} as unknown as Record<string, OldTemplateConfig>;
};

export const getTemplateSelection = async (args: Partial<C3Args>) => {
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
		([value, { label, hidden }]) => ({ value, label, hidden })
	);

	const type = await processArgument<string>(args, "type", {
		type: "select",
		question: "What type of application do you want to create?",
		label: "type",
		options: templateOptions,
		defaultValue: C3_DEFAULTS.type,
	});

	// Depending on type, maybe descend into another layer of menus (pages)

	if (!type) {
		return crash("An application type must be specified to continue.");
	}

	if (!Object.keys(templateMap).includes(type)) {
		return crash(`Unknown application type provided: ${type}.`);
	}

	if (type !== "remote-template") {
		const templatePath = newTemplateMap[type as keyof typeof newTemplateMap];
		const importPath = join(templatePath, "c3.json");
		const config = await require(importPath);
		return {
			path: templatePath,
			...config,
		} as TemplateConfig;
	}

	// if type is remoteTemplate, we should download it and read + validate the config here
	// return getTemplateConfig(type);
	// HACK for now
	return {} as TemplateConfig;
};

export async function copyTemplateFiles(ctx: C3Context) {
	if (!ctx.template.copyFiles) {
		return;
	}

	const languageTarget = ctx.args.ts ? "ts" : "js";
	const srcdir = resolve(
		__dirname,
		ctx.template.path,
		ctx.template.copyFiles[languageTarget].path
	);
	const destdir = ctx.project.path;

	// copy template files
	updateStatus(`Copying files from \`${ctx.template.displayName}\` template`);
	await cp(srcdir, destdir, { recursive: true });

	// reverse renaming from build step
	await rename(join(destdir, "__dot__gitignore"), join(destdir, ".gitignore"));
}

// Needs to be repurposed to read config files of remote templates
// function getTemplateConfig(templateId: string) {
// 	const path = resolve(
// 		// eslint-disable-next-line no-restricted-globals
// 		__dirname,
// 		"..",
// 		"templates",
// 		templateId,
// 		"c3.json"
// 	);
// 	return readJSON(path);
// }
