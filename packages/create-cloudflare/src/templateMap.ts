import { processArgument } from "helpers/args";
import { cp, rename } from "fs/promises";
import { join, resolve } from "path";
import { updateStatus } from "@cloudflare/cli";
import { runPagesGenerator } from "./pages";
import { runWorkersGenerator } from "./workers";
import type { C3Args, C3Context } from "types";
import { C3_DEFAULTS } from "helpers/cli";
import { crash } from "@cloudflare/cli";
import { readJSON } from "helpers/files";

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
	handler: (ctx: C3Context) => Promise<void>;
	hidden?: boolean;
};

// TODO: this should all be derived from template config
// The built-in templates should be pre-cached into an equivalent tempalteMap
export const templateMap: Record<string, OldTemplateConfig> = {
	"hello-world": {
		label: `"Hello World" Worker`,
		handler: runWorkersGenerator,
	},
	"hello-world-durable-object": {
		label: `"Hello World" Durable Object`,
		handler: runWorkersGenerator,
	},
	webFramework: {
		label: "Website or web app",
		handler: runPagesGenerator,
	},
	common: {
		label: "Example router & proxy Worker",
		handler: runWorkersGenerator,
	},
	scheduled: {
		label: "Scheduled Worker (Cron Trigger)",
		handler: (args) => runWorkersGenerator({ ...args, deploy: false }),
	},
	queues: {
		label: "Queue consumer & producer Worker",
		handler: (args) => runWorkersGenerator({ ...args, deploy: false }),
	},
	chatgptPlugin: {
		label: `ChatGPT plugin`,
		handler: (ctx) => {
			ctx.args.ts = true;
			return runWorkersGenerator(ctx);
		},
	},
	openapi: {
		label: `OpenAPI 3.1`,
		handler: (ctx) => {
			ctx.args.ts = true;
			return runWorkersGenerator(ctx);
		},
	},
	"pre-existing": {
		label: "Pre-existing Worker (from Dashboard)",
		handler: runWorkersGenerator,
		hidden: true,
	},
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

	return getTemplateConfig(type);
};

export async function copyTemplateFiles(ctx: C3Context) {
	const srcdir = await staticTemplateFilesPath(ctx);
	const destdir = ctx.project.path;

	// copy template files
	updateStatus(`Copying files from \`${ctx.template.displayName}\` template`);
	await cp(srcdir, destdir, { recursive: true });

	// reverse renaming from build step
	await rename(join(destdir, "__dot__gitignore"), join(destdir, ".gitignore"));
}

function getTemplateConfig(templateId: string) {
	const path = resolve(
		// eslint-disable-next-line no-restricted-globals
		__dirname,
		"..",
		"templates",
		templateId,
		"c3.json"
	);
	return readJSON(path);
}

async function staticTemplateFilesPath(ctx: C3Context) {
	const preexisting = ctx.args.type === "pre-existing";
	const template = preexisting ? "hello-world" : ctx.args.type;
	return resolve(
		// eslint-disable-next-line no-restricted-globals
		__dirname,
		"..",
		"templates",
		ctx.template!.id, // TODO: don't coerce this
		ctx.args.ts ? "ts" : "js"
	);
}
