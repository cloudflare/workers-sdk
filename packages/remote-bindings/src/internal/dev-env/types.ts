import type { DevEnv } from "./DevEnv";
import type {
	AsyncHook,
	AssetsOptions,
	BinaryFile,
	Binding,
	CfAccount,
	CfModule,
	CfModuleType,
	CfScriptFormat,
	Config,
	Entry,
	File,
	Hook,
	HookValues,
	LogLevel,
	NodeJSCompatMode,
	Rule,
	ServiceFetch,
	StartDevWorkerInput,
	Trigger,
} from "@cloudflare/workers-utils";
import type { DispatchFetch, Miniflare, WorkerdStructuredLog } from "miniflare";
import type * as undici from "undici";

type MiniflareWorker = Awaited<ReturnType<Miniflare["getWorker"]>>;

type ContainerDevConfig = { class_name: string } & (
	| { image_uri: string }
	| {
			dockerfile: string;
			image_build_context: string;
			image_vars?: Record<string, string>;
	  }
);

/**
 * Extended StartDevWorkerInput with wrangler-specific fields that depend on miniflare types.
 * The base StartDevWorkerInput in workers-utils is kept dependency-free.
 */
export type WranglerStartDevWorkerInput = Omit<StartDevWorkerInput, "dev"> & {
	dev?: StartDevWorkerInput["dev"] & {
		/** Handles structured runtime logs. */
		structuredLogsHandler?: (log: WorkerdStructuredLog) => void;
		/** An undici MockAgent to declaratively mock fetch calls to particular resources. */
		mockFetch?: undici.MockAgent;
	};
};

export interface Worker {
	ready: Promise<void>;
	url: Promise<URL>;
	inspectorUrl: Promise<URL | undefined>;
	config: StartDevWorkerOptions;
	setConfig(
		input: StartDevWorkerInput,
		throwErrors?: boolean
	): Promise<StartDevWorkerOptions | undefined>;
	patchConfig(
		input: Partial<StartDevWorkerInput>
	): Promise<StartDevWorkerOptions | undefined>;
	fetch: DispatchFetch;
	scheduled: MiniflareWorker["scheduled"];
	queue: MiniflareWorker["queue"];
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
	containers?: ContainerDevConfig[];
	name: string;
	complianceRegion: Config["compliance_region"];
};

export interface SourceMapMetadata {
	tmpDir: string;
	entryDirectory: string;
}

export type Bundle = {
	id: number;
	path: string;
	entrypointSource: string;
	entry: Entry;
	type: CfModuleType;
	modules: CfModule[];
	dependencies: Record<string, { bytesInOutput: number }>;
	sourceMapPath: string | undefined;
	sourceMapMetadata: SourceMapMetadata | undefined;
};

export type {
	StartDevWorkerInput,
	Trigger,
	Binding,
	File,
	BinaryFile,
	ServiceFetch,
	HookValues,
	Hook,
	AsyncHook,
	LogLevel,
};
