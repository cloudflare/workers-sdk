import type { AssetsOptions } from "../../assets";
import type { EsbuildBundle } from "../../dev/use-esbuild";
import type { ConfigController } from "./ConfigController";
import type { DevEnv } from "./DevEnv";
import type { ContainerNormalizedConfig } from "@cloudflare/containers-shared";
import type {
	AsyncHook,
	BinaryFile,
	Binding,
	CfAccount,
	CfModule,
	CfScriptFormat,
	Config,
	File,
	HookValues,
	Rule,
	ServiceFetch,
	StartDevWorkerInput,
	Trigger,
} from "@cloudflare/workers-utils";
import type { DispatchFetch, Miniflare, NodeJSCompatMode } from "miniflare";

type MiniflareWorker = Awaited<ReturnType<Miniflare["getWorker"]>>;
export interface Worker {
	ready: Promise<void>;
	url: Promise<URL>;
	inspectorUrl: Promise<URL | undefined>;
	config: StartDevWorkerOptions;
	setConfig: ConfigController["set"];
	patchConfig: ConfigController["patch"];
	fetch: DispatchFetch;
	scheduled: MiniflareWorker["scheduled"];
	queue: MiniflareWorker["queue"];
	dispose(): Promise<void>;
	raw: DevEnv;
}

export type StartDevWorkerOptions = Omit<
	StartDevWorkerInput,
	"assets" | "containers"
> & {
	/** A worker's directory. Usually where the Wrangler configuration file is located */
	projectRoot: string;
	build: StartDevWorkerInput["build"] & {
		nodejsCompatMode: NodeJSCompatMode;
		format: CfScriptFormat;
		moduleRoot: string;
		moduleRules: Rule[];
		define: Record<string, string>;
		additionalModules: CfModule[];
		exports: string[];

		processEntrypoint: boolean;
	};
	legacy: StartDevWorkerInput["legacy"] & {
		site?: Config["site"];
	};
	dev: StartDevWorkerInput["dev"] & {
		persist: string;
		auth?: AsyncHook<CfAccount>; // redefine without config.account_id hook param (can only be provided by ConfigController with access to the Wrangler configuration file, not by other controllers eg RemoteRuntimeContoller)
	};
	entrypoint: string;
	assets?: AssetsOptions;
	containers?: ContainerNormalizedConfig[];
	name: string;
	complianceRegion: Config["compliance_region"];
};

export type Bundle = EsbuildBundle;

// Re-export types from @cloudflare/workers-utils so downstream imports from "./types" still work
export type {
	StartDevWorkerInput,
	HookValues,
	Hook,
	AsyncHook,
	LogLevel,
	Trigger,
	Binding,
	File,
	BinaryFile,
	ServiceFetch,
	CfAccount,
} from "@cloudflare/workers-utils";
