import type {
	RemoteProxySession,
	StartRemoteProxySessionOptions,
} from "./session/start-remote-proxy-session";
import type { Binding } from "@cloudflare/workers-utils";

export {
	maybeStartOrUpdateRemoteProxySession,
	pickRemoteBindings,
} from "./session/maybe-start-or-update-session";
export type {
	MaybeStartOrUpdateRemoteProxySessionOptions,
	RemoteProxyWorker,
} from "./session/maybe-start-or-update-session";
export type {
	RemoteProxySession,
	StartRemoteProxySessionOptions,
} from "./session/start-remote-proxy-session";
export type { RemoteBindingsLogger } from "./logger";

export async function startRemoteProxySession(
	bindings: Record<string, Binding> | undefined,
	options?: StartRemoteProxySessionOptions
): Promise<RemoteProxySession> {
	const { startRemoteProxySession: startSession } =
		await import("./session/start-remote-proxy-session");
	return startSession(bindings, options);
}
