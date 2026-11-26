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
