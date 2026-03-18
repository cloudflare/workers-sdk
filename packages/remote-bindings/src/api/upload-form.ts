import { createWorkerUploadForm } from "@cloudflare/workers-utils";
import proxyServerWorkerScript from "virtual:proxy-server-worker";
import type { Binding } from "@cloudflare/workers-utils";
import type { FormData } from "undici";

/**
 * Create a FormData upload for the ProxyServerWorker with the given bindings.
 *
 * Uses the shared createWorkerUploadForm with a minimal single-module worker.
 * All bindings are marked as raw (pass-through to real resources on the edge).
 */
export function createProxyWorkerUploadForm(
	bindings: Record<string, Binding>
): FormData {
	// Mark all bindings as raw so the edge gives the proxy worker
	// direct access to the real resources
	const rawBindings: Record<string, Binding> = {};
	for (const [name, binding] of Object.entries(bindings)) {
		rawBindings[name] = { ...binding, raw: true } as Binding;
	}

	return createWorkerUploadForm(
		{
			name: "remote-bindings-proxy",
			main: {
				name: "ProxyServerWorker.mjs",
				filePath: "ProxyServerWorker.mjs",
				type: "esm",
				content: proxyServerWorkerScript,
			},
			modules: [],
			migrations: undefined,
			compatibility_date: "2025-04-28",
			compatibility_flags: [],
			keepVars: undefined,
			keepSecrets: undefined,
			keepBindings: undefined,
			logpush: undefined,
			sourceMaps: undefined,
			placement: undefined,
			tail_consumers: undefined,
			limits: undefined,
			assets: undefined,
			containers: undefined,
			observability: undefined,
			cache: undefined,
		},
		rawBindings
	);
}
