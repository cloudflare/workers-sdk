import assert from "node:assert";
import { getBindingLocalSupport } from "@cloudflare/workers-utils";
import { getRemoteBindingsAuthHook } from "./auth";
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
			auth: getRemoteBindingsAuthHook(
				auth,
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
						auth: getRemoteBindingsAuthHook(
							auth,
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
		auth,
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
