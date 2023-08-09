import type {
	DnsAnswer as _DnsAnswer,
	DnsResponse as _DnsResponse,
} from "dns2";
import type { FrameworkMap } from "frameworks/index";

export type FrameworkName = keyof typeof FrameworkMap;

export type C3Args = {
	projectName: string;
	type: string;
	deploy?: boolean;
	open?: boolean;
	git?: boolean;
	// pages specific
	framework?: string;
	// workers specific
	ts?: boolean;
	existingScript?: string;
	wranglerDefaults?: boolean;
	acceptDefaults?: boolean;
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

// Augmenting the type from the dns2 library since the types are outdated
export interface DnsAnswer extends _DnsAnswer {
	ns: string;
}

export interface DnsResponse extends _DnsResponse {
	authorities: DnsAnswer[];
}
