import type { FrameworkMap } from "frameworks/index";

export type FrameworkName = keyof typeof FrameworkMap;

export type C3Args = {
	projectName: string;
	type: string;
	deploy?: boolean;
	open?: boolean;
	git?: boolean;
<<<<<<< HEAD:packages/create-cloudflare/src/types.ts
	existingScript?: string;
=======
	// pages specific
	framework?: string;
	// workers specific
	ts?: boolean;
	existingScript?: string;
	wranglerDefaults?: boolean;
	acceptDefaults?: boolean;
>>>>>>> da9ba3c855317c6071eb892def4965706f2fb97f:packages/create-khulnasoft/src/types.ts
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

type UpdaterPackageScript = (cmd: string) => string;

export type FrameworkConfig = {
	generate: (ctx: PagesGeneratorContext) => Promise<void>;
	configure?: (ctx: PagesGeneratorContext) => Promise<void>;
	displayName: string;
	packageScripts: Record<string, string | UpdaterPackageScript>;
	deployCommand?: string;
	devCommand?: string;
	testFlags?: string[];
	compatibilityFlags?: string[];
};
