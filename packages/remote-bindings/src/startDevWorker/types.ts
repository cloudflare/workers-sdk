import type { DevEnv } from "./DevEnv";
import type {
	AsyncHook,
	CfAccount,
	CfModule,
	CfModuleType,
	Config,
	StartDevWorkerInput,
} from "@cloudflare/workers-utils";

export interface Worker {
	ready: Promise<void>;
	url: Promise<URL>;
	patchConfig(config: StartDevWorkerOptions): void;
	dispose(): Promise<void>;
	raw: DevEnv;
}

export type StartDevWorkerOptions = {
	name: string;
	entrypoint: string;
	bindings: NonNullable<StartDevWorkerInput["bindings"]>;
	compatibilityDate: StartDevWorkerInput["compatibilityDate"];
	compatibilityFlags: StartDevWorkerInput["compatibilityFlags"];
	complianceRegion: Config["compliance_region"];
	dev: {
		remote: "minimal";
		auth?: AsyncHook<CfAccount>;
		server: {
			hostname?: string;
			port: number;
			secure: boolean;
		};
	};
};

export type Bundle = {
	path: string;
	entrypointSource: string;
	type: CfModuleType;
	modules: CfModule[];
};
