import { startRemoteProxySession } from "@cloudflare/remote-bindings";
import { logger } from "../../../logger";
import { getDefaultRemoteBindingsAuth } from "../../remoteBindings/auth";
import type { StartRemoteProxySessionOptions } from "@cloudflare/remote-bindings";
import type { Binding } from "@cloudflare/workers-utils";

export type SessionConfig = Pick<
	StartRemoteProxySessionOptions,
	"workerName" | "complianceRegion" | "cliDisplayName"
> & {
	bindings: Record<string, Binding>;
	accountId?: string;
};

export type StartupMessage =
	| { type: "ready"; url: string }
	| {
			type: "error";
			message: string;
			stack?: string;
			userError: boolean;
			telemetryMessage?: string;
	  };

/**
 * Start a remote bindings session using Wrangler's default authentication.
 *
 * @param config - Bindings and account settings for the session.
 * @param lazy - Resolve credentials on the first binding request instead of at startup.
 * @returns The session. The caller must dispose it when no longer needed.
 */
export function startSession(
	{ bindings, accountId, ...options }: SessionConfig,
	lazy: boolean
) {
	return startRemoteProxySession(bindings, {
		...options,
		lazy,
		auth: getDefaultRemoteBindingsAuth(accountId).hook,
		logger,
	});
}
