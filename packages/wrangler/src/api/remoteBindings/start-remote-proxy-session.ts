import { startRemoteProxySession as startRemoteProxySessionFromPackage } from "@cloudflare/remote-bindings";
import { logger } from "../../logger";
import type {
	StartRemoteProxySessionOptions as PackageStartRemoteProxySessionOptions,
	RemoteProxySession,
} from "@cloudflare/remote-bindings";
import type { StartDevWorkerInput } from "@cloudflare/workers-utils";

export type StartRemoteProxySessionOptions = Omit<
	PackageStartRemoteProxySessionOptions,
	"logger"
>;

export function startRemoteProxySession(
	bindings: StartDevWorkerInput["bindings"],
	options: StartRemoteProxySessionOptions = {}
): Promise<RemoteProxySession> {
	return startRemoteProxySessionFromPackage(bindings, { ...options, logger });
}
