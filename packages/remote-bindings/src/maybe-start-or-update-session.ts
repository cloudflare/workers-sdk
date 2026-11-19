import assert from "node:assert";
import { AuthenticationError } from "@cloudflare/workers-auth";
import {
	getBindingLocalSupport,
	resolveBindingRemote,
} from "@cloudflare/workers-utils/config";
import { getRemoteBindings } from "./config-bindings";
import { startRemoteProxySession } from "./start-remote-proxy-session";
import { CLI_COMMANDS, RemoteSessionAuthenticationError } from "./utils/remote";
import type { ConfigBindings } from "./config-bindings";
import type { RemoteBindingsLogger } from "./logger";
import type { RemoteProxySession } from "./start-remote-proxy-session";
import type { RemoteBindingsCliDisplayName } from "./utils/remote";
import type {
	AsyncHook,
	Binding,
	CfAccount,
	StartDevWorkerInput,
} from "@cloudflare/workers-utils";
import type { Config } from "@cloudflare/workers-utils/config";

export function pickRemoteBindings(
	bindings: Record<string, Binding>
): Record<string, Binding> {
	return Object.fromEntries(
		Object.entries(bindings ?? {}).filter(([, binding]) =>
			resolveBindingRemote(
				binding.type,
				"remote" in binding ? binding.remote : undefined
			)
		)
	);
}

export type WorkerConfigObject = {
	/** The name of the worker. */
	name?: string;
	/** If running in a non-public compliance region, set this here. */
	complianceRegion?: Config["compliance_region"];
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

/**
 * Controls whether resolving remote binding credentials may start a login.
 * Accepts account configuration for Wrangler's forwarded config-aware auth hooks.
 */
export type RemoteBindingsAuthOptions = Partial<Pick<Config, "account_id">> & {
	allowLogin?: boolean;
};

/** Credentials for a remote proxy session. */
export type RemoteBindingsAuth = {
	/** Resolves the account ID and API token for the session. */
	hook: AsyncHook<CfAccount, [RemoteBindingsAuthOptions?]>;
	/**
	 * Identifies the credentials `hook` resolves. When set, a session is only
	 * restarted when the key changes; otherwise, when it gets a different `hook`.
	 */
	key?: string;
};

export type RemoteProxySessionData = {
	session: RemoteProxySession;
	remoteBindings: Record<string, Binding>;
	auth?: RemoteBindingsAuth["hook"];
	authKey?: string;
};

export type RemoteBindingsContext = {
	cliDisplayName: RemoteBindingsCliDisplayName;
	logger: RemoteBindingsLogger;
};

/** Potentially starts or updates a remote proxy session. */
export async function maybeStartOrUpdateRemoteProxySession(
	workerConfigObject: WorkerConfigObject,
	preExistingRemoteProxySessionData: RemoteProxySessionData | null | undefined,
	auth: RemoteBindingsAuth | RemoteBindingsAuth["hook"],
	context: RemoteBindingsContext,
	startSession: typeof startRemoteProxySession = startRemoteProxySession
): Promise<RemoteProxySessionData | null> {
	// Wrangler passes its hook alone
	const { hook, key }: RemoteBindingsAuth =
		"hook" in auth ? auth : { hook: auth };
	// The remote proxy Worker takes bindings in Wrangler's format.
	const bindings =
		workerConfigObject.target === "cf"
			? getRemoteBindings({ env: workerConfigObject.env })
			: workerConfigObject.bindings;
	const remoteBindings = pickRemoteBindings(bindings);
	if (
		Object.keys(remoteBindings).length === 0 &&
		!preExistingRemoteProxySessionData?.session
	) {
		return null;
	}
	const onlyRemoteOnlyBindings =
		Object.values(remoteBindings).every(isRemoteOnlyBinding);
	// An empty binding set no longer records the login policy the session captured.
	const sameLoginPolicy =
		Object.keys(remoteBindings).length === 0 ||
		(Object.keys(preExistingRemoteProxySessionData?.remoteBindings ?? {})
			.length > 0 &&
			onlyRemoteOnlyBindings ===
				Object.values(
					preExistingRemoteProxySessionData?.remoteBindings ?? {}
				).every(isRemoteOnlyBinding));
	const authSameAsBefore =
		sameLoginPolicy &&
		(key !== undefined ||
		preExistingRemoteProxySessionData?.authKey !== undefined
			? key === preExistingRemoteProxySessionData?.authKey
			: deepStrictEqual(hook, preExistingRemoteProxySessionData?.auth));
	let remoteProxySession = preExistingRemoteProxySessionData?.session;

	function startSessionWithAuth() {
		return startSession(remoteBindings, {
			workerName: workerConfigObject.name,
			complianceRegion: workerConfigObject.complianceRegion,
			cliDisplayName: context.cliDisplayName,
			auth:
				onlyRemoteOnlyBindings && typeof hook === "function"
					? async () => hook({ allowLogin: false })
					: hook,
			logger: context.logger,
		});
	}

	try {
		if (!authSameAsBefore) {
			await remoteProxySession?.dispose();
			remoteProxySession = undefined;

			remoteProxySession = await startSessionWithAuth();
		} else {
			const remoteBindingsAreSameAsBefore = deepStrictEqual(
				remoteBindings,
				preExistingRemoteProxySessionData?.remoteBindings
			);

			if (!remoteBindingsAreSameAsBefore) {
				if (!remoteProxySession) {
					if (Object.keys(remoteBindings).length > 0) {
						remoteProxySession = await startSessionWithAuth();
					}
				} else {
					await remoteProxySession.updateBindings(remoteBindings);
				}
			}
		}
		await remoteProxySession?.ready;
	} catch (error) {
		if (
			!onlyRemoteOnlyBindings ||
			!(
				error instanceof AuthenticationError ||
				error instanceof RemoteSessionAuthenticationError
			)
		) {
			throw error;
		}
		await remoteProxySession?.dispose();
		context.logger.warn(
			`Remote-only bindings (${Object.keys(remoteBindings).join(", ")}) could not be authenticated and will throw when called. Run \`${CLI_COMMANDS[context.cliDisplayName].login}\` or set CLOUDFLARE_API_TOKEN, then restart your dev server.`
		);
		context.logger.debug(error);
		return null;
	}

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

function isRemoteOnlyBinding(binding: Binding): boolean {
	const support = getBindingLocalSupport(binding.type);
	return (
		support === "remote" ||
		support === "DO-NOT-USE-this-resource-will-never-have-a-local-simulator"
	);
}

function deepStrictEqual(source: unknown, target: unknown): boolean {
	try {
		assert.deepStrictEqual(source, target);
		return true;
	} catch {
		return false;
	}
}
