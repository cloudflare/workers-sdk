import { type detectPackageManager } from "helpers/packageManagers";
import type { TemplateConfig } from "./templates";

export type C3Args = {
	projectName: string;
	type?: string;
	deploy?: boolean;
	open?: boolean;
	git?: boolean;
	autoUpdate?: boolean;
	category?: string;
	// frameworks specific
	framework?: string;
	experimental?: boolean;
	// workers specific
	ts?: boolean;
	lang?: string;
	existingScript?: string;
	template?: string;
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
	// Information about the detected package manager.
	packageManager: Readonly<ReturnType<typeof detectPackageManager>>;
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
