import assert from "node:assert";
import { createCfProfileStore } from "@cloudflare/workers-auth/cf";
import { createWranglerProfileStore } from "@cloudflare/workers-auth/wrangler";
import { getBindingLocalSupport } from "@cloudflare/workers-utils";
import { createRemoteBindingsAuth } from "./auth";
import { startRemoteProxySession } from "./start-remote-proxy-session";
import type { RemoteBindingsLogger } from "./logger";
import type { RemoteProxySession } from "./start-remote-proxy-session";
import type {
	AsyncHook,
	Binding,
	CfAccount,
	Config,
	StartDevWorkerInput,
} from "@cloudflare/workers-utils";

export function pickRemoteBindings(
	bindings: Record<string, Binding>
): Record<string, Binding> {
	return Object.fromEntries(
		Object.entries(bindings ?? {}).filter(([, binding]) => {
			if (
				getBindingLocalSupport(binding.type) ===
				"DO-NOT-USE-this-resource-will-never-have-a-local-simulator"
			) {
				return true;
			}
			return "remote" in binding && binding.remote;
		})
	);
}

export type WorkerConfigObject = {
	/** The name of the worker. */
	name?: string;
	/** The Worker's bindings. */
	bindings: NonNullable<StartDevWorkerInput["bindings"]>;
	/** If running in a non-public compliance region, set this here. */
	complianceRegion?: Config["compliance_region"];
	/** ID of the account owning the worker. */
	account_id?: Config["account_id"];
	/** Directory used to resolve the auth profile from directory bindings. */
	profileDir?: string;
};

export type RemoteProxySessionData = {
	session: RemoteProxySession;
	remoteBindings: Record<string, Binding>;
	auth?: AsyncHook<CfAccount>;
};

export type RemoteBindingsContext = {
	logger: RemoteBindingsLogger;
};

/** Potentially starts or updates a remote proxy session. */
export async function maybeStartOrUpdateRemoteProxySession(
	workerConfigObject: WorkerConfigObject,
	preExistingRemoteProxySessionData: RemoteProxySessionData | null | undefined,
	auth: AsyncHook<CfAccount> | undefined,
	context: RemoteBindingsContext,
	startSession: typeof startRemoteProxySession = startRemoteProxySession
): Promise<RemoteProxySessionData | null> {
	const remoteBindings = pickRemoteBindings(workerConfigObject.bindings);
	if (
		Object.keys(remoteBindings).length === 0 &&
		!preExistingRemoteProxySessionData?.session
	) {
		return null;
	}
	const authSameAsBefore = deepStrictEqual(
		auth,
		preExistingRemoteProxySessionData?.auth
	);
	let remoteProxySession = preExistingRemoteProxySessionData?.session;

	if (!authSameAsBefore) {
		if (preExistingRemoteProxySessionData?.session) {
			await preExistingRemoteProxySessionData.session.dispose();
		}

		remoteProxySession = await startSession(remoteBindings, {
			workerName: workerConfigObject.name,
			complianceRegion: workerConfigObject.complianceRegion,
			auth: getAuthHook(
				auth,
				workerConfigObject.account_id
					? { account_id: workerConfigObject.account_id }
					: undefined,
				workerConfigObject.profileDir,
				context.logger
			),
			logger: context.logger,
		});
	} else {
		const remoteBindingsAreSameAsBefore = deepStrictEqual(
			remoteBindings,
			preExistingRemoteProxySessionData?.remoteBindings
		);

		if (!remoteBindingsAreSameAsBefore) {
			if (!remoteProxySession) {
				if (Object.keys(remoteBindings).length > 0) {
					remoteProxySession = await startSession(remoteBindings, {
						workerName: workerConfigObject.name,
						complianceRegion: workerConfigObject.complianceRegion,
						auth: getAuthHook(
							auth,
							workerConfigObject.account_id
								? { account_id: workerConfigObject.account_id }
								: undefined,
							workerConfigObject.profileDir,
							context.logger
						),
						logger: context.logger,
					});
				}
			} else {
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
		auth,
	};
}

/**
 * Gets the auth hook to use for the remote proxy session, this is either the user provided auth
 * hook if there is one, or an ad-hoc hook created using the account_id from the user's wrangler
 * config file otherwise.
 *
 * @param auth the auth hook provided by the user if any
 * @param config the user's wrangler config if any
 * @param profileDir working directory used to resolve the auth profile from directory bindings,
 *            falls back to `process.cwd()` when not provided
 * @returns the auth hook to pass to the startRemoteProxy session function if any
 */
function getAuthHook(
	auth: AsyncHook<CfAccount> | undefined,
	config: Pick<Config, "account_id"> | undefined,
	profileDir: string | undefined,
	logger: RemoteBindingsLogger
): AsyncHook<CfAccount> | undefined {
	const { auth: remoteBindingsAuth, useCfAuth } =
		createRemoteBindingsAuth(logger);
	const profileStore = useCfAuth
		? createCfProfileStore({ logger })
		: createWranglerProfileStore({ logger });
	const profile = profileStore.resolve({
		cwd: profileDir ?? process.cwd(),
	});
	remoteBindingsAuth.setProfile(profile);
	if (auth) {
		return auth;
	}

	if (config?.account_id) {
		return async () => {
			return {
				accountId: await remoteBindingsAuth.requireAuth(config),
				apiToken: remoteBindingsAuth.requireApiToken(),
			};
		};
	}

	return undefined;
}

function deepStrictEqual(source: unknown, target: unknown): boolean {
	try {
		assert.deepStrictEqual(source, target);
		return true;
	} catch {
		return false;
	}
}
