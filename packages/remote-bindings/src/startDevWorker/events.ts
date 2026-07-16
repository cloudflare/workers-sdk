import type { Bundle, StartDevWorkerOptions } from "./types";
import type { Miniflare } from "miniflare";

export type ErrorEvent =
	| BaseErrorEvent<"RemoteRuntimeController">
	| BaseErrorEvent<
			"ProxyController",
			{ config?: StartDevWorkerOptions; bundle?: Bundle }
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
// ProxyController
export type PreviewTokenExpiredEvent = {
	type: "previewTokenExpired";

	proxyData: ProxyData;
	// ... other details of failed request/response
};
export type ReadyEvent = {
	type: "ready";
	proxyWorker: Miniflare;
	url: URL;
};

// ProxyWorker
export type ProxyWorkerIncomingRequestBody =
	| { type: "play"; proxyData: ProxyData }
	| { type: "pause" };
export type ProxyWorkerOutgoingRequestBody =
	| { type: "error"; error: SerializedError }
	| { type: "previewTokenExpired"; proxyData: ProxyData };

export type SerializedError = {
	message: string;
	name?: string;
	stack?: string | undefined;
	cause?: unknown;
};
export type UrlOriginParts = Pick<URL, "protocol" | "hostname" | "port">;

export type ProxyData = {
	userWorkerUrl: UrlOriginParts;
	userWorkerInnerUrlOverrides?: Partial<UrlOriginParts>;
	headers: Record<string, string>;
};
