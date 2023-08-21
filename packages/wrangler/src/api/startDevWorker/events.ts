import type { EsbuildBundle } from "../../dev/use-esbuild";
import type { DevToolsEvent } from "./devtools";
import type { StartDevWorkerOptions } from "./types";
import type { Miniflare } from "miniflare";

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

	config: StartDevWorkerOptions;
};

// BundlerController
export type BundleStartEvent = {
	type: "bundleStart";

	config: StartDevWorkerOptions;
};
export type BundleCompleteEvent = {
	type: "bundleComplete";

	config: StartDevWorkerOptions;
	bundle: EsbuildBundle;
};

// RuntimeController
export type ReloadStartEvent = {
	type: "reloadStart";

	config: StartDevWorkerOptions;
	bundle: EsbuildBundle;
};
export type ReloadCompleteEvent = {
	type: "reloadComplete";

	config: StartDevWorkerOptions;
	bundle: EsbuildBundle;
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

	proxyWorker: Miniflare;
	inspectorProxyWorker: Miniflare;
};

// ProxyWorker
export type ProxyWorkerIncomingRequestBody =
	| { type: "play"; proxyData: ProxyData }
	| { type: "pause" };
export type ProxyWorkerOutgoingRequestBody =
	| { type: "error"; error: SerializedError }
	| { type: "previewTokenExpired"; proxyData: ProxyData }
	| { type: "debug-log"; args: Parameters<typeof console.debug> };

// InspectorProxyWorker
export * from "./devtools";
export type InspectorProxyWorkerIncomingWebSocketMessage = {
	type: ReloadCompleteEvent["type"];
	proxyData: ProxyData;
};
export type InspectorProxyWorkerOutgoingWebsocketMessage =
	| DevToolsEvent<"Runtime.consoleAPICalled">
	| DevToolsEvent<"Runtime.exceptionThrown">;

export type InspectorProxyWorkerOutgoingRequestBody =
	| { type: "error"; error: SerializedError }
	| { type: "runtime-websocket-error"; error: SerializedError }
	| { type: "get-source-map" }
	| { type: "debug-log"; args: Parameters<typeof console.debug> };

export type SerializedError = {
	message: string;
	name?: string;
	stack?: string | undefined;
	cause?: unknown;
};

export type ProxyData = {
	destinationURL: Partial<Pick<URL, "host" | "hostname" | "port" | "protocol">>;
	destinationInspectorURL: string;
	headers: Record<string, string>;
	liveReload?: boolean;
};
