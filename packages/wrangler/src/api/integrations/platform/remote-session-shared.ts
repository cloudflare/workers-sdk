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
 * Start a remote bindings session that resolves Wrangler credentials on first use.
 *
 * @param config - Bindings and account settings for the session.
 * @returns The session. The caller must dispose it when no longer needed.
 */
export function startSession({
	bindings,
	accountId,
	...options
}: SessionConfig) {
	return startRemoteProxySession(bindings, {
		...options,
		lazy: true,
		auth: getDefaultRemoteBindingsAuth(accountId).hook,
		logger,
	});
}
