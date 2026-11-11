import { startRemoteProxySession as startRemoteProxySessionFromPackage } from "@cloudflare/remote-bindings";
import { logger } from "../../logger";
import { isCfAuthActive } from "../../user";
import type {
	StartRemoteProxySessionOptions as PackageStartRemoteProxySessionOptions,
	RemoteProxySession,
} from "@cloudflare/remote-bindings";
import type { StartDevWorkerInput } from "@cloudflare/workers-utils";

export type StartRemoteProxySessionOptions = Omit<
	PackageStartRemoteProxySessionOptions,
	"cliDisplayName" | "logger"
>;

export function startRemoteProxySession(
	bindings: StartDevWorkerInput["bindings"],
	options: StartRemoteProxySessionOptions = {}
): Promise<RemoteProxySession> {
	return startRemoteProxySessionFromPackage(bindings, {
		...options,
		// `cf-wrangler` runs under cf's auth, so name cf's commands
		cliDisplayName: isCfAuthActive() ? "cf" : "Wrangler",
		logger,
	});
}
