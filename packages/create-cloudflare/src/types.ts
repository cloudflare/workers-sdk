import type { FrameworkMap } from "frameworks/index";
import { TemplateConfig } from "./templateMap";

export type FrameworkName = keyof typeof FrameworkMap;

export type C3Args = {
	projectName: string;
	type?: string;
	deploy?: boolean;
	open?: boolean;
	git?: boolean;
	autoUpdate?: boolean;
	// pages specific
	framework?: string;
	// workers specific
	ts?: boolean;
	existingScript?: string;
	wranglerDefaults?: boolean;
	additionalArgs?: string[];
};
export type C3Arg = C3Args[keyof C3Args];

export type C3Context = {
	args: C3Args;
	project: {
		name: string;
		path: string;
	};
	// Once refactor is complete, template will be required
	template: TemplateConfig;
	framework?: {
		name: string;
		config: FrameworkConfig;
		args: string[];
		commitMessage?: string;
	};
	deployedUrl?: string;
	account?: {
		id: string;
		name: string;
	};
	originalCWD: string;
	gitRepoAlreadyExisted: boolean;
};

type UpdaterPackageScript = (cmd: string) => string;

export type FrameworkConfig = {
	generate: (ctx: C3Context) => Promise<void>;
	configure?: (ctx: C3Context) => Promise<void>;
	displayName: string;
	getPackageScripts: () => Promise<
		Record<string, string | UpdaterPackageScript>
	>;
	deployCommand?: string[];
	devCommand?: string[];
	testFlags?: string[];
	compatibilityFlags?: string[];
	type?: "pages" | "workers";
};
