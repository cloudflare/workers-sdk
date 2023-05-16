import type { FrameworkMap } from "frameworks/index";

export type FrameworkName = keyof typeof FrameworkMap;

export type PagesGeneratorArgs = {
	projectName: string;
	type: string;
	framework?: string;
	frameworkChoices?: FrameworkName[];
	deploy?: boolean;
	ts?: boolean;
};

export type PagesGeneratorContext = {
	args: PagesGeneratorArgs;
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
		relativePath: string;
	};
	existingScript?: string;
};

export type FrameworkConfig = {
	generate: (ctx: PagesGeneratorContext) => Promise<void>;
	configure?: (ctx: PagesGeneratorContext) => Promise<void>;
	displayName: string;
	packageScripts: Record<string, string>;
	deployCommand?: string;
	devCommand?: string;
	testFlags?: string[];
};
