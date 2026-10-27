import assert from "node:assert";
import { getBindingLocalSupport } from "@cloudflare/workers-utils";
import { getRemoteBindingsAuthHook } from "./auth";
import { getRemoteBindings } from "./config-bindings";
import { startRemoteProxySession } from "./start-remote-proxy-session";
import type { ConfigBindings } from "./config-bindings";
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
	/** If running in a non-public compliance region, set this here. */
	complianceRegion?: Config["compliance_region"];
	/** ID of the account owning the worker. */
	account_id?: Config["account_id"];
	/** Directory used to resolve the auth profile from directory bindings. */
	profileDir?: string;
} & (
	| {
			/** The format of the Worker's bindings. Defaults to Wrangler's. */
			target?: "wrangler";
			/** The Worker's bindings, in Wrangler's format. */
			bindings: NonNullable<StartDevWorkerInput["bindings"]>;
	  }
	| {
			/** The format of the Worker's bindings: `cloudflare.config.ts`'s. */
			target: "cf";
			/** The Worker's bindings, as declared in `cloudflare.config.ts`. */
			env: ConfigBindings;
	  }
);

/** Credentials for a remote proxy session. */
export type RemoteBindingsAuth = {
	/** Resolves the account ID and API token for the session. */
	hook: AsyncHook<CfAccount>;
	/**
	 * Identifies the credentials `hook` resolves. When set, a session is only
	 * restarted when the key changes; otherwise, when it gets a different `hook`.
	 */
	key?: string;
};

export type RemoteProxySessionData = {
	session: RemoteProxySession;
	remoteBindings: Record<string, Binding>;
	auth?: AsyncHook<CfAccount>;
	authKey?: string;
};

export type RemoteBindingsContext = {
	cliDisplayName: string;
	logger: RemoteBindingsLogger;
};

/** Potentially starts or updates a remote proxy session. */
export async function maybeStartOrUpdateRemoteProxySession(
	workerConfigObject: WorkerConfigObject,
	preExistingRemoteProxySessionData: RemoteProxySessionData | null | undefined,
	auth: RemoteBindingsAuth | AsyncHook<CfAccount> | undefined,
	context: RemoteBindingsContext,
	startSession: typeof startRemoteProxySession = startRemoteProxySession
): Promise<RemoteProxySessionData | null> {
	// Wrangler passes its hook alone
	const { hook, key }: Partial<RemoteBindingsAuth> =
		auth !== undefined && "hook" in auth ? auth : { hook: auth };
	const remoteBindings = pickRemoteBindings(
		// The remote proxy Worker takes bindings in Wrangler's format
		workerConfigObject.target === "cf"
			? getRemoteBindings({ env: workerConfigObject.env })
			: workerConfigObject.bindings
	);
	if (
		Object.keys(remoteBindings).length === 0 &&
		!preExistingRemoteProxySessionData?.session
	) {
		return null;
	}
	const authSameAsBefore =
		key !== undefined ||
		preExistingRemoteProxySessionData?.authKey !== undefined
			? key === preExistingRemoteProxySessionData?.authKey
			: deepStrictEqual(hook, preExistingRemoteProxySessionData?.auth);
	let remoteProxySession = preExistingRemoteProxySessionData?.session;

	if (!authSameAsBefore) {
		if (preExistingRemoteProxySessionData?.session) {
			await preExistingRemoteProxySessionData.session.dispose();
		}

		remoteProxySession = await startSession(remoteBindings, {
			workerName: workerConfigObject.name,
			complianceRegion: workerConfigObject.complianceRegion,
			cliDisplayName: context.cliDisplayName,
			auth: getRemoteBindingsAuthHook(
				hook,
				workerConfigObject.account_id,
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
						cliDisplayName: context.cliDisplayName,
						auth: getRemoteBindingsAuthHook(
							hook,
							workerConfigObject.account_id,
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
		auth: hook,
		authKey: key,
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
