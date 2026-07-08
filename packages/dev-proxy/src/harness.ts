import { Response } from "miniflare";
import proxyWorkerScript from "virtual:proxy-worker";
import type {
	ProxyWorkerIncomingRequestBody,
	ProxyWorkerOutgoingRequestBody,
} from "./proxy-data";
import type { Miniflare, Request, WorkerOptions } from "miniflare";

/** The bundled ProxyWorker script, ready to pass to Miniflare as `contents`. */
export { proxyWorkerScript };

/**
 * The compatibility date/flags the ProxyWorker is instantiated with. `nodejs_compat`
 * is required because the worker bundles `node:*`-using helpers (e.g. `createDeferred`).
 */
const PROXY_WORKER_COMPATIBILITY_DATE = "2023-12-18";
const PROXY_WORKER_COMPATIBILITY_FLAGS = ["nodejs_compat"];

export interface ProxyWorkerHarnessOptions {
	/** Shared secret authenticating controller→worker control requests. */
	authSecret: string;
	/** Invoked for every message the ProxyWorker sends back to the controller. */
	onMessage: (message: ProxyWorkerOutgoingRequestBody) => void;
}

/**
 * Build the Miniflare `workers[]` entry that runs the ProxyWorker.
 *
 * Returned as a single worker entry (not full `MiniflareOptions`) so callers own
 * the top-level server options (host/port/https/logging) and can add sibling
 * workers (e.g. wrangler's InspectorProxyWorker). This is the single definition
 * of how the ProxyWorker is wired into Miniflare.
 */
export function createProxyWorkerOptions(
	options: ProxyWorkerHarnessOptions
): WorkerOptions {
	return {
		name: "ProxyWorker",
		compatibilityDate: PROXY_WORKER_COMPATIBILITY_DATE,
		compatibilityFlags: PROXY_WORKER_COMPATIBILITY_FLAGS,
		modules: [
			{
				type: "ESModule",
				path: "ProxyWorker.mjs",
				contents: proxyWorkerScript,
			},
		],
		durableObjects: {
			DURABLE_OBJECT: {
				className: "ProxyWorker",
				unsafePreventEviction: true,
			},
		},
		// Miniflare strips CF-Connecting-IP from outgoing fetches from a Worker (to fix
		// https://github.com/cloudflare/workers-sdk/issues/7924). However, the proxy
		// worker only makes outgoing requests to the user Worker, which _should_
		// receive CF-Connecting-IP.
		stripCfConnectingIp: false,
		serviceBindings: {
			PROXY_CONTROLLER: async (req: Request): Promise<Response> => {
				const message = (await req.json()) as ProxyWorkerOutgoingRequestBody;
				options.onMessage(message);
				return new Response(null, { status: 204 });
			},
		},
		bindings: {
			PROXY_CONTROLLER_AUTH_SECRET: options.authSecret,
		},
		// no need to use file-system, so don't
		cache: false,
		unsafeEphemeralDurableObjects: true,
	};
}

/**
 * Send a control message (`play`/`pause`) into a running ProxyWorker via the
 * `cf.hostMetadata` channel it listens on. This is the single definition of the
 * controller→worker protocol; callers layer their own retry/mutex/teardown
 * semantics on top.
 */
export async function sendProxyWorkerMessage(
	proxyWorker: Miniflare,
	authSecret: string,
	message: ProxyWorkerIncomingRequestBody
): Promise<void> {
	await proxyWorker.dispatchFetch(
		`http://dummy/cdn-cgi/ProxyWorker/${message.type}`,
		{
			headers: { Authorization: authSecret },
			cf: { hostMetadata: message },
		}
	);
}
