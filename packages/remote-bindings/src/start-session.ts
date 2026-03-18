import getPort from "get-port";
import { createPreviewSession } from "./api/preview-session";
import { createPreviewToken } from "./api/preview-token";
import { ProxyServer } from "./proxy-server";
import type {
	AuthCredentials,
	PreviewSession,
	PreviewToken,
	RemoteProxySession,
	StartRemoteProxySessionOptions,
} from "./types";
import type { Binding } from "@cloudflare/workers-utils";
import type { RemoteProxyConnectionString } from "miniflare";

/**
 * Resolve auth from either a static credentials object or a lazy callback.
 */
async function resolveAuth(
	auth: AuthCredentials | (() => Promise<AuthCredentials>)
): Promise<AuthCredentials> {
	if (typeof auth === "function") {
		return auth();
	}
	return auth;
}

/**
 * Start a remote proxy session.
 *
 * This is the simplified replacement for the old startRemoteProxySession that
 * used to spin up an entire DevEnv with 5 controllers, esbuild, and a Miniflare
 * instance. Instead, this:
 *
 * 1. Makes 2 direct API calls to Cloudflare's edge-preview endpoints
 * 2. Starts a minimal Node.js HTTP proxy that adds the preview token
 * 3. Returns the local proxy URL as the RemoteProxyConnectionString
 */
export async function startRemoteProxySession(
	bindings: Record<string, Binding>,
	options: StartRemoteProxySessionOptions
): Promise<RemoteProxySession> {
	if (Object.keys(bindings).length === 0) {
		throw new Error("Cannot start remote proxy session with no bindings");
	}

	const auth = await resolveAuth(options.auth);
	const workerName = options.workerName ?? "remote-bindings-proxy";
	const complianceRegion = options.complianceRegion;

	// Step 1: Create a preview session (gets a session token, exchanges if needed)
	let session: PreviewSession;
	try {
		session = await createPreviewSession(
			auth,
			workerName,
			complianceRegion,
			options.logger
		);
	} catch (error) {
		throw new Error("Failed to create remote preview session", {
			cause: error,
		});
	}

	// Step 2: Upload the ProxyServerWorker and get a preview token
	let token: PreviewToken;
	try {
		token = await createPreviewToken(
			auth,
			session,
			bindings,
			workerName,
			complianceRegion
		);
	} catch (error) {
		throw new Error("Failed to create remote preview token", {
			cause: error,
		});
	}

	// Step 3: Start a minimal local proxy that adds the preview token
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
				auth,
				session,
				newBindings,
				workerName,
				complianceRegion
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
