import type { DevToolsEvent } from "./devtools";
import type { Bundle, StartDevWorkerOptions } from "./types";
import type Protocol from "devtools-protocol";
import type { Miniflare, WorkerRegistry } from "miniflare";

export type ErrorEvent =
	| BaseErrorEvent<
			| "ConfigController"
			| "BundlerController"
			| "LocalRuntimeController"
			| "RemoteRuntimeController"
			| "ProxyWorker"
			| "InspectorProxyWorker"
			| "MultiworkerRuntimeController"
	  >
	| BaseErrorEvent<
			"ProxyController",
			{ config?: StartDevWorkerOptions; bundle?: Bundle }
	  >
	| BaseErrorEvent<
			"BundlerController",
			{ config?: StartDevWorkerOptions; filePath?: string }
	  >;
type BaseErrorEvent<Source = string, Data = undefined> = {
	type: "error";
	reason: string;
	cause: Error | SerializedError;
	source: Source;
	data: Data;
};

export function castErrorCause(cause: unknown) {
	if (cause instanceof Error) {
		return cause;
	}

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
	bundle: Bundle;
};

// RuntimeController
export type ReloadStartEvent = {
	type: "reloadStart";

	config: StartDevWorkerOptions;
	bundle: Bundle;
};
export type ReloadCompleteEvent = {
	type: "reloadComplete";

	config: StartDevWorkerOptions;
	bundle: Bundle;
	proxyData: ProxyData;
};
export type DevRegistryUpdateEvent = {
	type: "devRegistryUpdate";

	registry: WorkerRegistry;
};

// LocalRuntimeController (uncaught Worker exceptions, revived and
// source-mapped by Miniflare's pretty-error path) and ProxyController
// (inspector-relayed Runtime.exceptionThrown). The two sources are disjoint
// for a given exception: the pretty-error path only sees exceptions the
// runtime caught to build a 500 response — which therefore never reach the
// inspector — while the inspector only reports exceptions the runtime did
// not catch. `source` distinguishes them should that invariant ever change.
export type RuntimeErrorEvent = {
	type: "runtimeError";
	source: "LocalRuntimeController" | "ProxyController";

	/** The exception summary line. */
	text: string;
	/** The source-mapped stack. */
	stack: string;
	/** The raw Chrome DevTools Protocol exception details, when the event
	 * came over the inspector. */
	exceptionDetails?: Protocol.Runtime.ExceptionDetails;
};
export type PreviewTokenExpiredEvent = {
	type: "previewTokenExpired";

	proxyData: ProxyData;
	// ... other details of failed request/response
};
export type ReadyEvent = {
	type: "ready";
	proxyWorker: Miniflare;
	url: URL;
	inspectorUrl: URL | undefined;
};

// ProxyWorker
export type ProxyWorkerIncomingRequestBody =
	| { type: "play"; proxyData: ProxyData }
	| { type: "pause" };
export type ProxyWorkerOutgoingRequestBody =
	| { type: "error"; error: SerializedError }
	| { type: "sseResponseDetected" }
	| { type: "previewTokenExpired"; proxyData: ProxyData }
	| { type: "debug-log"; args: Parameters<typeof console.debug> };

// InspectorProxyWorker
export * from "./devtools";
export type InspectorProxyWorkerIncomingWebSocketMessage =
	| {
			type: ReloadStartEvent["type"];
	  }
	| {
			type: ReloadCompleteEvent["type"];
			proxyData: ProxyData;
	  };
export type InspectorProxyWorkerOutgoingWebsocketMessage =
	// Relayed Chrome DevTools Protocol Messages
	| DevToolsEvent<"Runtime.consoleAPICalled">
	| DevToolsEvent<"Runtime.exceptionThrown">;

export type InspectorProxyWorkerOutgoingRequestBody =
	| { type: "error"; error: SerializedError }
	| { type: "runtime-websocket-error"; error: SerializedError }
	| { type: "debug-log"; args: Parameters<typeof console.debug> }
	// Intercepted Chrome DevTools Protocol Messages
	| { type: "load-network-resource"; url: string }; // responds with `url`'s contents

export type SerializedError = {
	message: string;
	name?: string;
	stack?: string | undefined;
	cause?: unknown;
};
export function serialiseError(e: unknown): SerializedError {
	if (e instanceof Error) {
		return {
			message: e.message,
			name: e.name,
			stack: e.stack,
			cause: e.cause && serialiseError(e.cause),
		};
	} else {
		return { message: String(e) };
	}
}

export type UrlOriginParts = Pick<URL, "protocol" | "hostname" | "port">;
export type UrlOriginAndPathnameParts = Pick<
	URL,
	"protocol" | "hostname" | "port" | "pathname"
>;

export type ProxyData = {
	userWorkerUrl: UrlOriginParts;
	userWorkerInspectorUrl?: UrlOriginAndPathnameParts;
	userWorkerInnerUrlOverrides?: Partial<UrlOriginParts>;
	headers: Record<string, string>;
	liveReload?: boolean;
	proxyLogsToController?: boolean;
};
