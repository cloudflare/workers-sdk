export type SerializedError = {
	message: string;
	name?: string;
	stack?: string;
	cause?: unknown;
};

type UrlOriginParts = Pick<URL, "protocol" | "hostname" | "port">;

export type ProxyData = {
	userWorkerUrl: UrlOriginParts;
	userWorkerInnerUrlOverrides?: Partial<UrlOriginParts>;
	headers: Record<string, string>;
	liveReload?: boolean;
};

export type ProxyWorkerIncomingRequestBody =
	| { type: "play"; proxyData: ProxyData }
	| { type: "pause" };

export type ProxyWorkerOutgoingRequestBody =
	| { type: "error"; error: SerializedError }
	| { type: "sseResponseDetected" }
	| { type: "previewTokenExpired"; proxyData: ProxyData }
	| { type: "debug-log"; args: Parameters<typeof console.debug> };
