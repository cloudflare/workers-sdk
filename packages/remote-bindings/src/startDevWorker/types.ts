import type { RemoteBindingsCliDisplayName } from "../utils/remote";
import type {
	AsyncHook,
	CfAccount,
	CfModule,
	CfModuleType,
	StartDevWorkerInput,
} from "@cloudflare/workers-utils";
import type { Config } from "@cloudflare/workers-utils/config";

export type StartDevWorkerOptions = {
	name: string;
	cliDisplayName: RemoteBindingsCliDisplayName;
	entrypointSource: string;
	bindings: NonNullable<StartDevWorkerInput["bindings"]>;
	compatibilityDate: StartDevWorkerInput["compatibilityDate"];
	compatibilityFlags: StartDevWorkerInput["compatibilityFlags"];
	complianceRegion: Config["compliance_region"];
	auth: AsyncHook<CfAccount>;
	/** Establish the remote connection only when a binding request arrives. */
	lazy?: boolean;
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
