import getPort from "get-port";
import { createPreviewSession } from "./api/preview-session";
import { createPreviewToken } from "./api/preview-token";
import { createEnvAuthResolver } from "./auth";
import { ProxyServer } from "./proxy-server";
import type { Logger } from "./logger";
import type {
	AuthCredentials,
	RemoteProxySession,
	StartRemoteProxySessionOptions,
} from "./types";
import type { Binding } from "@cloudflare/workers-utils";
import type { RemoteProxyConnectionString } from "miniflare";

/**
 * Normalise the `auth` option into a resolver that is invoked *fresh on every*
 * Cloudflare API call.
 *
 * This is essential for long-lived sessions (e.g. `vite dev`): when the resolver
 * is backed by {@link createEnvAuthResolver} it re-reads (and refreshes, if
 * expired) the stored OAuth token on each call, so a token rotated on disk by
 * the top-level CLI — or by this resolver itself — is always picked up. A
 * resolver that resolved auth only once would send a stale token after the
 * original expired.
 */
function toAuthResolver(
	auth: StartRemoteProxySessionOptions["auth"],
	accountId: string | undefined,
	logger: Logger
): () => Promise<AuthCredentials> {
	if (auth === undefined) {
		return createEnvAuthResolver({ accountId, logger });
	}
	if (typeof auth === "function") {
		return auth;
	}
	return async () => auth;
}

/**
 * Start a remote proxy session.
 *
 * This is the lightweight replacement for the old `startRemoteProxySession`
 * that spun up an entire DevEnv (5 controllers, esbuild, a Miniflare instance)
 * just to obtain a preview token. Instead, this:
 *
 * 1. Makes 2 direct API calls to Cloudflare's edge-preview endpoints
 * 2. Starts a minimal Node.js HTTP/WS proxy that injects the preview token
 * 3. Returns the local proxy URL as the `RemoteProxyConnectionString`
 */
export async function startRemoteProxySession(
	bindings: Record<string, Binding>,
	options: StartRemoteProxySessionOptions = {}
): Promise<RemoteProxySession> {
	if (Object.keys(bindings).length === 0) {
		throw new Error("Cannot start remote proxy session with no bindings");
	}

	const logger: Logger = options.logger ?? console;
	const resolveAuth = toAuthResolver(options.auth, options.accountId, logger);
	const workerName = options.workerName ?? "remote-bindings-proxy";
	const complianceRegion = options.complianceRegion;

	// Step 1: Create a preview session (gets a session token, exchanges if needed)
	let session;
	try {
		session = await createPreviewSession(
			await resolveAuth(),
			workerName,
			complianceRegion,
			logger
		);
	} catch (error) {
		throw new Error("Failed to create remote preview session", {
			cause: error,
		});
	}

	// Step 2: Upload the ProxyServerWorker and get a preview token
	let token;
	try {
		token = await createPreviewToken(
			await resolveAuth(),
			session,
			bindings,
			workerName,
			complianceRegion,
			logger
		);
	} catch (error) {
		throw new Error("Failed to create remote preview token", {
			cause: error,
		});
	}

	// Step 3: Start a minimal local proxy that injects the preview token
	const port = await getPort();
	const proxy = new ProxyServer(token, port);
	await proxy.ready;

	const remoteProxyConnectionString = new URL(
		proxy.url
	) as RemoteProxyConnectionString;

	// updateBindings: re-upload the worker with new bindings and refresh the token
	const updateBindings = async (
		newBindings: Record<string, Binding>
	): Promise<void> => {
		try {
			const newToken = await createPreviewToken(
				await resolveAuth(),
				session,
				newBindings,
				workerName,
				complianceRegion,
				logger
			);
			proxy.setToken(newToken);
		} catch (error) {
			throw new Error("Failed to update remote proxy bindings", {
				cause: error,
			});
		}
	};

	const dispose = async (): Promise<void> => {
		await proxy.dispose();
	};

	return {
		ready: proxy.ready,
		remoteProxyConnectionString,
		updateBindings,
		dispose,
	};
}
