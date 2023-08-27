import type { DevWorker } from "./types";
import type { Headers } from "miniflare";

// export class ConfigUpdateEvent extends Event implements IConfigUpdateEvent {
// 	constructor(public config: WorkerConfig) {
// 		super("configUpdate");
// 	}
// }
// export class BundleStartEvent extends Event implements IBundleStartEvent {
// 	constructor(public config: WorkerConfig) {
// 		super("bundleStart");
// 	}
// }

// export class BundleCompleteEvent extends Event implements IBundleCompleteEvent {
// 	constructor(public bundle: WorkerBundle, public config: WorkerConfig) {
// 		super("bundleComplete");
// 	}
// }
// export class ReloadStartEvent extends Event implements IReloadStartEvent {
// 	constructor(public config: WorkerConfig) {
// 		super("reloadStart");
// 	}
// }
// export class ReloadCompleteEvent extends Event implements IReloadCompleteEvent {
// 	constructor(
// 		public url: URL,
// 		public headers: Headers | undefined,
// 		public bundle: WorkerBundle,
// 		public config: WorkerConfig
// 	) {
// 		super("reloadComplete");
// 	}
// }
// export class PreviewTokenExpiredEvent
// 	extends Event
// 	implements IPreviewTokenExpiredEvent
// {
// 	constructor(
// 		public url: URL,
// 		public headers: Headers,
// 		public bundle: WorkerBundle,
// 		public config: WorkerConfig
// 	) {
// 		super("previewTokenExpired");
// 	}
// }

export interface TeardownEvent {
	timeStamp: number;
}
export interface ErrorEvent {
	timeStamp: number;
	error: Error;
	source:
		| "ConfigController"
		| "BundlerController"
		| "LocalRuntimeController"
		| "RemoteRuntimeController"
		| "ProxyController";
}

// ConfigController
export interface ConfigUpdateEvent {
	timeStamp: number;
	config: WorkerConfig;
}
// BundlerController
export interface BundleStartEvent extends ConfigUpdateEvent {
	timeStamp: number;
}
export interface BundleCompleteEvent extends BundleStartEvent {
	timeStamp: number;
	bundle: WorkerBundle;
}
// RuntimeController
export interface ReloadStartEvent extends BundleStartEvent {
	timeStamp: number;
}
export interface ReloadCompleteEvent extends BundleCompleteEvent {
	timeStamp: number;
	proxyData: ProxyData;
}
// ProxyController
export interface PreviewTokenExpiredEvent extends ReloadCompleteEvent {
	timeStamp: number;
	headers: Headers;
	// other details of failed request/response
}
export interface ReadyEvent extends ConfigUpdateEvent {
	timeStamp: number;
	worker: DevWorker;
}

export interface WorkerConfig {
	scriptPath: string;
	// ...
}

type WorkerModuleFormat = "modules" | "service-worker";
type WorkerModuleType =
	| "ESModule"
	| "CommonJS"
	| "NodejsCompat"
	| "Text"
	| "Data"
	| "CompiledWasm";

interface WorkerModule {
	name: string;
	contents: Uint8Array;
	type?: WorkerModuleType;
}

interface WorkerBundle {
	format: WorkerModuleFormat;
	modules: WorkerModule[];
	// ...
}

type ProxyData = {
	destinationURL: Partial<URL>;
	destinationInspectorURL: Partial<URL>;
	headers: Record<string, string>;
	liveReloadUrl: boolean;
};
