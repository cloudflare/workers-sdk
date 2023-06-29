import type { FrameworkMap } from "frameworks/index";
// import { parseArgs } from "./cli";

export type FrameworkName = keyof typeof FrameworkMap;

export type C3Args = {
	projectName: string;
	type: string;
	framework?: string;
	frameworkChoices?: FrameworkName[];
	deploy?: boolean;
	ts?: boolean;
	open?: boolean;
	git?: boolean;
	existingScript?: string;
	wranglerDefaults?: boolean;
};

export type C3Arg = C3Args[keyof C3Args];

export type PagesGeneratorContext = {
	args: C3Args;
	deployedUrl?: string;
	account?: {
		id: string;
		name: string;
	};
	framework?: {
		name: string;
		config: FrameworkConfig;
	};
	project: {
		name: string;
		path: string;
	};
};

export type FrameworkConfig = {
	generate: (ctx: PagesGeneratorContext) => Promise<void>;
	configure?: (ctx: PagesGeneratorContext) => Promise<void>;
	displayName: string;
	packageScripts: Record<string, string>;
	deployCommand?: string;
	devCommand?: string;
	testFlags?: string[];
	compatibilityFlags?: string[];
};
