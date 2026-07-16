import type {
	AsyncHook,
	CfAccount,
	CfModule,
	CfModuleType,
	Config,
	StartDevWorkerInput,
} from "@cloudflare/workers-utils";

export type StartDevWorkerOptions = {
	name: string;
	entrypoint: string;
	bindings: NonNullable<StartDevWorkerInput["bindings"]>;
	compatibilityDate: StartDevWorkerInput["compatibilityDate"];
	compatibilityFlags: StartDevWorkerInput["compatibilityFlags"];
	complianceRegion: Config["compliance_region"];
	auth: AsyncHook<CfAccount>;
	server: {
		hostname?: string;
		port: number;
		secure: boolean;
	};
};

export type Bundle = {
	path: string;
	entrypointSource: string;
	type: CfModuleType;
	modules: CfModule[];
};
