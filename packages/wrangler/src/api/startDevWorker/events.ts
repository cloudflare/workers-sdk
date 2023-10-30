import type { EsbuildBundle } from "../../dev/use-esbuild";
import type { DevToolsEvent } from "./devtools";
import type { StartDevWorkerOptions } from "./types";
import type { Miniflare } from "miniflare";

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
			cause: serialiseError(e.cause),
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
	userWorkerInspectorUrl: UrlOriginAndPathnameParts;
	userWorkerInnerUrlOverrides: Partial<UrlOriginParts>;
	headers: Record<string, string>;
	liveReload?: boolean;
};
