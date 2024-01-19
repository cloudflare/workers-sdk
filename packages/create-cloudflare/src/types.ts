import type { TemplateConfig } from "./templates";

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
