import assert from "node:assert";
import {
	pickRemoteBindings,
	startRemoteProxySession as startRemoteProxySessionInternal,
} from "@cloudflare/remote-bindings";
import { getCloudflareComplianceRegion } from "@cloudflare/workers-utils";
import { readConfig } from "../../config";
import { logger } from "../../logger";
import { requireApiToken, requireAuth } from "../../user";
import { convertConfigBindingsToStartWorkerBindings } from "../startDevWorker";
import type { CfAccount } from "../../dev/create-worker-preview";
import type { Binding, StartDevWorkerInput } from "../startDevWorker/types";
import type { RemoteProxySession } from "@cloudflare/remote-bindings";
import type { Config } from "@cloudflare/workers-utils";

export { pickRemoteBindings };
export type { RemoteProxySession } from "@cloudflare/remote-bindings";

export type StartRemoteProxySessionOptions = {
	workerName?: string;
	auth?: NonNullable<StartDevWorkerInput["dev"]>["auth"];
	/** If running in a non-public compliance region, set this here. */
	complianceRegion?: Config["compliance_region"];
};

type WranglerConfigObject = {
	/** The path to the wrangler config file */
	path: string;
	/** The target environment */
	environment?: string;
};

type WorkerConfigObject = {
	/** The name of the worker */
	name?: string;
	/** The Worker's bindings */
	bindings: NonNullable<StartDevWorkerInput["bindings"]>;
	/** If running in a non-public compliance region, set this here. */
	complianceRegion?: Config["compliance_region"];
	/** Id of the account owning the worker */
	account_id?: Config["account_id"];
};

type WranglerAuth = NonNullable<StartDevWorkerInput["dev"]>["auth"];

/**
 * Start a remote proxy session using Wrangler's historical auth behavior.
 *
 * This keeps the previous programmatic API compatible for callers that omit
 * the options object or rely on Wrangler to resolve auth on their behalf.
 */
export async function startRemoteProxySession(
	bindings: StartDevWorkerInput["bindings"],
	options?: StartRemoteProxySessionOptions
): Promise<RemoteProxySession> {
	return startRemoteProxySessionInternal(bindings ?? {}, {
		workerName: options?.workerName,
		complianceRegion: options?.complianceRegion,
		auth: resolveAuthHook(options?.auth, undefined),
		logger,
	});
}

/**
 * Utility for potentially starting or updating a remote proxy session.
 *
 * This is the wrangler-specific wrapper that handles:
 * - Reading wrangler config files (config path → bindings conversion)
 * - Resolving auth via requireAuth/requireApiToken
 * - Session lifecycle (create/update/reuse)
 *
 * Then delegates to @cloudflare/remote-bindings for the actual session management.
 *
 * @param wranglerOrWorkerConfigObject either a file path to a wrangler configuration file or an object containing the name of
 *                                 the target worker alongside its bindings.
 * @param preExistingRemoteProxySessionData the optional data of a pre-existing remote proxy session if there was one, this
 *                                          argument can be omitted or set to null if there is no pre-existing remote proxy session
 * @param auth the authentication information for establishing the remote proxy connection
 * @returns null if no existing remote proxy session was provided and one should not be created (because the worker is not
 *          defining any remote bindings), the data associated to the created/updated remote proxy session otherwise.
 */
export async function maybeStartOrUpdateRemoteProxySession(
	wranglerOrWorkerConfigObject: WranglerConfigObject | WorkerConfigObject,
	preExistingRemoteProxySessionData?: {
		session: RemoteProxySession;
		remoteBindings: Record<string, Binding>;
		auth?: CfAccount | undefined;
	} | null,
	auth?: CfAccount | undefined
): Promise<{
	session: RemoteProxySession;
	remoteBindings: Record<string, Binding>;
} | null> {
	let config: Config | undefined;
	if ("path" in wranglerOrWorkerConfigObject) {
		const wranglerConfigObject = wranglerOrWorkerConfigObject;
		config = readConfig({
			config: wranglerConfigObject.path,
			env: wranglerConfigObject.environment,
		});

		wranglerOrWorkerConfigObject = {
			name: config.name ?? "worker",
			complianceRegion: getCloudflareComplianceRegion(config),
			bindings: convertConfigBindingsToStartWorkerBindings(config) ?? {},
		};
	}

	const workerConfigObject = wranglerOrWorkerConfigObject;

	const remoteBindings = pickRemoteBindings(workerConfigObject.bindings);

	const authSameAsBefore = deepStrictEqual(
		auth,
		preExistingRemoteProxySessionData?.auth
	);

	let remoteProxySession = preExistingRemoteProxySessionData?.session;

	if (Object.keys(remoteBindings).length === 0) {
		if (remoteProxySession) {
			await remoteProxySession.dispose();
		}
		return null;
	}

	if (!authSameAsBefore) {
		// The auth values have changed so we do need to restart a new remote proxy session

		if (preExistingRemoteProxySessionData?.session) {
			await preExistingRemoteProxySessionData.session.dispose();
		}

		remoteProxySession = await startRemoteProxySessionWithAuth(
			remoteBindings,
			workerConfigObject,
			auth,
			config
		);
	} else {
		// The auth values haven't changed so we can reuse the pre-existing session

		const remoteBindingsAreSameAsBefore = deepStrictEqual(
			remoteBindings,
			preExistingRemoteProxySessionData?.remoteBindings
		);

		// We only want to perform updates on the remote proxy session if the session's remote bindings have changed
		if (!remoteBindingsAreSameAsBefore) {
			if (!remoteProxySession) {
				if (Object.keys(remoteBindings).length > 0) {
					remoteProxySession = await startRemoteProxySessionWithAuth(
						remoteBindings,
						workerConfigObject,
						auth,
						config
					);
				}
			} else {
				// Note: we always call updateBindings even when there are zero remote bindings, in these
				//       cases we could terminate the remote session if we wanted, that's probably
				//       something to consider down the line
				await remoteProxySession.updateBindings(remoteBindings);
			}
		}
	}

	await remoteProxySession?.ready;
	if (!remoteProxySession) {
		return null;
	}
	return {
		session: remoteProxySession,
		remoteBindings,
	};
}

/**
 * Start a remote proxy session, resolving auth from wrangler's auth system
 * and delegating to @cloudflare/remote-bindings.
 */
async function startRemoteProxySessionWithAuth(
	bindings: Record<string, Binding>,
	workerConfig: WorkerConfigObject,
	auth: CfAccount | undefined,
	config: Config | undefined
): Promise<RemoteProxySession> {
	return startRemoteProxySessionInternal(bindings, {
		workerName: workerConfig.name,
		complianceRegion: workerConfig.complianceRegion,
		auth: resolveAuthHook(
			auth,
			workerConfig.account_id ? { account_id: workerConfig.account_id } : config
		),
		logger,
	});
}

/**
 * Create an auth callback that resolves credentials from either a pre-provided
 * CfAccount or from wrangler's auth system (requireAuth/requireApiToken).
 */
function resolveAuthHook(
	auth: WranglerAuth | undefined,
	config: Pick<Config, "account_id"> | undefined
): () => Promise<{
	accountId: string;
	apiToken: { apiToken: string } | { authKey: string; authEmail: string };
}> {
	if (auth) {
		if (typeof auth === "function") {
			return async () => auth(config ?? { account_id: undefined });
		}

		return async () => auth;
	}

	if (config?.account_id) {
		return async () => {
			return {
				accountId: await requireAuth(config),
				apiToken: requireApiToken(),
			};
		};
	}

	// Fallback: try to resolve auth without an account_id hint
	return async () => {
		return {
			accountId: await requireAuth({}),
			apiToken: requireApiToken(),
		};
	};
}

function deepStrictEqual(source: unknown, target: unknown): boolean {
	try {
		assert.deepStrictEqual(source, target);
		return true;
	} catch {
		return false;
	}
}
