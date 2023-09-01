import type { Config, DevWorker } from "./types";

// export class ConfigUpdateEvent extends Event implements IConfigUpdateEvent {
// 	constructor(public config: Config) {
// 		super("configUpdate");
// 	}
// }
// export class BundleStartEvent extends Event implements IBundleStartEvent {
// 	constructor(public config: Config) {
// 		super("bundleStart");
// 	}
// }

// export class BundleCompleteEvent extends Event implements IBundleCompleteEvent {
// 	constructor(public bundle: WorkerBundle, public config: Config) {
// 		super("bundleComplete");
// 	}
// }
// export class ReloadStartEvent extends Event implements IReloadStartEvent {
// 	constructor(public config: Config) {
// 		super("reloadStart");
// 	}
// }
// export class ReloadCompleteEvent extends Event implements IReloadCompleteEvent {
// 	constructor(
// 		public url: URL,
// 		public headers: Headers | undefined,
// 		public bundle: WorkerBundle,
// 		public config: Config
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
// 		public config: Config
// 	) {
// 		super("previewTokenExpired");
// 	}
// }

export type TeardownEvent = {
	type: "teardown";
};
export type ErrorEvent = {
	type: "error";
	reason: string;
	cause: Error;
	source:
		| "ConfigController"
		| "BundlerController"
		| "LocalRuntimeController"
		| "RemoteRuntimeController"
		| "ProxyController"
		| "ProxyWorker"
		| "InspectorProxyWorker";
};
export function castErrorCause(cause: unknown) {
	if (cause instanceof Error) return cause;

	const error = new Error();
	error.cause = cause;

	return error;
}

// ConfigController
export type ConfigUpdateEvent = {
	type: "configUpdate";

	config: Config;
};

// BundlerController
export type BundleStartEvent = {
	type: "bundleStart";

	config: Config;
};
export type BundleCompleteEvent = {
	type: "bundleComplete";

	config: Config;
	bundle: WorkerBundle;
};

// RuntimeController
export type ReloadStartEvent = {
	type: "reloadStart";

	config: Config;
	bundle: WorkerBundle;
};
export type ReloadCompleteEvent = {
	type: "reloadComplete";

	config: Config;
	bundle: WorkerBundle;
	proxyData: ProxyData;
};

// ProxyController
export type PreviewTokenExpiredEvent = {
	type: "previewTokenExpired";

	proxyData: ProxyData;
	// ... other details of failed request/response
};
export type ReadyEvent = {
	type: "ready";

	worker: DevWorker;
};

// ProxyWorker
export type ProxyWorkerIncomingMessage =
	| {
			type: "play";
			proxyData: ProxyData;
	  }
	| { type: "pause" };
export type ProxyWorkerOutgoingMessage =
	| { type: "error"; error: SerializedError }
	| { type: "previewTokenExpired"; proxyData: ProxyData };

// InspectorProxyWorker
export type InspectorProxyWorkerIncomingMessage =
	| {
			type: "play";
			proxyData: ProxyData;
	  }
	| { type: "pause" };
export type InspectorProxyWorkerOutgoingMessage =
	| { type: "error"; error: SerializedError }
	| { type: "previewTokenExpired"; proxyData: ProxyData };

type SerializedError = Pick<Error, "name" | "message" | "stack" | "cause">;

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

export type ProxyData = {
	destinationURL: Pick<URL, "hostname" | "port" | "protocol">;
	destinationInspectorURL: string;
	headers: Record<string, string>;
	liveReloadUrl?: string;
};
