import { startRemoteProxySession as startRemoteProxySessionImpl } from "@cloudflare/remote-bindings";
import { UserError } from "@cloudflare/workers-utils";
import chalk from "chalk";
import { logger } from "../../logger";
import { requireApiToken, requireAuth } from "../../user";
import type {
	AuthCredentials,
	RemoteProxySession,
} from "@cloudflare/remote-bindings";
import type {
	AsyncHook,
	CfAccount,
	Config,
	StartDevWorkerInput,
} from "@cloudflare/workers-utils";

export type { RemoteProxySession } from "@cloudflare/remote-bindings";

export type StartRemoteProxySessionOptions = {
	workerName?: string;
	auth?: AsyncHook<CfAccount>;
	/** If running in a non-public compliance region, set this here. */
	complianceRegion?: Config["compliance_region"];
};

/**
 * Resolve wrangler's `AsyncHook<CfAccount>` auth option into the credential
 * resolver shape `@cloudflare/remote-bindings` expects.
 *
 * When no auth is provided we preserve wrangler's historical behaviour by
 * resolving credentials through wrangler's own auth system (`requireAuth` /
 * `requireApiToken`), which includes interactive login and account selection.
 * The resolver is returned (not pre-resolved) so the package can call it fresh
 * on every API request and pick up refreshed tokens.
 */
function resolveAuth(
	auth: AsyncHook<CfAccount> | undefined
): () => Promise<AuthCredentials> {
	if (auth !== undefined) {
		if (typeof auth === "function") {
			return async () => auth();
		}
		return async () => auth;
	}

	return async () => ({
		accountId: await requireAuth({}),
		apiToken: requireApiToken(),
	});
}

function findUserError(error: unknown): UserError | undefined {
	if (error instanceof UserError) {
		return error;
	}
	if (error instanceof Error && error.cause) {
		return findUserError(error.cause);
	}
	return undefined;
}

function getErrorMessage(error: unknown): string | undefined {
	if (error instanceof Error) {
		return getErrorMessage(error.cause) ?? error.message;
	}
	if (typeof error === "string") {
		return error;
	}
	return undefined;
}

/**
 * Start a remote proxy session.
 *
 * Thin wrapper over `@cloudflare/remote-bindings`'s `startRemoteProxySession`
 * that wires in wrangler's logger and auth system and preserves wrangler's
 * error-surfacing behaviour.
 */
export async function startRemoteProxySession(
	bindings: StartDevWorkerInput["bindings"],
	options?: StartRemoteProxySessionOptions
): Promise<RemoteProxySession> {
	logger.log(chalk.dim("⎔ Establishing remote connection..."));

	try {
		return await startRemoteProxySessionImpl(bindings ?? {}, {
			workerName: options?.workerName,
			complianceRegion: options?.complianceRegion,
			auth: resolveAuth(options?.auth),
			logger,
		});
	} catch (error) {
		// Surface UserErrors (e.g. auth / account-selection failures) directly so
		// the user sees a single, actionable message rather than a generic
		// "Failed to start" envelope.
		const userError = findUserError(error);
		if (userError) {
			throw userError;
		}

		const details = getErrorMessage(error);
		throw new Error(
			details
				? `Failed to start the remote proxy session. ${details}`
				: "Failed to start the remote proxy session. There is likely additional logging output above.",
			{ cause: error }
		);
	}
}
