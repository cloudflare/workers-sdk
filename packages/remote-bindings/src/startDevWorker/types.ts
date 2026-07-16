import type { EsbuildBundle } from "../utils/use-esbuild";
import type { DevEnv } from "./DevEnv";
import type { ContainerNormalizedConfig } from "@cloudflare/containers-shared";
import type {
	AsyncHook,
	AssetsOptions,
	CfAccount,
	CfModule,
	CfScriptFormat,
	Config,
	NodeJSCompatMode,
	Rule,
	StartDevWorkerInput,
} from "@cloudflare/workers-utils";
import type { WorkerdStructuredLog } from "miniflare";
import type * as undici from "undici";

export interface Worker {
	ready: Promise<void>;
	url: Promise<URL>;
	patchConfig(config: StartDevWorkerOptions): void;
	dispose(): Promise<void>;
	raw: DevEnv;
}

export type StartDevWorkerOptions = Omit<
	StartDevWorkerInput,
	"assets" | "config" | "containers" | "dev"
> & {
	/** The configuration path of the worker */
	config?: string;
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
		persist: string | false;
		auth?: AsyncHook<CfAccount>; // redefine without config.account_id hook param (can only be provided by ConfigController with access to the Wrangler configuration file, not by other controllers eg RemoteRuntimeContoller)
		/** Handles structured runtime logs. */
		structuredLogsHandler?: (log: WorkerdStructuredLog) => void;
		/** An undici MockAgent to declaratively mock fetch calls to particular resources. */
		mockFetch?: undici.MockAgent;
	};
	entrypoint: string;
	assets?: AssetsOptions;
	containers?: ContainerNormalizedConfig[];
	name: string;
	complianceRegion: Config["compliance_region"];
};

export type Bundle = EsbuildBundle;
