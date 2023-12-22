import type { TemplateConfig } from "./templateMap";

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
	template?: string;
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
	template: TemplateConfig;
	framework?: {
		config: FrameworkConfig;
		args: string[];
		commitMessage?: string;
	};
	deployment: DeploymentInfo;
	account?: {
		id: string;
		name: string;
	};
	originalCWD: string;
	gitRepoAlreadyExisted: boolean;
};

type DeploymentInfo = {
	url?: string;
	queues: Record<string, string>;
	kvNamespaces: Record<string, string>;
};

export type FrameworkConfig = TemplateConfig & {
	generate: (ctx: C3Context) => Promise<void>;
	configure?: (ctx: C3Context) => Promise<void>;
	deployCommand?: string[];
	devCommand?: string[];
	testFlags?: string[];
	compatibilityFlags?: string[];
	type?: "pages" | "workers";
};
