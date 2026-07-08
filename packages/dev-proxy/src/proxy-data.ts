import type { UrlOriginAndPathnameParts, UrlOriginParts } from "./url";

export type ProxyData = {
	userWorkerUrl: UrlOriginParts;
	userWorkerInspectorUrl?: UrlOriginAndPathnameParts;
	userWorkerInnerUrlOverrides?: Partial<UrlOriginParts>;
	headers: Record<string, string>;
	liveReload?: boolean;
	proxyLogsToController?: boolean;
};

// Messages sent from the controller (Node) into the ProxyWorker.
export type ProxyWorkerIncomingRequestBody =
	| { type: "play"; proxyData: ProxyData }
	| { type: "pause" };

// Messages sent from the ProxyWorker back out to the controller (Node).
export type ProxyWorkerOutgoingRequestBody =
	| { type: "error"; error: SerializedError }
	| { type: "sseResponseDetected" }
	| { type: "previewTokenExpired"; proxyData: ProxyData }
	| { type: "debug-log"; args: Parameters<typeof console.debug> };

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
