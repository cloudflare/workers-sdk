import type { TemplateConfig } from "./templates";

export type C3Args = {
	projectName: string;
	type?: string;
	deploy?: boolean;
	open?: boolean;
	git?: boolean;
	agents?: boolean;
	autoUpdate?: boolean;
	category?: string;
	// frameworks specific
	framework?: string;
	experimental?: boolean;
	platform?: "pages" | "workers";
	variant?: string;
	// workers specific
	ts?: boolean;
	lang?: string;
	existingScript?: string;
	template?: string;
	templateMode?: "tar" | "git";
	acceptDefaults?: boolean;
	wranglerDefaults?: boolean;
	additionalArgs?: string[];
	help?: boolean;
};
export type C3Arg = C3Args[keyof C3Args];

export type C3Context = {
	args: C3Args;
	project: {
		name: string;
		path: string;
	};
	template: TemplateConfig;
	deployment: DeploymentInfo;
	account?: {
		id: string;
		name: string;
	};
	commitMessage?: string;
	originalCWD: string;
	gitRepoAlreadyExisted: boolean;
};

type DeploymentInfo = {
	url?: string;
};

export type PackageJson = Record<string, string> & {
	name: string;
	version: string;
	scripts?: Record<string, string>;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
};
