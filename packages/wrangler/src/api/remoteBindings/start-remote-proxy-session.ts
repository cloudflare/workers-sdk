import { startRemoteProxySession as startRemoteProxySessionFromPackage } from "@cloudflare/remote-bindings";
import { logger } from "../../logger";
import { isCfAuthActive } from "../../user";
import { getDefaultRemoteBindingsAuth } from "./auth";
import type {
	StartRemoteProxySessionOptions as PackageStartRemoteProxySessionOptions,
	RemoteProxySession,
} from "@cloudflare/remote-bindings";
import type {
	AsyncHook,
	CfAccount,
	StartDevWorkerInput,
} from "@cloudflare/workers-utils";

export type StartRemoteProxySessionOptions = Omit<
	PackageStartRemoteProxySessionOptions,
	"auth" | "cliDisplayName" | "logger"
> & {
	/** Resolves the account ID and API token. Defaults to Wrangler's credentials. */
	auth?: AsyncHook<CfAccount>;
};

export function startRemoteProxySession(
	bindings: StartDevWorkerInput["bindings"],
	options: StartRemoteProxySessionOptions = {}
): Promise<RemoteProxySession> {
	return startRemoteProxySessionFromPackage(bindings, {
		...options,
		auth: options.auth ?? getDefaultRemoteBindingsAuth(undefined).hook,
		// `cf-wrangler` runs under cf's auth, so name cf's commands
		cliDisplayName: isCfAuthActive() ? "cf" : "Wrangler",
		logger,
	});
}
