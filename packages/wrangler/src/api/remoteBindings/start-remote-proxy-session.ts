import {
	startRemoteProxySession as startPackageSession,
	type RemoteProxySession,
} from "@cloudflare/remote-bindings";
import { logger } from "../../logger";
import type { Config, StartDevWorkerInput } from "@cloudflare/workers-utils";

export type { RemoteProxySession } from "@cloudflare/remote-bindings";

export type StartRemoteProxySessionOptions = {
	workerName?: string;
	auth?: NonNullable<StartDevWorkerInput["dev"]>["auth"];
	/** If running in a non-public compliance region, set this here. */
	complianceRegion?: Config["compliance_region"];
};

export function startRemoteProxySession(
	bindings: StartDevWorkerInput["bindings"],
	options?: StartRemoteProxySessionOptions
): Promise<RemoteProxySession> {
	return startPackageSession(bindings, { ...options, logger });
}
