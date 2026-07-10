import { WranglerDevEnv } from "./WranglerDevEnv";
import type {
	StartDevWorkerInput,
	Worker,
} from "@cloudflare/remote-bindings/internal";

export { convertConfigBindingsToStartWorkerBindings } from "./config-binding-utils";

export { WranglerDevEnv as DevEnv };
export {
	castErrorCause,
	serialiseError,
} from "@cloudflare/remote-bindings/internal";
export type {
	AsyncHook,
	BinaryFile,
	Binding,
	Bundle,
	BundleCompleteEvent,
	BundleStartEvent,
	ConfigUpdateEvent,
	DevRegistryUpdateEvent,
	DevToolsEvent,
	ErrorEvent,
	File,
	Hook,
	HookValues,
	InspectorProxyWorkerIncomingWebSocketMessage,
	InspectorProxyWorkerOutgoingRequestBody,
	InspectorProxyWorkerOutgoingWebsocketMessage,
	LogLevel,
	PreviewTokenExpiredEvent,
	ProxyData,
	ProxyWorkerIncomingRequestBody,
	ProxyWorkerOutgoingRequestBody,
	ReadyEvent,
	ReloadCompleteEvent,
	ReloadStartEvent,
	SerializedError,
	ServiceFetch,
	SourceMapMetadata,
	StartDevWorkerInput,
	StartDevWorkerOptions,
	Trigger,
	UrlOriginAndPathnameParts,
	UrlOriginParts,
	Worker,
	WranglerStartDevWorkerInput,
} from "@cloudflare/remote-bindings/internal";

export async function startWorker(
	options: StartDevWorkerInput
): Promise<Worker> {
	const devEnv = new WranglerDevEnv();

	return devEnv.startWorker(options);
}
